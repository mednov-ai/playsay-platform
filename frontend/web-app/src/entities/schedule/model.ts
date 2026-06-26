import type { Course, CourseLesson, ScheduledLesson, ScheduledLessonMaterialAssignmentInput } from "../../shared/api/playsay";

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
};

export const LESSON_ACCESS_GRACE_MS = 10 * 60 * 1000;

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

  const parsedDuration = Number.parseInt(durationMinutes, 10);
  const safeDuration = Number.isFinite(parsedDuration) ? Math.max(1, parsedDuration) : 45;
  return new Date(new Date(startIso).getTime() + safeDuration * 60_000).toISOString();
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

export function isLessonCurrent(lesson: ScheduledLesson, nowMs: number): boolean {
  const startMs = dateValueMs(lesson.scheduledStart);
  const endMs = dateValueMs(lesson.scheduledEnd);
  return (startMs === null || startMs <= nowMs) && (endMs === null || endMs > nowMs);
}

export function isJoinableScheduledLesson(lesson: ScheduledLesson, nowMs = Date.now()): boolean {
  const startMs = dateValueMs(lesson.scheduledStart);
  const endMs = dateValueMs(lesson.scheduledEnd);
  return !isClosedScheduleStatus(lesson.status) &&
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

  if (lesson.status === "IN_PROGRESS" || isLessonCurrent(lesson, nowMs)) {
    return t("schedule.state.live");
  }

  return t("schedule.state.planned");
}

export function scheduleSortRank(lesson: ScheduledLesson, nowMs: number): number {
  if (!isJoinableScheduledLesson(lesson, nowMs)) {
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
