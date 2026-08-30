import type { Dispatch, SetStateAction } from "react";
import { classroomLessonIdFromPath, classroomPath } from "../routes";
import {
  type ClassroomMediaChoices,
  type LessonRoomSession,
} from "../../features/classroom";
import type { LessonAccessOrigin } from "../../shared/api/types";
import { participantAssignmentsFromLesson } from "../../entities/schedule/model";
import {
  createManagedStudentProfile,
  fetchLessonAccessLink,
  editScheduledLesson,
  completeScheduledLesson as completeScheduledLessonRequest,
  enterScheduledLessonRoom,
  fetchScheduledLessons,
  fetchStudentProfiles,
  removeScheduledLesson,
  rescheduleScheduledLesson as rescheduleScheduledLessonRequest,
  saveScheduledLesson,
  startScheduledLesson as startScheduledLessonRequest,
  type AdminUserProfile,
  type ManagedStudentInput,
  type MeProfile,
  type ScheduledLesson,
  type ScheduledLessonInput,
  type ScheduledLessonScheduleInput,
} from "../../shared/api/playsay";
import { useAppTranslation } from "../../shared/i18n";
import type { SessionErrorHandler } from "./types";

export function useScheduleActions({
  applySessionError,
  navigateToPath,
  profile,
  scheduledLessons,
  setMaterialLoading,
  setRoomLoadingLessonId,
  setRoomMessage,
  setRoomSession,
  setScheduleLoading,
  setScheduleMessage,
  setScheduledLessons,
  setStudentUsers,
  studentUsers,
}: {
  applySessionError: SessionErrorHandler;
  navigateToPath: (path: string) => void;
  profile: MeProfile | null;
  scheduledLessons: ScheduledLesson[];
  setMaterialLoading: Dispatch<SetStateAction<boolean>>;
  setRoomLoadingLessonId: Dispatch<SetStateAction<string | null>>;
  setRoomMessage: Dispatch<SetStateAction<string | null>>;
  setRoomSession: Dispatch<SetStateAction<LessonRoomSession | null>>;
  setScheduleLoading: Dispatch<SetStateAction<boolean>>;
  setScheduleMessage: Dispatch<SetStateAction<string | null>>;
  setScheduledLessons: Dispatch<SetStateAction<ScheduledLesson[]>>;
  setStudentUsers: Dispatch<SetStateAction<AdminUserProfile[]>>;
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();

  async function refreshSchedule() {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      const canManagePeople = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
      const [freshSchedule, freshStudents] = await Promise.all([
        fetchScheduledLessons(),
        canManagePeople ? fetchStudentProfiles() : Promise.resolve(studentUsers),
      ]);
      setScheduledLessons(freshSchedule);
      setStudentUsers(freshStudents);
      setScheduleMessage(t("schedule.messages.refreshed"));
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.refreshFailed")));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function createScheduledLesson(input: ScheduledLessonInput): Promise<ScheduledLesson | null> {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      const created = await saveScheduledLesson(input);
      const [freshSchedule, freshStudents] = await Promise.all([
        fetchScheduledLessons(),
        fetchStudentProfiles(),
      ]);
      setScheduledLessons(freshSchedule);
      setStudentUsers(freshStudents);
      const createdCount = input.recurrence?.mode === "WEEKLY_COUNT"
        ? input.recurrence.count
        : input.recurrence?.mode === "WEEKLY_BY_WEEK"
          ? input.recurrence.count * input.recurrence.weekdays.length
          : null;
      setScheduleMessage(createdCount ? t("schedule.messages.createdRecurring", { count: createdCount }) : t("schedule.messages.created"));
      return created;
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.createFailed")));
      return null;
    } finally {
      setScheduleLoading(false);
    }
  }

  async function startScheduledLesson(lesson: ScheduledLesson): Promise<void> {
    setRoomLoadingLessonId(lesson.id);
    setRoomMessage(null);
    try {
      const started = await startScheduledLessonRequest(lesson.id);
      setScheduledLessons((current) => current.map((item) => (item.id === lesson.id ? started : item)));
      await joinScheduledLesson(started);
    } catch (caught) {
      setRoomMessage(applySessionError(caught, t("schedule.messages.startFailed")));
    } finally {
      setRoomLoadingLessonId(null);
    }
  }

  async function createManagedStudent(input: ManagedStudentInput): Promise<AdminUserProfile | null> {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      const created = await createManagedStudentProfile(input);
      setStudentUsers((current) => upsertUserProfile(current, created));
      setScheduleMessage(t("schedule.messages.managedStudentCreated"));
      return created;
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.managedStudentCreateFailed")));
      return null;
    } finally {
      setScheduleLoading(false);
    }
  }

  async function copyScheduledLessonLinks(lesson: ScheduledLesson, origin: LessonAccessOrigin = "RU"): Promise<boolean> {
    setScheduleMessage(null);
    try {
      const text = fetchLessonAccessLink(lesson.id).then((link) => origin === "SCHOOL" ? link.urls.school : link.urls.ru);
      await copyText(text, t("schedule.messages.linksPromptTitle"));
      setScheduleMessage(t("schedule.messages.linksCopied"));
      return true;
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.linksCopyFailed")));
      return false;
    }
  }

  async function assignMaterialToScheduledLesson(lessonId: string, materialId: string | null): Promise<ScheduledLesson | null> {
    const lesson = scheduledLessons.find((item) => item.id === lessonId);
    if (!lesson) {
      setRoomMessage(t("schedule.messages.notFound"));
      return null;
    }

    setMaterialLoading(true);
    setRoomMessage(null);
    try {
      const updated = await editScheduledLesson(lessonId, {
        lessonTemplateId: lesson.lessonTemplateId ?? null,
        materialId,
        inheritTemplateMaterial: false,
        scheduledStart: lesson.scheduledStart ?? null,
        scheduledEnd: lesson.scheduledEnd ?? null,
        status: lesson.status as ScheduledLessonInput["status"],
        type: lesson.type === "INDIVIDUAL" ? "INDIVIDUAL" : "GROUP",
        workMode: lesson.workMode === "PARALLEL" ? "PARALLEL" : "SHARED",
        participantSubjects: lesson.participants.map((participant) => participant.subject),
        participantAssignments: participantAssignmentsFromLesson(lesson),
      });
      setScheduledLessons((current) => current.map((item) => (item.id === lessonId ? updated : item)));
      setRoomSession((current) => (
        current?.lessonId === lessonId
          ? {
              ...current,
              lessonEndsAt: updated.scheduledEnd ?? current.lessonEndsAt,
              lessonStartsAt: updated.scheduledStart ?? current.lessonStartsAt,
              lessonStatus: updated.status,
              lessonUpdatedAt: updated.updatedAt,
              lessonTitle: updated.lessonTitle ?? current.lessonTitle,
              lessonType: updated.type,
              workMode: updated.workMode,
              materialId: updated.materialId ?? null,
              participants: updated.participants,
            }
          : current
      ));
      setRoomMessage(materialId ? t("classroom.messages.materialAssigned") : t("classroom.messages.materialUnassigned"));
      return updated;
    } catch (caught) {
      setRoomMessage(applySessionError(caught, t("classroom.messages.materialAssignFailed")));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function cancelScheduledLesson(lesson: ScheduledLesson) {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      await editScheduledLesson(lesson.id, {
        lessonTemplateId: lesson.lessonTemplateId ?? null,
        materialId: lesson.inheritTemplateMaterial ? null : lesson.materialId ?? null,
        inheritTemplateMaterial: lesson.inheritTemplateMaterial,
        scheduledStart: lesson.scheduledStart ?? null,
        scheduledEnd: lesson.scheduledEnd ?? null,
        status: "CANCELLED",
        type: lesson.type === "INDIVIDUAL" ? "INDIVIDUAL" : "GROUP",
        workMode: lesson.workMode === "PARALLEL" ? "PARALLEL" : "SHARED",
        participantSubjects: lesson.participants.map((participant) => participant.subject),
        participantAssignments: participantAssignmentsFromLesson(lesson),
      });
      setScheduledLessons(await fetchScheduledLessons());
      setScheduleMessage(t("schedule.messages.cancelled"));
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.cancelFailed")));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function rescheduleScheduledLesson(
    lessonId: string,
    input: ScheduledLessonScheduleInput,
  ): Promise<ScheduledLesson | null> {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      const updated = await rescheduleScheduledLessonRequest(lessonId, input);
      setScheduledLessons((current) => current.map((lesson) => (lesson.id === lessonId ? updated : lesson)));
      setScheduleMessage(t("schedule.messages.rescheduled"));
      return updated;
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.rescheduleFailed")));
      return null;
    } finally {
      setScheduleLoading(false);
    }
  }

  async function completeScheduledLesson(lessonId: string) {
    setScheduleLoading(true);
    setRoomMessage(null);
    setScheduleMessage(null);
    try {
      const updated = await completeScheduledLessonRequest(lessonId);
      setScheduledLessons((current) => current.map((item) => (item.id === lessonId ? updated : item)));
      setRoomSession((current) => (current?.lessonId === lessonId ? null : current));
      setScheduleMessage(t("schedule.messages.completed"));
      if (classroomLessonIdFromPath(window.location.pathname)) {
        navigateToPath("/");
      }
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.completeFailed")));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function deleteScheduledLesson(lessonId: string) {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      await removeScheduledLesson(lessonId);
      setScheduledLessons((current) => current.filter((lesson) => lesson.id !== lessonId));
      setRoomSession((current) => (current?.roomName === `lesson-${lessonId}` ? null : current));
      setScheduleMessage(t("schedule.messages.deleted"));
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.deleteFailed")));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function joinScheduledLesson(
    lesson: ScheduledLesson,
    options: { updateRoute?: boolean } = {},
  ) {
    setRoomMessage(null);
    if (options.updateRoute ?? true) {
      navigateToPath(classroomPath(lesson.id));
    }
  }

  async function confirmScheduledLessonJoin(
    lesson: ScheduledLesson,
    mediaChoices: ClassroomMediaChoices,
  ) {
    setRoomLoadingLessonId(lesson.id);
    setRoomMessage(null);
    try {
      const token = await enterScheduledLessonRoom(lesson.id);
      setRoomSession({
        ...token,
        courseTitle: lesson.courseTitle ?? null,
        lessonId: lesson.id,
        lessonEndsAt: lesson.scheduledEnd ?? null,
        lessonTemplateId: lesson.lessonTemplateId ?? null,
        lessonStartsAt: lesson.scheduledStart ?? null,
        lessonStatus: lesson.status,
        lessonUpdatedAt: lesson.updatedAt,
        lessonTitle: lesson.lessonTitle ?? lesson.courseTitle ?? t("schedule.lessonFallbackTitle"),
        lessonType: lesson.type,
        workMode: lesson.workMode,
        materialId: lesson.materialId ?? null,
        participants: lesson.participants,
        participantPresence: {},
        teacherSubject: lesson.teacherSubject ?? null,
        teacherName: lesson.teacherName ?? null,
        mediaChoices,
      });
      setRoomMessage(t("classroom.messages.roomReady"));
    } catch (caught) {
      setRoomMessage(applySessionError(caught, t("classroom.messages.roomOpenFailed")));
    } finally {
      setRoomLoadingLessonId(null);
    }
  }

  function leaveScheduledLessonRoom() {
    closeClassroom(null);
  }

  function closeClassroom(message: string | null) {
    setRoomSession(null);
    setRoomMessage(message);
    if (classroomLessonIdFromPath(window.location.pathname)) {
      navigateToPath("/");
    }
  }

  return {
    assignMaterialToScheduledLesson,
    cancelScheduledLesson,
    completeScheduledLesson,
    confirmScheduledLessonJoin,
    closeClassroom,
    copyScheduledLessonLinks,
    createManagedStudent,
    createScheduledLesson,
    deleteScheduledLesson,
    joinScheduledLesson,
    leaveScheduledLessonRoom,
    refreshSchedule,
    rescheduleScheduledLesson,
    startScheduledLesson,
  };
}

function upsertUserProfile(users: AdminUserProfile[], user: AdminUserProfile): AdminUserProfile[] {
  const existing = users.some((item) => item.subject === user.subject);
  const nextUsers = existing
    ? users.map((item) => (item.subject === user.subject ? user : item))
    : [...users, user];
  return nextUsers.sort((left, right) => userLabel(left).localeCompare(userLabel(right)));
}

async function copyText(text: Promise<string>, promptTitle: string): Promise<void> {
  if (typeof ClipboardItem === "function" && typeof navigator.clipboard?.write === "function") {
    try {
      const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return;
    } catch {
      // A browser can expose ClipboardItem but reject clipboard.write for its own
      // permission policy. Reuse the already-started request in the fallback.
    }
  }

  const value = await text;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    window.prompt(promptTitle, value);
  }
}
function userLabel(user: AdminUserProfile): string {
  return user.displayName ?? user.name ?? user.username ?? user.email ?? user.subject;
}
