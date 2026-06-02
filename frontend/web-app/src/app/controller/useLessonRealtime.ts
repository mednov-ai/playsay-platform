import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { isJoinableScheduledLesson } from "../../entities/schedule/model";
import {
  buildLessonRealtimeUrl,
  isRoomSessionExpired,
  roomSessionFromScheduledLesson,
  type LessonRoomSession,
  upsertScheduledLesson,
} from "../../features/classroom";
import {
  fetchScheduledLessons,
  getValidAccessToken,
  type MeProfile,
  type ScheduledLesson,
} from "../../shared/api/playsay";
import { useAppTranslation } from "../../shared/i18n";
import type { SessionStatus } from "../../features/profile/ui/ProfileAccountPanel";
import type { SessionErrorHandler } from "./types";

type LessonRealtimeMessage = {
  type?: string;
  lesson?: ScheduledLesson;
  lessonId?: string;
  message?: string;
};

export function useLessonRealtime({
  applySessionError,
  closeClassroom,
  nowMs,
  profile,
  roomSession,
  setRoomSession,
  setScheduleMessage,
  setScheduledLessons,
  status,
}: {
  applySessionError: SessionErrorHandler;
  closeClassroom: (message: string | null) => void;
  nowMs: number;
  profile: MeProfile | null;
  roomSession: LessonRoomSession | null;
  setRoomSession: Dispatch<SetStateAction<LessonRoomSession | null>>;
  setScheduleMessage: Dispatch<SetStateAction<string | null>>;
  setScheduledLessons: Dispatch<SetStateAction<ScheduledLesson[]>>;
  status: SessionStatus;
}) {
  const { t } = useAppTranslation();
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeReconnectTimerRef = useRef<number | null>(null);
  const roomSessionRef = useRef<LessonRoomSession | null>(null);
  const scheduleSyncInFlightRef = useRef(false);

  useEffect(() => {
    roomSessionRef.current = roomSession;
  }, [roomSession]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const canManageSchedule = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
    if (!canManageSchedule) {
      setScheduledLessons((current) => current.filter((lesson) => isJoinableScheduledLesson(lesson, nowMs)));
    }

    if (roomSession && isRoomSessionExpired(roomSession, nowMs)) {
      closeClassroom(t("schedule.messages.finished"));
    }
  }, [nowMs, profile?.roles, roomSession, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
      if (realtimeReconnectTimerRef.current !== null) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      return undefined;
    }

    let closed = false;

    async function connectRealtime() {
      const accessToken = await getValidAccessToken();
      if (closed || !accessToken) {
        return;
      }

      const socket = new WebSocket(buildLessonRealtimeUrl(), ["playsay", accessToken]);
      realtimeSocketRef.current = socket;

      socket.onopen = () => {
        const activeLessonId = roomSessionRef.current?.lessonId;
        if (activeLessonId) {
          sendLessonRealtimeSubscribe(activeLessonId);
        }
      };

      socket.onmessage = (event) => {
        handleLessonRealtimeMessage(event.data);
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        if (realtimeSocketRef.current === socket) {
          realtimeSocketRef.current = null;
        }
        if (!closed) {
          realtimeReconnectTimerRef.current = window.setTimeout(() => {
            realtimeReconnectTimerRef.current = null;
            void connectRealtime();
          }, 2_000);
        }
      };
    }

    void connectRealtime();

    return () => {
      closed = true;
      if (realtimeReconnectTimerRef.current !== null) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
    };
  }, [status]);

  useEffect(() => {
    if (roomSession?.lessonId) {
      sendLessonRealtimeSubscribe(roomSession.lessonId);
    }
  }, [roomSession?.lessonId]);

  async function syncScheduleFromServer(options: { message?: string } = {}) {
    if (scheduleSyncInFlightRef.current) {
      return;
    }

    scheduleSyncInFlightRef.current = true;
    try {
      const freshSchedule = await fetchScheduledLessons();
      setScheduledLessons(freshSchedule);
      if (options.message) {
        setScheduleMessage(options.message);
      }
    } catch (caught) {
      applySessionError(caught, t("schedule.messages.scheduleSyncFailed"));
    } finally {
      scheduleSyncInFlightRef.current = false;
    }
  }

  function handleLessonRealtimeMessage(rawPayload: string) {
    let message: LessonRealtimeMessage;
    try {
      message = JSON.parse(rawPayload) as LessonRealtimeMessage;
    } catch {
      return;
    }

    if (message.type === "schedule.changed") {
      void syncScheduleFromServer();
      return;
    }

    if (message.type === "lesson.updated" && message.lesson) {
      applyRealtimeLessonSnapshot(message.lesson);
      return;
    }

    if (message.type === "lesson.deleted" && message.lessonId) {
      removeRealtimeLesson(message.lessonId, t("schedule.messages.unavailable"));
    }
  }

  function applyRealtimeLessonSnapshot(lesson: ScheduledLesson) {
    const currentTimeMs = Date.now();
    const canManageSchedule = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
    const canKeepInSchedule = canManageSchedule || isJoinableScheduledLesson(lesson, currentTimeMs);

    setScheduledLessons((current) => (
      canKeepInSchedule
        ? upsertScheduledLesson(current, lesson)
        : current.filter((item) => item.id !== lesson.id)
    ));

    if (roomSessionRef.current?.lessonId !== lesson.id) {
      return;
    }

    if (!isJoinableScheduledLesson(lesson, currentTimeMs)) {
      closeClassroom(t("schedule.messages.finishedOrCancelled"));
      return;
    }

    setRoomSession((current) => (
      current?.lessonId === lesson.id
        ? roomSessionFromScheduledLesson(current, lesson)
        : current
    ));
  }

  function removeRealtimeLesson(lessonId: string, message: string) {
    setScheduledLessons((current) => current.filter((lesson) => lesson.id !== lessonId));
    if (roomSessionRef.current?.lessonId === lessonId) {
      closeClassroom(message);
    }
  }

  function sendLessonRealtimeSubscribe(lessonId: string) {
    const socket = realtimeSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      socket.send(JSON.stringify({ type: "subscribe.lesson", lessonId }));
    } catch {
      socket.close();
    }
  }
}
