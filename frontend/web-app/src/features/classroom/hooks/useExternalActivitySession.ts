import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication, type TrackPublishOptions } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MaterialEditorBlock, MaterialExternalActivitySync } from "../../materials/model/materialDocument";
import {
  externalActivityCaptureErrorCode,
  externalActivityCaptureConstraints,
  externalActivityCursorTopic,
  externalActivityExtensionChannel,
  externalActivityExtensionErrorCode,
  externalActivityHostTopic,
  externalActivityInputReliable,
  externalActivityInputTopic,
  externalActivityPageChannel,
  externalActivitySessionIdFromTrackName,
  externalActivityParticipantPhase,
  externalActivityTrackName,
  externalActivityTrackPrefix,
  extensionSupportsTrustedInput,
  isCurrentExternalActivityCapture,
  parseExternalActivityMessage,
  parseExtensionEvent,
  participantCanHostExternalActivity,
  type ExternalActivityBlock,
  type ExternalActivityInput,
  type ExternalActivityMessage,
  type ExternalActivityRealtime,
  type ExternalActivityState,
} from "../model/externalActivityProtocol";

export const externalActivityVideoPublishOptions = {
  degradationPreference: "maintain-framerate",
  screenShareEncoding: {
    maxBitrate: 2_500_000,
    maxFramerate: 30,
  },
  simulcast: false,
  videoCodec: "vp8",
} satisfies TrackPublishOptions;

