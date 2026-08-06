import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MaterialEditorBlock, MaterialExternalActivitySync } from "../../materials/model/materialDocument";
import {
  externalActivityCaptureErrorCode,
  externalActivityCaptureConstraints,
  externalActivityCursorTopic,
  externalActivityExtensionChannel,
  externalActivityHostTopic,
  externalActivityInputTopic,
  externalActivityPageChannel,
  externalActivitySessionIdFromTrackName,
  externalActivityTrackName,
  externalActivityTrackPrefix,
  isCurrentExternalActivityCapture,
  parseExternalActivityMessage,
  parseExtensionEvent,
  participantCanHostExternalActivity,
  type ExternalActivityBlock,
  type ExternalActivityInput,
  type ExternalActivityMessage,
  type ExternalActivityState,
} from "../model/externalActivityProtocol";

export function useExternalActivitySession({
  blocks,
  enabled,
  isHost,
  participantColor,
  participantName,
  trustedHostIdentity,
}: {
  blocks: MaterialEditorBlock[];
  enabled: boolean;
  isHost: boolean;
  participantColor: string;
  participantName: string;
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

  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const publish = useCallback((message: ExternalActivityMessage, topic: string, reliable: boolean) => {
    if (!enabled) return;
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    void room.localParticipant.publishData(bytes, { reliable, topic }).catch(() => undefined);
  }, [enabled, room.localParticipant]);

  const broadcastState = useCallback((state: ExternalActivityState) => {
    activeRef.current = state;
    setActive(state);
    publish({ version: 1, type: "HOST_STATE", ...state }, externalActivityHostTopic, true);
  }, [publish]);

  const clearTimers = useCallback(() => {
    if (extensionTimerRef.current !== null) window.clearTimeout(extensionTimerRef.current);
    extensionTimerRef.current = null;
  }, []);

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
    await unpublishLocalStream();
    activeRef.current = null;
    setActive(null);
    setCursorsByIdentity({});
    if (notify) publish({ version: 1, type: "STOPPED", sessionId: current.sessionId, blockId: current.blockId }, externalActivityHostTopic, true);
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
      phase: "AWAITING_EXTENSION",
      studentsLocked: false,
      visible: true,
    };
    broadcastState(next);
    postExtensionCommand({ version: 1, type: "PREPARE", sessionId, nonce, url: block.url });
    extensionTimerRef.current = window.setTimeout(() => {
      if (
        sessionGenerationRef.current === generation
        && activeRef.current?.sessionId === sessionId
        && activeRef.current.phase === "AWAITING_EXTENSION"
      ) {
        broadcastState({ ...next, phase: "ERROR", errorCode: "EXTENSION_NOT_AVAILABLE" });
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
          publish({ version: 1, type: "HOST_IDLE", sessionId: "current", blockId: "current" }, externalActivityHostTopic, true);
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
        if (activeRef.current?.sessionId === message.sessionId && (!activeRef.current.hostIdentity || activeRef.current.hostIdentity === participant.identity)) {
          setActive(null);
          activeRef.current = null;
          setMediaStream(null);
          setCursorsByIdentity({});
        }
        return;
      }
      if (message.type === "HOST_IDLE") {
        if (!participantCanHostExternalActivity(participant.metadata, participant.identity, trustedHostIdentity)) return;
        stateResponseReceivedRef.current = true;
        setActive(null);
        activeRef.current = null;
        setMediaStream(null);
        setCursorsByIdentity({});
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
  }, [enabled, isHost, postExtensionCommand, room, startHostSession, stopHostSession, trustedHostIdentity]);

  useEffect(() => {
    if (!enabled) return undefined;
    const announceOrRequestState = () => {
      if (isHost) {
        const current = activeRef.current;
        if (current) broadcastState(current);
        else publish({ version: 1, type: "HOST_IDLE", sessionId: "current", blockId: "current" }, externalActivityHostTopic, true);
      } else {
        stateResponseReceivedRef.current = false;
        publish({ version: 1, type: "REQUEST_STATE", sessionId: "current", blockId: "current" }, externalActivityHostTopic, true);
      }
    };
    let retryCount = 0;
    const retryTimer = isHost ? null : window.setInterval(() => {
      if (stateResponseReceivedRef.current || retryCount >= 5) {
        if (retryTimer !== null) window.clearInterval(retryTimer);
        return;
      }
      retryCount += 1;
      publish({ version: 1, type: "REQUEST_STATE", sessionId: "current", blockId: "current" }, externalActivityHostTopic, true);
    }, 1_000);
    const handleParticipantDisconnected = (participant: RemoteParticipant) => {
      if (activeRef.current?.hostIdentity !== participant.identity) return;
      activeRef.current = null;
      setActive(null);
      setMediaStream(null);
      setCursorsByIdentity({});
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
  }, [broadcastState, enabled, isHost, publish, room]);

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
      if (extensionEvent.type === "CAPTURE_READY") {
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
            if (video) await room.localParticipant.publishTrack(video, { name: externalActivityTrackName(current.sessionId, "video"), source: Track.Source.ScreenShare });
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
        broadcastState({ ...current, phase: "ERROR", errorCode: String(extensionEvent.type) });
      }
    };
    window.addEventListener("message", handleExtensionEvent);
    return () => window.removeEventListener("message", handleExtensionEvent);
  }, [broadcastState, enabled, isHost, room.localParticipant, unpublishLocalStream]);

  useEffect(() => {
    if (!enabled || isHost || !active) return undefined;
    const updateRemoteStream = () => {
      const tracks: MediaStreamTrack[] = [];
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.trackName?.startsWith(`${externalActivityTrackPrefix}${active.sessionId}-`) && publication.track?.mediaStreamTrack) {
            tracks.push(publication.track.mediaStreamTrack);
          }
        }
      }
      setMediaStream(tracks.length ? new MediaStream(tracks) : null);
    };
    updateRemoteStream();
    room.on(RoomEvent.TrackSubscribed, updateRemoteStream);
    room.on(RoomEvent.TrackUnsubscribed, updateRemoteStream);
    return () => {
      room.off(RoomEvent.TrackSubscribed, updateRemoteStream);
      room.off(RoomEvent.TrackUnsubscribed, updateRemoteStream);
    };
  }, [active?.sessionId, enabled, isHost, room]);

  useEffect(() => () => {
    clearTimers();
    if (isHost) void stopHostSession();
  }, [clearTimers, isHost, stopHostSession]);

  const open = useCallback((block: MaterialEditorBlock) => {
    if (!enabled || block.type !== "externalActivity" || !block.url) return;
    const sessionId = crypto.randomUUID();
    if (isHost) {
      void startHostSession(block.id, sessionId);
    } else {
      const requested: ExternalActivityState = { blockId: block.id, sessionId, hostIdentity: null, phase: "REQUESTED", studentsLocked: false, visible: true };
      activeRef.current = requested;
      setActive(requested);
      publish({ version: 1, type: "REQUEST_OPEN", sessionId, blockId: block.id }, externalActivityHostTopic, true);
    }
  }, [enabled, isHost, publish, startHostSession]);

  const sendInput = useCallback((input: ExternalActivityInput) => {
    const current = activeRef.current;
    if (!current || current.phase !== "ACTIVE") return;
    if (isHost) {
      const nonce = extensionNonceRef.current;
      if (nonce) postExtensionCommand({ version: 1, type: "INPUT", sessionId: current.sessionId, nonce, input });
    } else {
      publish({ version: 1, type: "INPUT", sessionId: current.sessionId, blockId: current.blockId, eventId: crypto.randomUUID(), input }, externalActivityInputTopic, true);
    }
  }, [isHost, postExtensionCommand, publish]);

  const sendCursor = useCallback((x: number, y: number) => {
    const current = activeRef.current;
    if (!current || current.phase !== "ACTIVE") return;
    publish({
      version: 1,
      type: "CURSOR",
      sessionId: current.sessionId,
      blockId: current.blockId,
      cursor: { x, y, name: participantName, color: participantColor },
    }, externalActivityCursorTopic, false);
  }, [participantColor, participantName, publish]);

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
    returnToLesson: () => { if (isHost) void stopHostSession(); },
    sendCursor,
    sendInput: sendInput as MaterialExternalActivitySync["sendInput"],
  }), [active, cursorsByIdentity, isHost, mediaStream, open, reload, sendCursor, sendInput, stopHostSession]);
}

async function consumeCapture(streamId: string, sessionId: string): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia(externalActivityCaptureConstraints(streamId));
  if (!stream.getVideoTracks().length) throw new Error(`CAPTURE_WITHOUT_VIDEO:${sessionId}`);
  return stream;
}
