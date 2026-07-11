import type { Course, CourseLesson, ScheduledLesson, ScheduledLessonInput, ScheduledLessonMaterialAssignmentInput } from "../../shared/api/playsay";

export type CourseLessonMap = Record<string, CourseLesson[]>;

export type CourseLessonOption = {
  id: string;
  label: string;
  materialId: string;
};

export type ScheduleTranslate = (key: string, options?: Record<string, unknown>) => string;

export type ScheduleFormState = {
  defaultParallelMaterialId: string;
  durationMinutes: string;
  lessonTemplateId: string;
  materialId: string;
  participantMaterialIds: Record<string, string>;
  scheduledDate: string;
  scheduledTime: string;
  type: "INDIVIDUAL" | "GROUP";
  workMode: "SHARED" | "PARALLEL";
  participantSubjects: string;
  recurrenceMode: "NONE" | "WEEKLY";
  recurrenceCount: string;
  recurrenceWeekdays: string[];
  recurrenceWeekdayTimes: Record<string, string>;
};

export const LESSON_ACCESS_GRACE_MS = 10 * 60 * 1000;
export const DURATION_PRESET_MINUTES = [30, 45, 60, 90] as const;
export const MIN_SCHEDULE_DURATION_MINUTES = 10;
export const MAX_SCHEDULE_DURATION_MINUTES = 180;
export const scheduleWeekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

export function formatDuration(value: number | null | undefined, t: ScheduleTranslate): string {
  return value ? t("schedule.duration.minutes", { count: value }) : t("schedule.duration.pending");
}

export function flattenCourseLessonOptions(
  courses: Course[],
  lessons: CourseLessonMap,
): CourseLessonOption[] {
  return courses.flatMap((course) =>
    (lessons[course.id] ?? []).map((lesson) => ({
      id: lesson.id,
      label: `${course.title} · ${lesson.orderIndex ?? "?"}. ${lesson.title}`,
      materialId: courseLessonDefaultMaterialId(lesson),
    })),
  );
}

export function courseLessonDefaultMaterialId(lesson: CourseLesson | undefined): string {
  if (!lesson) {
    return "";
  }
  const firstLessonCard = lesson.cards?.find((card) => card.role !== "HOMEWORK") ?? lesson.cards?.[0];
  return firstLessonCard?.materialId ?? lesson.materialId ?? "";
}

export function defaultScheduleForm(lessonTemplateId: string): ScheduleFormState {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);

  return {
    defaultParallelMaterialId: "",
    durationMinutes: "45",
    lessonTemplateId,
    materialId: "",
    participantMaterialIds: {},
    scheduledDate: toLocalDateValue(start),
    scheduledTime: toLocalTimeValue(start),
    type: "INDIVIDUAL",
    workMode: "SHARED",
    participantSubjects: "",
    recurrenceMode: "NONE",
    recurrenceCount: "4",
    recurrenceWeekdays: [],
    recurrenceWeekdayTimes: {},
  };
}

function toDateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toLocalDateValue(date: Date): string {
  return toDateTimeLocalValue(date).slice(0, 10);
}

function toLocalTimeValue(date: Date): string {
  return toDateTimeLocalValue(date).slice(11, 16);
}

export function localDateTimeToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function localScheduleDateTimeToIso(date: string, time: string): string | null {
  return date && time ? localDateTimeToIso(`${date}T${time}`) : null;
}

export function localScheduleEndIso(date: string, time: string, durationMinutes: string): string | null {
  const startIso = localScheduleDateTimeToIso(date, time);
  if (!startIso) {
    return null;
  }

  const safeDuration = normalizedDurationMinutes(durationMinutes);
  return new Date(new Date(startIso).getTime() + safeDuration * 60_000).toISOString();
}

export function normalizedDurationMinutes(value: string | number, fallback = 45): number {
  const parsedDuration = typeof value === "number" ? value : Number.parseInt(value, 10);
  const safeDuration = Number.isFinite(parsedDuration) ? parsedDuration : fallback;
  return Math.min(MAX_SCHEDULE_DURATION_MINUTES, Math.max(MIN_SCHEDULE_DURATION_MINUTES, safeDuration));
}

