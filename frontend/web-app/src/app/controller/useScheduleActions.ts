import type { Dispatch, SetStateAction } from "react";
import { classroomLessonIdFromPath, classroomPath } from "../routes";
import {
  type LessonRoomSession,
} from "../../features/classroom";
import { participantAssignmentsFromLesson } from "../../entities/schedule/model";
import {
  editScheduledLesson,
  completeScheduledLesson as completeScheduledLessonRequest,
  enterScheduledLessonRoom,
  fetchScheduledLessons,
  fetchStudentProfiles,
  removeScheduledLesson,
  saveScheduledLesson,
  type AdminUserProfile,
  type MeProfile,
  type ScheduledLesson,
  type ScheduledLessonInput,
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

  async function createScheduledLesson(input: ScheduledLessonInput) {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      await saveScheduledLesson(input);
      setScheduledLessons(await fetchScheduledLessons());
      const createdCount = input.recurrence?.mode === "WEEKLY_COUNT" ? input.recurrence.count : null;
      setScheduleMessage(createdCount ? t("schedule.messages.createdRecurring", { count: createdCount }) : t("schedule.messages.created"));
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, t("schedule.messages.createFailed")));
    } finally {
      setScheduleLoading(false);
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
        materialId: lesson.materialId ?? null,
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
    setRoomLoadingLessonId(lesson.id);
    setRoomMessage(null);
    try {
      const token = await enterScheduledLessonRoom(lesson.id);
      if (options.updateRoute ?? true) {
        navigateToPath(classroomPath(lesson.id));
      }
      setRoomSession({
        ...token,
        courseTitle: lesson.courseTitle ?? null,
        lessonId: lesson.id,
        lessonEndsAt: lesson.scheduledEnd ?? null,
        lessonTemplateId: lesson.lessonTemplateId ?? null,
        lessonStartsAt: lesson.scheduledStart ?? null,
        lessonStatus: lesson.status,
        lessonTitle: lesson.lessonTitle ?? lesson.courseTitle ?? t("schedule.lessonFallbackTitle"),
        lessonType: lesson.type,
        workMode: lesson.workMode,
        materialId: lesson.materialId ?? null,
        participants: lesson.participants,
        teacherName: lesson.teacherName ?? null,
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
    closeClassroom,
    createScheduledLesson,
    deleteScheduledLesson,
    joinScheduledLesson,
    leaveScheduledLessonRoom,
    refreshSchedule,
  };
}
