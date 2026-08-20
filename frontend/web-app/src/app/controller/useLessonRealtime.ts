import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { isArchivedScheduleLesson, isJoinableScheduledLesson } from "../../entities/schedule/model";
import {
  buildLessonRealtimeUrl,
  isRoomSessionExpired,
  roomSessionFromScheduledLesson,
  type LessonDiceController,
  type LessonDiceRejection,
  type LessonDiceRejectionCode,
  type LessonDiceRoll,
  type LessonParticipantPresenceMap,
  type LessonParticipantPresenceState,
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
import { publishHomeworkAssignmentChange } from "../../features/homework/model/homeworkRealtime";
import { realtimeReconnectDelayMs } from "../../features/classroom/model/realtimeLifecycle";

type LessonRealtimeMessage = {
  type?: string;
  lesson?: ScheduledLesson;
  lessonId?: string;
  assignmentId?: string;
  change?: string;
  participants?: Array<{ subject?: string; state?: string }>;
  message?: string;
  eventId?: string;
  requestId?: string;
  value?: number;
  rollerSubject?: string;
  rollerName?: string;
  rolledAt?: string;
  cooldownUntil?: string;
  code?: string;
  retryAt?: string;
};

export function useLessonRealtime({
  applySessionError,
  classroomLessonId,
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
  classroomLessonId: string | null;
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
  const [lastDiceRoll, setLastDiceRoll] = useState<LessonDiceRoll | null>(null);
  const [liveDiceRoll, setLiveDiceRoll] = useState<LessonDiceRoll | null>(null);
  const [diceRejection, setDiceRejection] = useState<LessonDiceRejection | null>(null);
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeReconnectTimerRef = useRef<number | null>(null);
  const realtimeReconnectAttemptRef = useRef(0);
  const roomSessionRef = useRef<LessonRoomSession | null>(null);
  const activeLessonIdRef = useRef<string | null>(null);
  const checkingDevicesRef = useRef(false);
  const reportedCheckingLessonIdRef = useRef<string | null>(null);
  const scheduleSyncInFlightRef = useRef(false);
  const scheduleSyncPendingRef = useRef(false);
  const syncScheduleFromServerRef = useRef<(options?: { message?: string }) => Promise<void>>(async () => undefined);
  const roomSessionLessonId = roomSession?.lessonId ?? null;
  const activeLessonId = roomSessionLessonId ?? classroomLessonId;
  const checkingDevices = Boolean(
    classroomLessonId &&
    !roomSessionLessonId &&
    profile?.roles.includes("STUDENT"),
  );

  useEffect(() => {
    roomSessionRef.current = roomSession;
  }, [roomSession]);

  useEffect(() => {
    if (!roomSessionLessonId) {
      setLastDiceRoll(null);
      setLiveDiceRoll(null);
      setDiceRejection(null);
      return;
    }
    setLastDiceRoll((current) => current?.lessonId === roomSessionLessonId ? current : null);
    setLiveDiceRoll((current) => current?.lessonId === roomSessionLessonId ? current : null);
    setDiceRejection((current) => current?.lessonId === roomSessionLessonId ? current : null);
  }, [roomSessionLessonId]);

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
    const scheduleRealtimeReconnect = () => {
      if (closed || realtimeReconnectTimerRef.current !== null) return;
      const reconnectDelay = realtimeReconnectDelayMs(realtimeReconnectAttemptRef.current);
      realtimeReconnectAttemptRef.current += 1;
      realtimeReconnectTimerRef.current = window.setTimeout(() => {
        realtimeReconnectTimerRef.current = null;
        void connectRealtime();
      }, reconnectDelay);
    };

    async function connectRealtime() {
      let accessToken: string | null | undefined;
      try {
        accessToken = await getValidAccessToken();
      } catch {
        scheduleRealtimeReconnect();
        return;
      }
      if (closed) {
        return;
      }
      if (!accessToken) {
        scheduleRealtimeReconnect();
        return;
      }

      const socket = new WebSocket(buildLessonRealtimeUrl(), ["playsay", accessToken]);
      realtimeSocketRef.current = socket;

      socket.onopen = () => {
        realtimeReconnectAttemptRef.current = 0;
        void syncScheduleFromServerRef.current();
        const lessonId = activeLessonIdRef.current;
        if (lessonId) {
          sendLessonRealtimeSubscribe(lessonId);
          if (checkingDevicesRef.current) sendLessonPresenceUpdate(lessonId, "CHECKING_DEVICES");
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
        scheduleRealtimeReconnect();
      };
    }

    const reconnectNow = () => {
      if (closed) return;
      const current = realtimeSocketRef.current;
      if (current?.readyState === WebSocket.OPEN || current?.readyState === WebSocket.CONNECTING) return;
      if (realtimeReconnectTimerRef.current !== null) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      void connectRealtime();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") reconnectNow();
    };
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void connectRealtime();

    return () => {
      closed = true;
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (realtimeReconnectTimerRef.current !== null) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
    };
  }, [status]);

  useEffect(() => {
    const previouslyCheckingLessonId = reportedCheckingLessonIdRef.current;
    if (previouslyCheckingLessonId && (!checkingDevices || previouslyCheckingLessonId !== classroomLessonId)) {
      sendLessonPresenceUpdate(previouslyCheckingLessonId, "ONLINE");
    }

    activeLessonIdRef.current = activeLessonId;
    checkingDevicesRef.current = checkingDevices;
    reportedCheckingLessonIdRef.current = checkingDevices ? classroomLessonId : null;

    if (activeLessonId) sendLessonRealtimeSubscribe(activeLessonId);
    if (checkingDevices && classroomLessonId) sendLessonPresenceUpdate(classroomLessonId, "CHECKING_DEVICES");
  }, [activeLessonId, checkingDevices, classroomLessonId, roomSessionLessonId]);

  useEffect(() => {
    if (status !== "authenticated" || !activeLessonId) return undefined;

    const reconcileActiveLesson = () => {
      void syncScheduleFromServerRef.current();
    };
    const intervalId = window.setInterval(reconcileActiveLesson, 15_000);
    window.addEventListener("focus", reconcileActiveLesson);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", reconcileActiveLesson);
    };
  }, [activeLessonId, status]);

  async function syncScheduleFromServer(options: { message?: string } = {}) {
    if (scheduleSyncInFlightRef.current) {
      scheduleSyncPendingRef.current = true;
      return;
    }

    scheduleSyncInFlightRef.current = true;
    try {
      do {
        scheduleSyncPendingRef.current = false;
        try {
          const freshSchedule = await fetchScheduledLessons();
          setScheduledLessons(freshSchedule);
          const activeSession = roomSessionRef.current;
          const activeLesson = activeSession
            ? freshSchedule.find((lesson) => lesson.id === activeSession.lessonId)
            : null;
          if (activeLesson) {
            applyRealtimeLessonSnapshot(activeLesson);
          }
          if (options.message) {
            setScheduleMessage(options.message);
          }
        } catch (caught) {
          applySessionError(caught, t("schedule.messages.scheduleSyncFailed"));
        }
      } while (scheduleSyncPendingRef.current);
    } finally {
      scheduleSyncInFlightRef.current = false;
    }
  }
  syncScheduleFromServerRef.current = syncScheduleFromServer;

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

    if (message.type === "assignment.changed" && message.assignmentId) {
      publishHomeworkAssignmentChange({
        assignmentId: message.assignmentId,
        change: message.change ?? "UPDATED",
      });
      return;
    }

    if (message.type === "lesson.updated" && message.lesson) {
      applyRealtimeLessonSnapshot(message.lesson);
      return;
    }

    if (message.type === "lesson.deleted" && message.lessonId) {
      removeRealtimeLesson(message.lessonId, t("schedule.messages.unavailable"));
      return;
    }

    if (message.type === "lesson.presence" && message.lessonId && message.participants) {
      applyLessonPresence(message.lessonId, lessonPresenceMap(message.participants));
      return;
    }

    if ((message.type === "tool.dice.rolled" || message.type === "tool.dice.snapshot")) {
      const roll = lessonDiceRoll(message);
      if (!roll) return;
      setLastDiceRoll(roll);
      setDiceRejection(null);
      if (message.type === "tool.dice.rolled") {
        setLiveDiceRoll(roll);
      }
      return;
    }

    if (message.type === "tool.dice.rejected") {
      const rejection = lessonDiceRejection(message);
      if (rejection) setDiceRejection(rejection);
    }
  }

  function applyLessonPresence(lessonId: string, participantPresence: LessonParticipantPresenceMap) {
    setRoomSession((current) => (
      current?.lessonId === lessonId
        ? { ...current, participantPresence }
        : current
    ));
  }

  function applyRealtimeLessonSnapshot(lesson: ScheduledLesson) {
    const currentTimeMs = Date.now();
    const canManageSchedule = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
    const canKeepInSchedule = canManageSchedule || !isArchivedScheduleLesson(lesson, currentTimeMs);

    setScheduledLessons((current) => (
      canKeepInSchedule
        ? upsertScheduledLesson(current, lesson)
        : current.filter((item) => item.id !== lesson.id)
    ));

    if (roomSessionRef.current?.lessonId !== lesson.id) {
      return;
    }

    if (!isJoinableScheduledLesson(lesson, currentTimeMs)) {
      const currentSession = roomSessionRef.current;
      closeClassroom(t(realtimeClassroomClosureMessageKey(lesson, currentSession?.lessonStatus)));
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
    sendLessonRealtimeMessage({ type: "subscribe.lesson", lessonId });
  }

  function sendLessonPresenceUpdate(lessonId: string, state: Exclude<LessonParticipantPresenceState, "OFFLINE">) {
    sendLessonRealtimeMessage({ type: "presence.update", lessonId, state });
  }

  function rollDice() {
    const lessonId = roomSessionRef.current?.lessonId;
    if (!lessonId) return;
    setDiceRejection(null);
    sendLessonRealtimeMessage({
      type: "tool.dice.roll",
      lessonId,
      requestId: crypto.randomUUID(),
    });
  }

  function sendLessonRealtimeMessage(message: Record<string, string>) {
    const socket = realtimeSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      socket.send(JSON.stringify(message));
    } catch {
      socket.close();
    }
  }

  const dice: LessonDiceController = {
    lastRoll: lastDiceRoll,
    liveRoll: liveDiceRoll,
    rejection: diceRejection,
    roll: rollDice,
  };
  return { dice };
}