export function stepDurationMinutes(value: string, step: number): string {
  return String(normalizedDurationMinutes(normalizedDurationMinutes(value) + step));
}

export function weekdayFromLocalDate(date: string): string {
  const dayIndex = date ? new Date(`${date}T00:00:00`).getDay() : 1;
  const normalizedIndex = dayIndex === 0 ? 6 : dayIndex - 1;
  return scheduleWeekdays[normalizedIndex];
}

export function isWeeklyRecurrenceValid(form: ScheduleFormState): boolean {
  if (form.recurrenceMode !== "WEEKLY") {
    return true;
  }

  const count = Number.parseInt(form.recurrenceCount, 10);
  return Number.isInteger(count) &&
    count >= 1 &&
    count <= 52 &&
    form.recurrenceWeekdays.length > 0 &&
    form.recurrenceWeekdays.every((weekday) => Boolean(form.recurrenceWeekdayTimes[weekday]));
}

export function scheduleRecurrenceInput(
  form: ScheduleFormState,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): ScheduledLessonInput["recurrence"] | undefined {
  if (form.recurrenceMode !== "WEEKLY") {
    return undefined;
  }

  const count = Number.parseInt(form.recurrenceCount, 10);
  const weekdays = form.recurrenceWeekdays.length > 0
    ? form.recurrenceWeekdays
    : [weekdayFromLocalDate(form.scheduledDate)];
  const weekdayTimes = Object.fromEntries(
    weekdays.map((weekday) => [weekday, form.recurrenceWeekdayTimes[weekday] || form.scheduledTime]),
  );

  return {
    mode: "WEEKLY_BY_WEEK",
    count,
    weekdays,
    weekdayTimes,
    timeZone,
  };
}

export function formatDateTime(value: string | null | undefined, t: ScheduleTranslate): string {
  return value ? new Date(value).toLocaleString() : t("schedule.time.pending");
}

export function isClosedScheduleStatus(status: string): boolean {
  return status === "CANCELLED" || status === "COMPLETED";
}

export function dateValueMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isScheduleExpired(lesson: ScheduledLesson, nowMs = Date.now()): boolean {
  const endMs = dateValueMs(lesson.scheduledEnd);
  return endMs !== null && endMs + LESSON_ACCESS_GRACE_MS < nowMs;
}

export function isArchivedScheduleLesson(lesson: ScheduledLesson, nowMs = Date.now()): boolean {
  return isClosedScheduleStatus(lesson.status) || isScheduleExpired(lesson, nowMs);
}

export const isArchivedScheduledLesson = isArchivedScheduleLesson;

export function isLessonCurrent(lesson: ScheduledLesson, nowMs: number): boolean {
  const startMs = dateValueMs(lesson.scheduledStart);
  const endMs = dateValueMs(lesson.scheduledEnd);
  return (startMs === null || startMs <= nowMs) && (endMs === null || endMs > nowMs);
}

export function isJoinableScheduledLesson(lesson: ScheduledLesson, nowMs = Date.now()): boolean {
  const startMs = dateValueMs(lesson.scheduledStart);
  const endMs = dateValueMs(lesson.scheduledEnd);
  return lesson.status === "IN_PROGRESS" &&
    startMs !== null &&
    endMs !== null &&
    startMs - LESSON_ACCESS_GRACE_MS <= nowMs &&
    endMs + LESSON_ACCESS_GRACE_MS >= nowMs;
}

export function scheduleStateLabel(lesson: ScheduledLesson, nowMs: number, t: ScheduleTranslate): string {
  if (lesson.status === "CANCELLED") {
    return t("schedule.state.cancelled");
  }

  if (lesson.status === "COMPLETED" || isScheduleExpired(lesson, nowMs)) {
    return t("schedule.state.expired");
  }

  if (isJoinableScheduledLesson(lesson, nowMs)) {
    const startMs = dateValueMs(lesson.scheduledStart);
    const endMs = dateValueMs(lesson.scheduledEnd);
    if (startMs !== null && nowMs < startMs) {
      return t("schedule.state.opensSoon");
    }
    if (endMs !== null && nowMs > endMs) {
      return t("schedule.state.closingSoon");
    }
  }

  if (lesson.status === "IN_PROGRESS") {
    return t("schedule.state.live");
  }

  return t("schedule.state.planned");
}