export function useExternalActivitySession({
  blocks,
  enabled,
  isHost,
  participantColor,
  participantName,
  realtime,
  trustedHostIdentity,
}: {
  blocks: MaterialEditorBlock[];
  enabled: boolean;
  isHost: boolean;
  participantColor: string;
  participantName: string;
  realtime?: ExternalActivityRealtime | null;
  trustedHostIdentity?: string | null;
}): MaterialExternalActivitySync {
  const room = useRoomContext();
  const [active, setActive] = useState<ExternalActivityState | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cursorsByIdentity, setCursorsByIdentity] = useState<Record<string, { identity: string; name: string; color: string; x: number; y: number }>>({});
  const activeRef = useRef<ExternalActivityState | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const extensionNonceRef = useRef<string | null>(null);
  const extensionTimerRef = useRef<number | null>(null);
  const blocksRef = useRef(blocks);
  const handledInputEventsRef = useRef(new Set<string>());
  const stateResponseReceivedRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const remoteTrackLossTimerRef = useRef<number | null>(null);
  const remoteTrackSeenSessionRef = useRef<string | null>(null);

  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const publish = useCallback(async (message: ExternalActivityMessage, topic: string, reliable: boolean) => {
    if (!enabled) return;
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    await room.localParticipant.publishData(bytes, { reliable, topic }).catch(() => undefined);
  }, [enabled, room.localParticipant]);

  const broadcastState = useCallback((state: ExternalActivityState) => {
    activeRef.current = state;
    setActive(state);
    void publish({
      version: 1,
      type: "HOST_STATE",
      blockId: state.blockId,
      sessionId: state.sessionId,
      phase: externalActivityParticipantPhase(state.phase),
      studentsLocked: state.studentsLocked,
      visible: state.visible,
    }, externalActivityHostTopic, true);
  }, [publish]);

  const clearTimers = useCallback(() => {
    if (extensionTimerRef.current !== null) window.clearTimeout(extensionTimerRef.current);
    extensionTimerRef.current = null;
  }, []);

  const clearRemoteTrackLossTimer = useCallback(() => {
    if (remoteTrackLossTimerRef.current !== null) window.clearTimeout(remoteTrackLossTimerRef.current);
    remoteTrackLossTimerRef.current = null;
  }, []);

  const clearRemoteSession = useCallback((sessionId?: string) => {
    if (sessionId && activeRef.current?.sessionId !== sessionId) return;
    clearRemoteTrackLossTimer();
    remoteTrackSeenSessionRef.current = null;
    activeRef.current = null;
    setActive(null);
    setMediaStream(null);
    setCursorsByIdentity({});
  }, [clearRemoteTrackLossTimer]);

  const unpublishLocalStream = useCallback(async () => {
    const stream = localStreamRef.current;
    localStreamRef.current = null;
    setMediaStream(null);
    if (!stream) return;
    for (const track of stream.getTracks()) {
      await room.localParticipant.unpublishTrack(track).catch(() => undefined);
      track.stop();
    }
  }, [room.localParticipant]);

  const postExtensionCommand = useCallback((command: Record<string, unknown>) => {
    window.postMessage({ channel: externalActivityPageChannel, command }, window.location.origin);
  }, []);

  const stopHostSession = useCallback(async (notify = true) => {
    const current = activeRef.current;
    if (!current || !isHost) return;
    sessionGenerationRef.current += 1;
    clearTimers();
    const nonce = extensionNonceRef.current;
    if (nonce) postExtensionCommand({ version: 1, type: "STOP", sessionId: current.sessionId, nonce });
    extensionNonceRef.current = null;
    if (notify) await publish({ version: 1, type: "STOPPED", sessionId: current.sessionId, blockId: current.blockId }, externalActivityHostTopic, true);
    await unpublishLocalStream();
    activeRef.current = null;
    setActive(null);
    setCursorsByIdentity({});
    if (notify) await publish({ version: 1, type: "HOST_IDLE", sessionId: current.sessionId, blockId: current.blockId }, externalActivityHostTopic, true);
  }, [clearTimers, isHost, postExtensionCommand, publish, unpublishLocalStream]);

  const startHostSession = useCallback(async (blockId: string, sessionId: string) => {
    if (!isHost) return;
    const block = blocksRef.current.find((candidate): candidate is ExternalActivityBlock => (
      candidate.id === blockId && candidate.type === "externalActivity" && Boolean(candidate.url?.trim())
    ));
    if (!block) return;
    const current = activeRef.current;
    if (current) await stopHostSession(false);
    const generation = ++sessionGenerationRef.current;
    const nonce = crypto.randomUUID();
    extensionNonceRef.current = nonce;
    const next: ExternalActivityState = {
      blockId,
      sessionId,
      hostIdentity: room.localParticipant.identity,
      phase: "OPENING_PROVIDER",
      studentsLocked: false,
      visible: true,
    };
    broadcastState(next);
    postExtensionCommand({ version: 1, type: "PREPARE", sessionId, nonce, url: block.url });
    extensionTimerRef.current = window.setTimeout(() => {
      if (
        sessionGenerationRef.current === generation
        && activeRef.current?.sessionId === sessionId
        && activeRef.current.phase === "OPENING_PROVIDER"
      ) {
        broadcastState({ ...next, phase: "ERROR", errorCode: "EXTENSION_NOT_DETECTED" });
      }
    }, 10_000);
  }, [broadcastState, clearTimers, isHost, postExtensionCommand, room.localParticipant.identity, stopHostSession]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (![externalActivityInputTopic, externalActivityCursorTopic, externalActivityHostTopic].includes(topic ?? "")) return;
      let decoded: unknown;
      try { decoded = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
      const message = parseExternalActivityMessage(decoded);
      if (!message || !participant) return;

      if (message.type === "REQUEST_STATE" && isHost) {
        const current = activeRef.current;
        if (current) {
          broadcastState(current);
        } else {
          void publish({ version: 1, type: "HOST_IDLE", sessionId: "current", blockId: "current" }, externalActivityHostTopic, true);
        }
        return;
      }
      if (message.type === "REQUEST_OPEN" && isHost) {
        void startHostSession(message.blockId, message.sessionId);
        return;
      }
      if (message.type === "REQUEST_CLOSE" && isHost && activeRef.current?.sessionId === message.sessionId) {
        void stopHostSession();
        return;
      }
      if (message.type === "INPUT" && isHost && message.input && activeRef.current?.sessionId === message.sessionId) {
        if (!message.eventId || handledInputEventsRef.current.has(message.eventId)) return;
        handledInputEventsRef.current.add(message.eventId);
        if (handledInputEventsRef.current.size > 500) {
          const oldest = handledInputEventsRef.current.values().next().value;
          if (oldest) handledInputEventsRef.current.delete(oldest);
        }
        const nonce = extensionNonceRef.current;
        if (nonce) postExtensionCommand({ version: 1, type: "INPUT", sessionId: message.sessionId, nonce, input: message.input });
        return;
      }
      if (message.type === "CURSOR" && message.cursor && activeRef.current?.sessionId === message.sessionId) {
        setCursorsByIdentity((current) => ({
          ...current,
          [participant.identity]: {
            identity: participant.identity,
            name: message.cursor?.name || participant.name || participant.identity,
            color: message.cursor?.color || "#ff5c00",
            x: message.cursor!.x,
            y: message.cursor!.y,
          },
        }));
        return;
      }
      if (message.type === "STOPPED") {
        if (!participantCanHostExternalActivity(participant.metadata, participant.identity, trustedHostIdentity)) return;
        stateResponseReceivedRef.current = true;
        const current = activeRef.current;
        if (
          current
          && (!current.hostIdentity || current.hostIdentity === participant.identity)
          && (current.sessionId === message.sessionId || (!current.hostIdentity && current.phase === "REQUESTED"))
        ) {
          // A request published before the host joined is not replayed by LiveKit. The
          // trusted host's stop is authoritative even when it belongs to another session.
          if (!current.hostIdentity && current.phase === "REQUESTED") clearRemoteSession();
          else clearRemoteSession(message.sessionId);
        }
        return;
      }
      if (message.type === "HOST_IDLE") {
        if (!participantCanHostExternalActivity(participant.metadata, participant.identity, trustedHostIdentity)) return;
        stateResponseReceivedRef.current = true;
        const current = activeRef.current;
        if (message.sessionId === "current") clearRemoteSession();
        else if (current?.sessionId === message.sessionId) clearRemoteSession(message.sessionId);
        else if (!current?.hostIdentity && current?.phase === "REQUESTED") clearRemoteSession();
        return;
      }
      if (message.type === "HOST_STATE" && message.phase) {
        if (!participantCanHostExternalActivity(participant.metadata, participant.identity, trustedHostIdentity)) return;
        stateResponseReceivedRef.current = true;
        const current = activeRef.current;
        if (current?.hostIdentity && current.hostIdentity !== participant.identity) return;
        const nextState: ExternalActivityState = {
          blockId: message.blockId,
          sessionId: message.sessionId,
          hostIdentity: participant.identity,
          phase: message.phase,
          studentsLocked: Boolean(message.studentsLocked),
          errorCode: message.errorCode,
          visible: message.visible !== false,
        };
        activeRef.current = nextState;
        setActive(nextState);
      }
    };
    room.on(RoomEvent.DataReceived, handleData);
    return () => { room.off(RoomEvent.DataReceived, handleData); };
  }, [clearRemoteSession, enabled, isHost, postExtensionCommand, room, startHostSession, stopHostSession, trustedHostIdentity]);

  useEffect(() => {
    if (!enabled || !realtime) return undefined;
    return realtime.acquire((message) => {
      const current = activeRef.current;
      if (!current || current.sessionId !== message.sessionId || current.blockId !== message.blockId) return;
      if (message.kind === "external-input") {
        if (!isHost || handledInputEventsRef.current.has(message.eventId)) return;
        handledInputEventsRef.current.add(message.eventId);
        if (handledInputEventsRef.current.size > 500) {
          const oldest = handledInputEventsRef.current.values().next().value;
          if (oldest) handledInputEventsRef.current.delete(oldest);
        }
        const nonce = extensionNonceRef.current;
        if (nonce) postExtensionCommand({
          version: 1,
          type: "INPUT",
          sessionId: message.sessionId,
          nonce,
          input: message.input,
        });
        return;
      }
      if (
        Number.isFinite(message.x)
        && Number.isFinite(message.y)
        && message.x >= 0
        && message.x <= 1
        && message.y >= 0
        && message.y <= 1
      ) {
        setCursorsByIdentity((currentCursors) => ({
          ...currentCursors,
          [message.identity]: {
            identity: message.identity,
            name: message.name || message.identity,
            color: message.color || "#ff5c00",
            x: message.x,
            y: message.y,
          },
        }));
      }
    });
  }, [enabled, isHost, postExtensionCommand, realtime]);

  useEffect(() => {
    if (!enabled) return undefined;
    const announceOrRequestState = () => {
      if (isHost) {
        const current = activeRef.current;
        if (current) broadcastState(current);
        else void publish({ version: 1, type: "HOST_IDLE", sessionId: "current", blockId: "current" }, externalActivityHostTopic, true);
      } else {
        stateResponseReceivedRef.current = false;
        void publish({ version: 1, type: "REQUEST_STATE", sessionId: "current", blockId: "current" }, externalActivityHostTopic, true);
      }
    };
    let retryCount = 0;
    const retryTimer = isHost ? null : window.setInterval(() => {
      if (stateResponseReceivedRef.current || retryCount >= 5) {
        if (retryTimer !== null) window.clearInterval(retryTimer);
        return;
      }
      retryCount += 1;
      void publish({ version: 1, type: "REQUEST_STATE", sessionId: "current", blockId: "current" }, externalActivityHostTopic, true);
    }, 1_000);
    const handleParticipantDisconnected = (participant: RemoteParticipant) => {
      if (activeRef.current?.hostIdentity !== participant.identity) return;
      clearRemoteSession();
      stateResponseReceivedRef.current = false;
    };
    room.on(RoomEvent.ParticipantConnected, announceOrRequestState);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.Reconnected, announceOrRequestState);
    announceOrRequestState();
    return () => {
      if (retryTimer !== null) window.clearInterval(retryTimer);
      room.off(RoomEvent.ParticipantConnected, announceOrRequestState);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.Reconnected, announceOrRequestState);
    };
  }, [broadcastState, clearRemoteSession, enabled, isHost, publish, room]);

  useEffect(() => {
    if (!enabled || isHost) return undefined;
    const discoverPublishedSession = () => {
      if (activeRef.current) return;
      const block = blocksRef.current.find((candidate): candidate is ExternalActivityBlock => (
        candidate.type === "externalActivity" && Boolean(candidate.url?.trim())
      ));
      if (!block) return;
      for (const participant of room.remoteParticipants.values()) {
        if (!participantCanHostExternalActivity(participant.metadata, participant.identity, trustedHostIdentity)) continue;
        for (const publication of participant.trackPublications.values()) {
          const sessionId = externalActivitySessionIdFromTrackName(publication.trackName);
          if (!sessionId || !publication.track?.mediaStreamTrack) continue;
          const discovered: ExternalActivityState = {
            blockId: block.id,
            sessionId,
            hostIdentity: participant.identity,
            phase: "ACTIVE",
            studentsLocked: false,
            visible: true,
          };
          stateResponseReceivedRef.current = true;
          activeRef.current = discovered;
          setActive(discovered);
          return;
        }
      }
    };
    discoverPublishedSession();
    room.on(RoomEvent.TrackSubscribed, discoverPublishedSession);
    return () => { room.off(RoomEvent.TrackSubscribed, discoverPublishedSession); };
  }, [enabled, isHost, room, trustedHostIdentity]);

  useEffect(() => {
    if (!enabled || !isHost) return undefined;
    const handleExtensionEvent = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.channel !== externalActivityExtensionChannel) return;
      const current = activeRef.current;
      if (!current) return;
      const extensionEvent = parseExtensionEvent(event.data.event, current.sessionId);
      if (!extensionEvent) return;
      if (extensionEvent.type === "AWAITING_ACTION" && current.phase === "OPENING_PROVIDER") {
        clearTimers();
        broadcastState(extensionSupportsTrustedInput(extensionEvent.extensionVersion)
          ? { ...current, phase: "AWAITING_ACTION" }
          : { ...current, phase: "ERROR", errorCode: "EXTENSION_UPDATE_REQUIRED" });
      } else if (extensionEvent.type === "CAPTURE_READY") {
        const generation = sessionGenerationRef.current;
        if (extensionTimerRef.current !== null) window.clearTimeout(extensionTimerRef.current);
        extensionTimerRef.current = null;
        const next = { ...current, phase: "STARTING" as const };
        broadcastState(next);
        void consumeCapture(String(extensionEvent.streamId), current.sessionId)
          .then(async (stream) => {
            if (!isCurrentExternalActivityCapture(
              generation,
              current.sessionId,
              sessionGenerationRef.current,
              activeRef.current,
            )) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            localStreamRef.current = stream;
            setMediaStream(stream);
            const video = stream.getVideoTracks()[0];
            const audio = stream.getAudioTracks()[0];
            if (video) {
              video.contentHint = "motion";
              await room.localParticipant.publishTrack(video, {
                ...externalActivityVideoPublishOptions,
                name: externalActivityTrackName(current.sessionId, "video"),
                source: Track.Source.ScreenShare,
              });
            }
            if (!isCurrentExternalActivityCapture(
              generation,
              current.sessionId,
              sessionGenerationRef.current,
              activeRef.current,
            )) {
              await unpublishLocalStream();
              return;
            }
            if (audio) await room.localParticipant.publishTrack(audio, { name: externalActivityTrackName(current.sessionId, "audio"), source: Track.Source.ScreenShareAudio });
            if (!isCurrentExternalActivityCapture(
              generation,
              current.sessionId,
              sessionGenerationRef.current,
              activeRef.current,
            )) {
              await unpublishLocalStream();
              return;
            }
            if (extensionTimerRef.current !== null) window.clearTimeout(extensionTimerRef.current);
            broadcastState({ ...next, phase: "ACTIVE" });
          })
          .catch((error: unknown) => {
            if (isCurrentExternalActivityCapture(
              generation,
              current.sessionId,
              sessionGenerationRef.current,
              activeRef.current,
            )) {
              broadcastState({ ...next, phase: "ERROR", errorCode: externalActivityCaptureErrorCode(error) });
            }
          });
      } else if (["TAB_CLOSED", "DEBUGGER_DETACHED", "ERROR"].includes(String(extensionEvent.type))) {
        clearTimers();
        broadcastState({
          ...current,
          phase: "ERROR",
          errorCode: externalActivityExtensionErrorCode(extensionEvent.type, extensionEvent.error),
        });
      }
    };
    window.addEventListener("message", handleExtensionEvent);
    return () => window.removeEventListener("message", handleExtensionEvent);
  }, [broadcastState, enabled, isHost, room.localParticipant, unpublishLocalStream]);

  useEffect(() => {
    if (!enabled || isHost || !active) return undefined;
    const observedTracks = new Set<MediaStreamTrack>();
    const matchingRemoteTracks = (excludedTrack?: MediaStreamTrack, excludedPublication?: RemoteTrackPublication) => {
      const tracks: Array<{ track: MediaStreamTrack; video: boolean }> = [];
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication === excludedPublication) continue;
          if (!publication.trackName?.startsWith(`${externalActivityTrackPrefix}${active.sessionId}-`)) continue;
          const track = publication.track?.mediaStreamTrack;
          if (!track || track === excludedTrack || track.readyState === "ended") continue;
          tracks.push({ track, video: publication.trackName.endsWith("-video") });
        }
      }
      return tracks;
    };
    const updateRemoteStream = (excludedTrack?: MediaStreamTrack, excludedPublication?: RemoteTrackPublication) => {
      const matches = matchingRemoteTracks(excludedTrack, excludedPublication);
      if (matches.some(({ video }) => video)) {
        clearRemoteTrackLossTimer();
        remoteTrackSeenSessionRef.current = active.sessionId;
        for (const { track } of matches) {
          if (observedTracks.has(track) || typeof track.addEventListener !== "function") continue;
          observedTracks.add(track);
          track.addEventListener("ended", handleTrackEnded, { once: true });
        }
        setMediaStream(new MediaStream(matches.map(({ track }) => track)));
        return;
      }
      setMediaStream(null);
      if (
        remoteTrackSeenSessionRef.current !== active.sessionId
        || remoteTrackLossTimerRef.current !== null
      ) {
        return;
      }
      void publish({
        version: 1,
        type: "REQUEST_STATE",
        sessionId: active.sessionId,
        blockId: active.blockId,
      }, externalActivityHostTopic, true);
      remoteTrackLossTimerRef.current = window.setTimeout(() => {
        remoteTrackLossTimerRef.current = null;
        if (
          activeRef.current?.sessionId === active.sessionId
          && !matchingRemoteTracks(excludedTrack, excludedPublication).some(({ video }) => video)
        ) {
          clearRemoteSession(active.sessionId);
        }
      }, 1_000);
    };
    const handleTrackEnded = (event: Event) => updateRemoteStream(event.currentTarget as MediaStreamTrack);
    const handleTrackSubscribed = () => updateRemoteStream();
    const handleTrackUnsubscribed = (track: RemoteTrack) => updateRemoteStream(track.mediaStreamTrack);
    const handleTrackUnpublished = (publication: RemoteTrackPublication) => {
      if (!publication.trackName?.startsWith(`${externalActivityTrackPrefix}${active.sessionId}-`)) return;
      updateRemoteStream(publication.track?.mediaStreamTrack, publication);
    };
    updateRemoteStream();
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.TrackUnpublished, handleTrackUnpublished);
    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.TrackUnpublished, handleTrackUnpublished);
      observedTracks.forEach((track) => track.removeEventListener?.("ended", handleTrackEnded));
      clearRemoteTrackLossTimer();
    };
  }, [active?.blockId, active?.sessionId, clearRemoteSession, clearRemoteTrackLossTimer, enabled, isHost, publish, room]);

  useEffect(() => () => {
    clearTimers();
    clearRemoteTrackLossTimer();
    if (isHost) void stopHostSession();
  }, [clearRemoteTrackLossTimer, clearTimers, isHost, stopHostSession]);

  const open = useCallback((block: MaterialEditorBlock) => {
    if (block.type !== "externalActivity" || !block.url) return;
    const sessionId = crypto.randomUUID();
    if (!enabled) {
      const unavailable: ExternalActivityState = {
        blockId: block.id,
        sessionId,
        hostIdentity: isHost ? room.localParticipant.identity : null,
        phase: "ERROR",
        studentsLocked: false,
        errorCode: "FEATURE_UNAVAILABLE",
        visible: true,
      };
      activeRef.current = unavailable;
      setActive(unavailable);
      return;
    }
    if (isHost) {
      void startHostSession(block.id, sessionId);
    } else {
      const requested: ExternalActivityState = { blockId: block.id, sessionId, hostIdentity: null, phase: "REQUESTED", studentsLocked: false, visible: true };
      activeRef.current = requested;
      setActive(requested);
      void publish({ version: 1, type: "REQUEST_OPEN", sessionId, blockId: block.id }, externalActivityHostTopic, true);
    }
  }, [enabled, isHost, publish, room.localParticipant.identity, startHostSession]);

  const retry = useCallback(() => {
    const current = activeRef.current;
    if (!current || !isHost || !enabled) return;
    void startHostSession(current.blockId, crypto.randomUUID());
  }, [enabled, isHost, startHostSession]);

  const returnToLesson = useCallback(() => {
    if (isHost) {
      void stopHostSession();
    } else {
      clearRemoteSession();
    }
  }, [clearRemoteSession, isHost, stopHostSession]);

  const sendInput = useCallback((input: ExternalActivityInput) => {
    const current = activeRef.current;
    if (!current || current.phase !== "ACTIVE") return;
    if (isHost) {
      const nonce = extensionNonceRef.current;
      if (nonce) postExtensionCommand({ version: 1, type: "INPUT", sessionId: current.sessionId, nonce, input });
    } else {
      const eventId = crypto.randomUUID();
      if (realtime?.publish({
        blockId: current.blockId,
        eventId,
        input,
        kind: "external-input",
        sessionId: current.sessionId,
      })) return;
      void publish(
        { version: 1, type: "INPUT", sessionId: current.sessionId, blockId: current.blockId, eventId, input },
        externalActivityInputTopic,
        externalActivityInputReliable(input),
      );
    }
  }, [isHost, postExtensionCommand, publish, realtime]);

  const sendCursor = useCallback((x: number, y: number) => {
    const current = activeRef.current;
    if (!current || current.phase !== "ACTIVE") return;
    if (realtime?.publish({
      blockId: current.blockId,
      color: participantColor,
      identity: room.localParticipant.identity,
      kind: "external-cursor",
      name: participantName,
      sessionId: current.sessionId,
      x,
      y,
    })) return;
    void publish({
      version: 1,
      type: "CURSOR",
      sessionId: current.sessionId,
      blockId: current.blockId,
      cursor: { x, y, name: participantName, color: participantColor },
    }, externalActivityCursorTopic, false);
  }, [participantColor, participantName, publish, realtime, room.localParticipant.identity]);

  const reload = useCallback(() => {
    const current = activeRef.current;
    const nonce = extensionNonceRef.current;
    if (current && nonce && isHost) postExtensionCommand({ version: 1, type: "RELOAD", sessionId: current.sessionId, nonce });
  }, [isHost, postExtensionCommand]);

  return useMemo(() => ({
    active,
    cursors: Object.values(cursorsByIdentity),
    isHost,
    mediaStream,
    open,
    reload,
    retry,
    returnToLesson,
    sendCursor,
    sendInput: sendInput as MaterialExternalActivitySync["sendInput"],
  }), [active, cursorsByIdentity, isHost, mediaStream, open, reload, retry, returnToLesson, sendCursor, sendInput]);
}

async function consumeCapture(streamId: string, sessionId: string): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia(externalActivityCaptureConstraints(streamId));
  if (!stream.getVideoTracks().length) throw new Error(`CAPTURE_WITHOUT_VIDEO:${sessionId}`);
  return stream;
}