export function lessonDiceRoll(message: LessonRealtimeMessage): LessonDiceRoll | null {
  if (
    !message.eventId ||
    !message.lessonId ||
    !message.requestId ||
    !Number.isInteger(message.value) ||
    (message.value ?? 0) < 1 ||
    (message.value ?? 0) > 6 ||
    !message.rollerSubject ||
    !message.rollerName ||
    !message.rolledAt ||
    !message.cooldownUntil
  ) {
    return null;
  }
  return {
    eventId: message.eventId,
    lessonId: message.lessonId,
    requestId: message.requestId,
    value: message.value as LessonDiceRoll["value"],
    rollerSubject: message.rollerSubject,
    rollerName: message.rollerName,
    rolledAt: message.rolledAt,
    cooldownUntil: message.cooldownUntil,
  };
}

export function lessonDiceRejection(message: LessonRealtimeMessage): LessonDiceRejection | null {
  const allowedCodes = new Set<LessonDiceRejectionCode>(["COOLDOWN", "LESSON_NOT_ACTIVE", "FORBIDDEN"]);
  if (!allowedCodes.has(message.code as LessonDiceRejectionCode)) return null;
  return {
    code: message.code as LessonDiceRejectionCode,
    lessonId: message.lessonId ?? null,
    requestId: message.requestId ?? null,
    retryAt: message.retryAt ?? null,
  };
}

export function lessonPresenceMap(
  participants: Array<{ subject?: string; state?: string }>,
): LessonParticipantPresenceMap {
  const allowedStates = new Set<LessonParticipantPresenceState>(["OFFLINE", "ONLINE", "CHECKING_DEVICES"]);
  return participants.reduce<LessonParticipantPresenceMap>((result, participant) => {
    if (participant.subject && allowedStates.has(participant.state as LessonParticipantPresenceState)) {
      result[participant.subject] = participant.state as LessonParticipantPresenceState;
    }
    return result;
  }, {});
}

export function realtimeClassroomClosureMessageKey(
  lesson: ScheduledLesson,
  previousStatus: string | null | undefined,
): "schedule.messages.rescheduledClassroomClosed" | "schedule.messages.finishedOrCancelled" {
  return lesson.status === "SCHEDULED" && previousStatus === "IN_PROGRESS"
    ? "schedule.messages.rescheduledClassroomClosed"
    : "schedule.messages.finishedOrCancelled";
}