export function scheduleSortRank(lesson: ScheduledLesson, nowMs: number): number {
  if (isArchivedScheduleLesson(lesson, nowMs)) {
    return 3;
  }

  if (lesson.status === "IN_PROGRESS" || isLessonCurrent(lesson, nowMs)) {
    return 0;
  }

  return dateValueMs(lesson.scheduledStart) === null ? 2 : 1;
}

export function compareScheduleLessons(left: ScheduledLesson, right: ScheduledLesson, nowMs: number): number {
  const leftRank = scheduleSortRank(left, nowMs);
  const rightRank = scheduleSortRank(right, nowMs);
  const rankDiff = leftRank - rightRank;
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const leftStartValue = dateValueMs(left.scheduledStart);
  const rightStartValue = dateValueMs(right.scheduledStart);
  const leftStart = leftStartValue ?? Number.MAX_SAFE_INTEGER;
  const rightStart = rightStartValue ?? Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) {
    if (leftRank === 3 && rightRank === 3) {
      return (rightStartValue ?? Number.MIN_SAFE_INTEGER) - (leftStartValue ?? Number.MIN_SAFE_INTEGER);
    }

    return leftStart - rightStart;
  }

  return (left.lessonTitle ?? left.courseTitle ?? left.id).localeCompare(right.lessonTitle ?? right.courseTitle ?? right.id);
}

export function compareJoinableLessons(left: ScheduledLesson, right: ScheduledLesson, nowMs: number): number {
  return compareScheduleLessons(left, right, nowMs);
}

export function splitScheduleLessonsForDashboard(
  lessons: ScheduledLesson[],
  nowMs: number,
): { archivedLessons: ScheduledLesson[]; mainLessons: ScheduledLesson[] } {
  const orderedLessons = [...lessons].sort((left, right) => compareScheduleLessons(left, right, nowMs));
  return {
    mainLessons: orderedLessons.filter((lesson) => !isArchivedScheduleLesson(lesson, nowMs)),
    archivedLessons: orderedLessons.filter((lesson) => isArchivedScheduleLesson(lesson, nowMs)),
  };
}

export function formatLessonRange(
  start: string | null | undefined,
  end: string | null | undefined,
  t: ScheduleTranslate,
): string {
  if (!start && !end) {
    return t("schedule.time.pending");
  }

  if (!start) {
    return t("schedule.time.until", { time: formatDateTime(end, t) });
  }

  if (!end) {
    return t("schedule.time.from", { time: formatDateTime(start, t) });
  }

  return t("schedule.time.range", {
    start: formatDateTime(start, t),
    end: new Date(end).toLocaleTimeString(),
  });
}

export function formatLessonType(value: string, t: ScheduleTranslate): string {
  return value === "INDIVIDUAL" ? t("schedule.lessonType.individual") : t("schedule.lessonType.group");
}

export function formatParticipantCount(value: number, t: ScheduleTranslate): string {
  if (value === 0) {
    return t("schedule.participants.none");
  }

  return t("schedule.participants.count", { count: value });
}

export function selectedParticipantSubjects(value: string): string[] {
  return value
    .split(",")
    .map((subject) => subject.trim())
    .filter(Boolean);
}

export function participantAssignmentsFromLesson(lesson: ScheduledLesson): ScheduledLessonMaterialAssignmentInput[] {
  const grouped = new Map<string, string[]>();
  lesson.participants.forEach((participant) => {
    if (!participant.materialId) {
      return;
    }
    grouped.set(participant.materialId, [...(grouped.get(participant.materialId) ?? []), participant.subject]);
  });

  return Array.from(grouped.entries()).map(([materialId, participantSubjects]) => ({
    materialId,
    participantSubjects,
  }));
}
