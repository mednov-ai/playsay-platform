import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { enterScheduledLessonRoom } from "../../shared/api/schedule";
import type { LiveKitRoomToken } from "../../shared/api/types";
import type { LessonRoomSession } from "../../features/classroom";
import {
  classifyMediaCredentialExpiry,
  mediaCredentialExpirySafetyMarginMs,
} from "../../features/classroom/model/liveKitRoomOptions";
import type { ClassroomMediaConnectionLifecycle } from "../../features/classroom/ui/ClassroomMediaConnectionObserver";
import type { ClassroomMediaRecoveryPhase } from "../../features/classroom/model/mediaRecovery";

export const classroomMediaReplacementDeadlineMs = 15_000;

export function useClassroomMediaRecovery({
  fetchFreshRoomToken = enterScheduledLessonRoom,
  now = Date.now,
  roomSession,
  setRoomSession,
}: {
  fetchFreshRoomToken?: (lessonId: string) => Promise<LiveKitRoomToken>;
  now?: () => number;
  roomSession: LessonRoomSession | null;
  setRoomSession: Dispatch<SetStateAction<LessonRoomSession | null>>;
}) {
  const [phase, setPhase] = useState<ClassroomMediaRecoveryPhase>("idle");
  const sessionRef = useRef(roomSession);
  const phaseRef = useRef(phase);
  const lifecycleRef = useRef<ClassroomMediaConnectionLifecycle | null>(null);
  const generationRef = useRef(0);
  const inFlightRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  sessionRef.current = roomSession;
  phaseRef.current = phase;

  const clearTimers = useCallback(() => {
    if (expiryTimerRef.current !== null) clearTimeout(expiryTimerRef.current);
    if (connectionTimerRef.current !== null) clearTimeout(connectionTimerRef.current);
    expiryTimerRef.current = null;
    connectionTimerRef.current = null;
  }, []);

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = null;
    lifecycleRef.current = null;
    clearTimers();
    phaseRef.current = "idle";
    setPhase("idle");
  }, [clearTimers]);

  const refresh = useCallback((forceNewGeneration = false): Promise<void> | null => {
    const session = sessionRef.current;
    if (!session) return null;

    if (!forceNewGeneration && inFlightRef.current) {
      return inFlightRef.current.promise;
    }
    if (forceNewGeneration) {
      generationRef.current += 1;
      inFlightRef.current = null;
    }

    clearTimers();
    lifecycleRef.current = null;
    const generation = generationRef.current;
    const lessonId = session.lessonId;
    phaseRef.current = "refreshing";
    setPhase("refreshing");

    const promise = fetchFreshRoomToken(lessonId)
      .then((token) => {
        if (
          generationRef.current !== generation
          || sessionRef.current?.lessonId !== lessonId
        ) return;

        setRoomSession((current) => (
          generationRef.current === generation && current?.lessonId === lessonId
            ? { ...current, ...token }
            : current
        ));
        phaseRef.current = "connecting";
        setPhase("connecting");
        connectionTimerRef.current = setTimeout(() => {
          if (
            generationRef.current === generation
            && sessionRef.current?.lessonId === lessonId
            && lifecycleRef.current !== "connected"
          ) {
            phaseRef.current = "failed";
            setPhase("failed");
          }
        }, classroomMediaReplacementDeadlineMs);
      })
      .catch(() => {
        if (
          generationRef.current === generation
          && sessionRef.current?.lessonId === lessonId
        ) {
          phaseRef.current = "failed";
          setPhase("failed");
        }
      })
      .finally(() => {
        if (inFlightRef.current?.generation === generation) {
          inFlightRef.current = null;
        }
      });

    inFlightRef.current = { generation, promise };
    return promise;
  }, [clearTimers, fetchFreshRoomToken, setRoomSession]);

  const onLifecycleChange = useCallback((lifecycle: ClassroomMediaConnectionLifecycle) => {
    if (lifecycle === "connected" && (phaseRef.current === "refreshing" || phaseRef.current === "failed")) return;
    lifecycleRef.current = lifecycle;
    if (lifecycle === "connected") {
      clearTimers();
      if (phaseRef.current !== "idle") {
        phaseRef.current = "idle";
        setPhase("idle");
      }
      return;
    }

    if (phaseRef.current !== "idle") return;
    const session = sessionRef.current;
    if (!session) return;

    const expiryClass = classifyMediaCredentialExpiry(session.mediaRouting, now());
    if (expiryClass === "expired" || expiryClass === "near-expiry" || expiryClass === "invalid") {
      void refresh();
      return;
    }
    if (expiryClass !== "safely-valid" || expiryTimerRef.current !== null) return;

    const expiresAtMs = Date.parse(session.mediaRouting!.expiresAt);
    const delayMs = Math.max(0, expiresAtMs - mediaCredentialExpirySafetyMarginMs - now());
    const generation = generationRef.current;
    const lessonId = session.lessonId;
    expiryTimerRef.current = setTimeout(() => {
      expiryTimerRef.current = null;
      if (
        generationRef.current === generation
        && sessionRef.current?.lessonId === lessonId
        && lifecycleRef.current !== "connected"
      ) {
        void refresh();
      }
    }, delayMs);
  }, [clearTimers, now, refresh]);

  const retry = useCallback(() => {
    void refresh(true);
  }, [refresh]);

  const lessonId = roomSession?.lessonId ?? null;
  useEffect(() => {
    invalidate();
  }, [invalidate, lessonId]);

  useEffect(() => () => {
    generationRef.current += 1;
    inFlightRef.current = null;
    clearTimers();
  }, [clearTimers]);

  return {
    cancel: invalidate,
    onLifecycleChange,
    phase,
    retry,
  };
}
