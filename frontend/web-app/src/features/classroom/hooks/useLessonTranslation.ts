import { useRoomContext, useRemoteParticipants } from "@livekit/components-react";
import { RoomEvent, Track, type Participant, type RemoteParticipant } from "livekit-client";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ApiError, createLessonTranslationSession } from "../../../shared/api/playsay";
import {
  appendTranscriptDelta,
  connectRealtimeTranslation,
  lessonTranslationEligible,
  translationCollisionWinner,
  type RealtimeTranslationSidecar,
  type TranslationRole,
} from "../model/realtimeTranslation";

const translationTopic = "playsay.translation.v1";
const captureTailMs = 300;
const outputQuietMs = 700;
const firstOutputWaitMs = 1_500;
const maxDrainMs = 8_000;
const maxUtteranceMs = 30_000;

type TranslationStatus = "disabled" | "waiting" | "connecting" | "ready" | "starting" | "speaking" | "receiving" | "draining" | "error";
type TranslationMessage = {
  type: "state" | "press" | "started" | "release" | "cancel" | "done" | "unavailable";
  enabled?: boolean;
  ready?: boolean;
  role?: TranslationRole;
  utteranceId?: string;
  errorCode?: string;
};

type IncomingUtterance = {
  id: string;
  released: boolean;
  started: boolean;
};

export type LessonTranslationController = {
  beginPress: () => void;
  canEnable: boolean;
  canPress: boolean;
  captions: Array<{ id: string; text: string }>;
  enable: () => void;
  endPress: () => void;
  errorCode: string | null;
  localEnabled: boolean;
  remoteEnabled: boolean;
  status: TranslationStatus;
  targetLanguage: string | null;
};

