import { LESSON_ACCESS_GRACE_MS, dateValueMs, isClosedScheduleStatus } from "../../../entities/schedule/model";
import type { LiveKitRoomToken, ScheduledLesson } from "../../../shared/api/playsay";

export type ClassroomMediaChoices = {
  audioDeviceId: string;
  audioEnabled: boolean;
  audioOutputDeviceId: string;
  videoDeviceId: string;
  videoEnabled: boolean;
};

export type LessonRoomSession = LiveKitRoomToken & {
  courseTitle: string | null;
  lessonId: string;
  lessonEndsAt: string | null;
  lessonTemplateId: string | null;
  lessonStartsAt: string | null;
  lessonStatus: string;
  lessonUpdatedAt: string;
  lessonTitle: string;
  lessonType: string;
  workMode: string;
  materialId: string | null;
  participants: ScheduledLesson["participants"];
  teacherSubject: string | null;
  teacherName: string | null;
  mediaChoices: ClassroomMediaChoices;
};

export function upsertScheduledLesson(current: ScheduledLesson[], lesson: ScheduledLesson): ScheduledLesson[] {
  if (current.some((item) => item.id === lesson.id)) {
    return current.map((item) => (item.id === lesson.id ? lesson : item));
  }

  return [lesson, ...current];
}

export function roomSessionFromScheduledLesson(
  session: LessonRoomSession,
  lesson: ScheduledLesson,
): LessonRoomSession {
  return {
    ...session,
    courseTitle: lesson.courseTitle ?? session.courseTitle,
    lessonEndsAt: lesson.scheduledEnd ?? null,
    lessonStartsAt: lesson.scheduledStart ?? null,
    lessonStatus: lesson.status,
    lessonUpdatedAt: lesson.updatedAt,
    lessonTemplateId: lesson.lessonTemplateId ?? null,
    lessonTitle: lesson.lessonTitle ?? lesson.courseTitle ?? session.lessonTitle,
    lessonType: lesson.type,
    workMode: lesson.workMode,
    materialId: lesson.materialId ?? null,
    participants: lesson.participants,
    teacherSubject: lesson.teacherSubject ?? session.teacherSubject,
    teacherName: lesson.teacherName ?? session.teacherName,
  };
}

export function buildLessonRealtimeUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ws/lessons`;
}

export function isRoomSessionExpired(session: LessonRoomSession, nowMs = Date.now()): boolean {
  if (isClosedScheduleStatus(session.lessonStatus)) {
    return true;
  }

  const endMs = dateValueMs(session.lessonEndsAt);
  return endMs !== null && endMs + LESSON_ACCESS_GRACE_MS < nowMs;
}