export function useLessonTranslation({
  allowed,
  lessonId,
  lessonType,
  role,
}: {
  allowed: boolean;
  lessonId: string;
  lessonType: string;
  role: TranslationRole | null;
}): LessonTranslationController {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const [localEnabled, setLocalEnabled] = useState(false);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [status, setStatusState] = useState<TranslationStatus>("disabled");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Array<{ id: string; text: string }>>([]);
  const [retryNonce, setRetryNonce] = useState(0);
  const [trackRevision, setTrackRevision] = useState(0);
  const sidecarRef = useRef<RealtimeTranslationSidecar | null>(null);
  const remoteParticipantRef = useRef<RemoteParticipant | null>(null);
  const previousVolumeRef = useRef(1);
  const outgoingRef = useRef<string | null>(null);
  const outgoingReleasedRef = useRef(false);
  const incomingRef = useRef<IncomingUtterance | null>(null);
  const localEnabledRef = useRef(false);
  const remoteEnabledRef = useRef(false);
  const localReadyRef = useRef(false);
  const remoteReadyRef = useRef(false);
  const statusRef = useRef<TranslationStatus>("disabled");
  const quietTimerRef = useRef<number | null>(null);
  const hardDrainTimerRef = useRef<number | null>(null);
  const utteranceTimerRef = useRef<number | null>(null);
  const startAckTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptsRef = useRef(0);

  const updateStatus = useCallback((next: TranslationStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const eligible = lessonTranslationEligible({
    allowed,
    lessonType,
    remoteParticipantCount: remoteParticipants.length,
    role,
  });

  useEffect(() => { localEnabledRef.current = localEnabled; }, [localEnabled]);
  useEffect(() => { remoteEnabledRef.current = remoteEnabled; }, [remoteEnabled]);
  useEffect(() => { localReadyRef.current = localReady; }, [localReady]);
  useEffect(() => { remoteReadyRef.current = remoteReady; }, [remoteReady]);
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    if (!eligible) return undefined;
    const bumpTrackRevision = () => setTrackRevision((current) => current + 1);
    room.on(RoomEvent.TrackSubscribed, bumpTrackRevision);
    room.on(RoomEvent.TrackUnsubscribed, bumpTrackRevision);
    return () => {
      room.off(RoomEvent.TrackSubscribed, bumpTrackRevision);
      room.off(RoomEvent.TrackUnsubscribed, bumpTrackRevision);
    };
  }, [eligible, room]);

  const remoteIdentity = useCallback(() => remoteParticipants[0]?.identity ?? null, [remoteParticipants]);
  const send = useCallback((message: TranslationMessage) => {
    const identity = remoteIdentity();
    if (!identity) return;
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    void room.localParticipant.publishData(bytes, {
      reliable: true,
      topic: translationTopic,
      destinationIdentities: [identity],
    });
  }, [remoteIdentity, room.localParticipant]);

  const clearTimer = (timer: MutableRefObject<number | null>) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const restoreOriginal = useCallback(() => {
    remoteParticipantRef.current?.setVolume(previousVolumeRef.current, Track.Source.Microphone);
  }, []);

  const resetToReady = useCallback(() => {
    clearTimer(utteranceTimerRef);
    clearTimer(startAckTimerRef);
    outgoingRef.current = null;
    outgoingReleasedRef.current = false;
    updateStatus(localReadyRef.current && remoteReadyRef.current ? "ready" : "waiting");
  }, [updateStatus]);

  const finishIncoming = useCallback((notify = true) => {
    const incoming = incomingRef.current;
    if (!incoming) return;
    clearTimer(quietTimerRef);
    clearTimer(hardDrainTimerRef);
    incomingRef.current = null;
    void sidecarRef.current?.stop();
    restoreOriginal();
    if (notify) send({ type: "done", utteranceId: incoming.id });
    updateStatus(localReadyRef.current && remoteReadyRef.current ? "ready" : "waiting");
  }, [restoreOriginal, send, updateStatus]);

  const scheduleIncomingCompletion = useCallback((firstOutput: boolean) => {
    clearTimer(quietTimerRef);
    quietTimerRef.current = window.setTimeout(() => finishIncoming(), firstOutput ? firstOutputWaitMs : outputQuietMs);
    if (hardDrainTimerRef.current === null) {
      hardDrainTimerRef.current = window.setTimeout(() => finishIncoming(), maxDrainMs);
    }
  }, [finishIncoming]);

  const failTranslation = useCallback((code = "LESSON_TRANSLATION_CONNECTION_FAILED") => {
    const outgoing = outgoingRef.current;
    if (outgoing) send({ type: "cancel", utteranceId: outgoing });
    clearTimer(utteranceTimerRef);
    clearTimer(startAckTimerRef);
    finishIncoming(false);
    outgoingRef.current = null;
    outgoingReleasedRef.current = false;
    sidecarRef.current?.close();
    sidecarRef.current = null;
    setLocalReady(false);
    localReadyRef.current = false;
    setErrorCode(code);
    updateStatus("error");
    send({ type: "unavailable", errorCode: code });
    const retryable = code === "LESSON_TRANSLATION_CONNECTION_FAILED" || code === "LESSON_TRANSLATION_PROVIDER_UNAVAILABLE";
    if (retryable && localEnabledRef.current && remoteEnabledRef.current && retryAttemptsRef.current < 3) {
      retryAttemptsRef.current += 1;
      clearTimer(retryTimerRef);
      retryTimerRef.current = window.setTimeout(() => {
        setErrorCode(null);
        updateStatus("connecting");
        setRetryNonce((current) => current + 1);
      }, 2_000);
    }
  }, [finishIncoming, send, updateStatus]);

  useEffect(() => {
    if (!eligible || !localEnabled || !remoteEnabled || sidecarRef.current) return undefined;
    const remoteParticipant = remoteParticipants[0];
    const sourceTrack = remoteParticipant?.getTrackPublication(Track.Source.Microphone)?.audioTrack?.mediaStreamTrack;
    if (!remoteParticipant || !sourceTrack) return undefined;

    let cancelled = false;
    updateStatus("connecting");
    setErrorCode(null);
    void createLessonTranslationSession(lessonId)
      .then(async (session) => {
        if (cancelled) return;
        if (session.sourceParticipantIdentity !== remoteParticipant.identity) {
          failTranslation();
          return;
        }
        const sidecar = await connectRealtimeTranslation({
          session,
          sourceTrack,
          onAudioDelta: () => {
            if (incomingRef.current?.released) scheduleIncomingCompletion(false);
          },
          onError: () => failTranslation(),
          onTranscriptDelta: (delta) => {
            const id = incomingRef.current?.id;
            if (id) setCaptions((current) => appendTranscriptDelta(current, id, delta));
          },
        });
        if (cancelled) {
          sidecar.close();
          return;
        }
        sidecarRef.current = sidecar;
        retryAttemptsRef.current = 0;
        remoteParticipantRef.current = remoteParticipant;
        setTargetLanguage(session.targetLanguage);
        setLocalReady(true);
        localReadyRef.current = true;
        updateStatus(remoteReadyRef.current ? "ready" : "waiting");
        send({ type: "state", enabled: true, ready: true });
      })
      .catch((caught: unknown) => {
        if (!cancelled) failTranslation(caught instanceof ApiError ? caught.errorCode : undefined);
      });

    return () => { cancelled = true; };
  }, [eligible, failTranslation, lessonId, localEnabled, remoteEnabled, remoteParticipants, retryNonce, scheduleIncomingCompletion, send, trackRevision, updateStatus]);

  useEffect(() => {
    if (!eligible) return undefined;
    const handleData = (payload: Uint8Array, participant?: Participant, _kind?: unknown, topic?: string) => {
      if (topic !== translationTopic || participant?.identity !== remoteIdentity()) return;
      let message: TranslationMessage;
      try {
        message = JSON.parse(new TextDecoder().decode(payload)) as TranslationMessage;
      } catch {
        return;
      }

      if (message.type === "state") {
        const wasEnabled = remoteEnabledRef.current;
        const enabled = Boolean(message.enabled);
        const ready = Boolean(message.ready);
        remoteEnabledRef.current = enabled;
        remoteReadyRef.current = ready;
        setRemoteEnabled(enabled);
        setRemoteReady(ready);
        if (ready && localReadyRef.current) {
          setErrorCode(null);
          updateStatus("ready");
        }
        if (!wasEnabled && message.enabled && localEnabledRef.current) {
          send({ type: "state", enabled: true, ready: localReadyRef.current });
        }
        return;
      }
      if (message.type === "unavailable") {
        const outgoing = outgoingRef.current;
        if (outgoing) send({ type: "cancel", utteranceId: outgoing });
        clearTimer(utteranceTimerRef);
        clearTimer(startAckTimerRef);
        outgoingRef.current = null;
        outgoingReleasedRef.current = false;
        finishIncoming(false);
        setRemoteReady(false);
        remoteReadyRef.current = false;
        if (statusRef.current !== "error") {
          setErrorCode(message.errorCode ?? "LESSON_TRANSLATION_PROVIDER_UNAVAILABLE");
          updateStatus("error");
        }
        return;
      }
      if (!message.utteranceId) return;

      if (message.type === "press" && message.role) {
        if (!localReadyRef.current || !sidecarRef.current) {
          send({ type: "cancel", utteranceId: message.utteranceId });
          return;
        }
        if (outgoingRef.current && role) {
          if (translationCollisionWinner(role, message.role) === "local") {
            send({ type: "cancel", utteranceId: message.utteranceId });
            return;
          }
          send({ type: "cancel", utteranceId: outgoingRef.current });
          resetToReady();
        }
        if (incomingRef.current) {
          send({ type: "cancel", utteranceId: message.utteranceId });
          return;
        }
        const incoming: IncomingUtterance = { id: message.utteranceId, released: false, started: false };
        incomingRef.current = incoming;
        const remote = remoteParticipants[0];
        remoteParticipantRef.current = remote;
        previousVolumeRef.current = remote?.getVolume(Track.Source.Microphone) ?? 1;
        remote?.setVolume(0, Track.Source.Microphone);
        setCaptions((current) => appendTranscriptDelta(current, incoming.id, ""));
        updateStatus("receiving");
        void sidecarRef.current.start().then(() => {
          if (incomingRef.current?.id !== incoming.id) return;
          incoming.started = true;
          send({ type: "started", utteranceId: incoming.id });
          if (incoming.released) scheduleIncomingCompletion(true);
        }).catch(() => failTranslation());
        return;
      }
      if (message.type === "started" && outgoingRef.current === message.utteranceId) {
        clearTimer(startAckTimerRef);
        if (outgoingReleasedRef.current) {
          updateStatus("draining");
          return;
        }
        updateStatus("speaking");
        utteranceTimerRef.current = window.setTimeout(() => {
          outgoingReleasedRef.current = true;
          send({ type: "release", utteranceId: message.utteranceId });
          updateStatus("draining");
        }, maxUtteranceMs);
        return;
      }
      if (message.type === "release" && incomingRef.current?.id === message.utteranceId) {
        incomingRef.current.released = true;
        window.setTimeout(() => {
          void sidecarRef.current?.stop();
          const currentIncoming = incomingRef.current;
          if (currentIncoming && currentIncoming.id === message.utteranceId && currentIncoming.started) scheduleIncomingCompletion(true);
        }, captureTailMs);
        return;
      }
      if (message.type === "cancel") {
        if (outgoingRef.current === message.utteranceId) resetToReady();
        if (incomingRef.current?.id === message.utteranceId) finishIncoming(false);
        return;
      }
      if (message.type === "done" && outgoingRef.current === message.utteranceId) resetToReady();
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => { room.off(RoomEvent.DataReceived, handleData); };
  }, [eligible, failTranslation, finishIncoming, remoteIdentity, remoteParticipants, resetToReady, role, room, scheduleIncomingCompletion, send, updateStatus]);

  useEffect(() => {
    if (!eligible) return undefined;
    const announceState = () => {
      if (localEnabledRef.current) {
        send({ type: "state", enabled: true, ready: localReadyRef.current });
      }
    };
    room.on(RoomEvent.Reconnected, announceState);
    room.on(RoomEvent.ParticipantConnected, announceState);
    return () => {
      room.off(RoomEvent.Reconnected, announceState);
      room.off(RoomEvent.ParticipantConnected, announceState);
    };
  }, [eligible, room, send]);

  useEffect(() => {
    if (eligible && remoteIdentity() && localEnabledRef.current) {
      send({ type: "state", enabled: true, ready: localReadyRef.current });
    }
  }, [eligible, remoteIdentity, send]);

  useEffect(() => {
    if (!eligible) return undefined;
    const releaseForInterruption = () => {
      const outgoing = outgoingRef.current;
      if (outgoing && (statusRef.current === "starting" || statusRef.current === "speaking")) {
        clearTimer(utteranceTimerRef);
        outgoingReleasedRef.current = true;
        send({ type: "release", utteranceId: outgoing });
        updateStatus("draining");
      }
      if (incomingRef.current) finishIncoming();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") releaseForInterruption();
    };
    window.addEventListener("blur", releaseForInterruption);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", releaseForInterruption);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [eligible, finishIncoming, send, updateStatus]);

  useEffect(() => () => {
    clearTimer(quietTimerRef);
    clearTimer(hardDrainTimerRef);
    clearTimer(utteranceTimerRef);
    clearTimer(startAckTimerRef);
    clearTimer(retryTimerRef);
    restoreOriginal();
    sidecarRef.current?.close();
  }, [restoreOriginal]);

  const enable = () => {
    if (!eligible || localEnabledRef.current) return;
    localEnabledRef.current = true;
    setLocalEnabled(true);
    updateStatus("waiting");
    send({ type: "state", enabled: true, ready: false });
  };

  const beginPress = () => {
    if (statusRef.current !== "ready" || !role) return;
    const utteranceId = crypto.randomUUID();
    outgoingRef.current = utteranceId;
    outgoingReleasedRef.current = false;
    updateStatus("starting");
    send({ type: "press", utteranceId, role });
    startAckTimerRef.current = window.setTimeout(() => {
      send({ type: "cancel", utteranceId });
      resetToReady();
    }, 2_000);
  };

  const endPress = () => {
    const utteranceId = outgoingRef.current;
    if (!utteranceId || (statusRef.current !== "starting" && statusRef.current !== "speaking")) return;
    clearTimer(utteranceTimerRef);
    outgoingReleasedRef.current = true;
    send({ type: "release", utteranceId });
    updateStatus("draining");
  };

  return {
    beginPress,
    canEnable: eligible && !localEnabled,
    canPress: status === "ready" && remoteReady,
    captions,
    enable,
    endPress,
    errorCode,
    localEnabled,
    remoteEnabled,
    status,
    targetLanguage,
  };
}
