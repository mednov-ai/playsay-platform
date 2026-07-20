import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MaterialEditorBlock, MaterialExternalActivitySync } from "../../materials/model/materialDocument";
import {
  externalActivityCaptureErrorCode,
  externalActivityCursorTopic,
  externalActivityExtensionChannel,
  externalActivityHostTopic,
  externalActivityInputTopic,
  externalActivityPageChannel,
  externalActivityTrackName,
  externalActivityTrackPrefix,
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
}: {
  blocks: MaterialEditorBlock[];
  enabled: boolean;
  isHost: boolean;
  participantColor: string;
  participantName: string;
}): MaterialExternalActivitySync {
  const room = useRoomContext();
  const [active, setActive] = useState<ExternalActivityState | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cursorsByIdentity, setCursorsByIdentity] = useState<Record<string, { identity: string; name: string; color: string; x: number; y: number }>>({});
  const activeRef = useRef<ExternalActivityState | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const extensionNonceRef = useRef<string | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const extensionTimerRef = useRef<number | null>(null);
  const blocksRef = useRef(blocks);

  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const publish = useCallback((message: ExternalActivityMessage, topic: string, reliable: boolean) => {
    if (!enabled) return;
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    void room.localParticipant.publishData(bytes, { reliable, topic });
  }, [enabled, room.localParticipant]);

  const broadcastState = useCallback((state: ExternalActivityState) => {
    activeRef.current = state;
    setActive(state);
    publish({ version: 1, type: "HOST_STATE", ...state }, externalActivityHostTopic, true);
  }, [publish]);

  const clearTimers = useCallback(() => {
    if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
    if (extensionTimerRef.current !== null) window.clearTimeout(extensionTimerRef.current);
    collapseTimerRef.current = null;
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
    if (current?.blockId === blockId) {
      clearTimers();
      broadcastState({ ...current, visible: true });
      return;
    }
    if (current) await stopHostSession(false);
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
      if (activeRef.current?.sessionId === sessionId && activeRef.current.phase !== "ACTIVE") {
        broadcastState({ ...next, phase: "ERROR", errorCode: "EXTENSION_NOT_AVAILABLE" });
      }
    }, 10_000);
  }, [broadcastState, clearTimers, isHost, postExtensionCommand, room.localParticipant.identity, stopHostSession]);

  const collapseHostSession = useCallback(() => {
    const current = activeRef.current;
    if (!current || !isHost) return;
    const next = { ...current, visible: false };
    broadcastState(next);
    if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => void stopHostSession(), 60_000);
  }, [broadcastState, isHost, stopHostSession]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (![externalActivityInputTopic, externalActivityCursorTopic, externalActivityHostTopic].includes(topic ?? "")) return;
      let decoded: unknown;
      try { decoded = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
      const message = parseExternalActivityMessage(decoded);
      if (!message || !participant) return;

      if (message.type === "REQUEST_OPEN" && isHost) {
        void startHostSession(message.blockId, message.sessionId);
        return;
      }
      if (message.type === "REQUEST_CLOSE" && isHost && activeRef.current?.sessionId === message.sessionId) {
        collapseHostSession();
        return;
      }
      if (message.type === "INPUT" && isHost && message.input && activeRef.current?.sessionId === message.sessionId) {
        if (!activeRef.current.studentsLocked) {
          const nonce = extensionNonceRef.current;
          if (nonce) postExtensionCommand({ version: 1, type: "INPUT", sessionId: message.sessionId, nonce, input: message.input });
        }
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
        if (!participantCanHostExternalActivity(participant.metadata)) return;
        if (activeRef.current?.sessionId === message.sessionId && (!activeRef.current.hostIdentity || activeRef.current.hostIdentity === participant.identity)) {
          setActive(null);
          activeRef.current = null;
          setMediaStream(null);
          setCursorsByIdentity({});
        }
        return;
      }
      if (message.type === "HOST_STATE" && message.phase) {
        if (!participantCanHostExternalActivity(participant.metadata)) return;
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
  }, [collapseHostSession, enabled, isHost, postExtensionCommand, room, startHostSession]);

  useEffect(() => {
    if (!enabled || !isHost) return undefined;
    const handleExtensionEvent = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.channel !== externalActivityExtensionChannel) return;
      const current = activeRef.current;
      if (!current) return;
      const extensionEvent = parseExtensionEvent(event.data.event, current.sessionId);
      if (!extensionEvent) return;
      if (extensionEvent.type === "CAPTURE_READY") {
        const next = { ...current, phase: "STARTING" as const };
        broadcastState(next);
        void consumeCapture(String(extensionEvent.streamId), current.sessionId)
          .then(async (stream) => {
            localStreamRef.current = stream;
            setMediaStream(stream);
            const video = stream.getVideoTracks()[0];
            const audio = stream.getAudioTracks()[0];
            if (video) await room.localParticipant.publishTrack(video, { name: externalActivityTrackName(current.sessionId, "video"), source: Track.Source.ScreenShare });
            if (audio) await room.localParticipant.publishTrack(audio, { name: externalActivityTrackName(current.sessionId, "audio"), source: Track.Source.ScreenShareAudio });
            if (extensionTimerRef.current !== null) window.clearTimeout(extensionTimerRef.current);
            broadcastState({ ...next, phase: "ACTIVE" });
          })
          .catch((error: unknown) => broadcastState({ ...next, phase: "ERROR", errorCode: externalActivityCaptureErrorCode(error) }));
      } else if (["TAB_CLOSED", "DEBUGGER_DETACHED", "ERROR"].includes(String(extensionEvent.type))) {
        broadcastState({ ...current, phase: "ERROR", errorCode: String(extensionEvent.type) });
      }
    };
    window.addEventListener("message", handleExtensionEvent);
    return () => window.removeEventListener("message", handleExtensionEvent);
  }, [broadcastState, enabled, isHost, room.localParticipant]);

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
    const current = activeRef.current;
    const sessionId = current?.blockId === block.id ? current.sessionId : crypto.randomUUID();
    if (isHost) {
      void startHostSession(block.id, sessionId);
    } else {
      const requested: ExternalActivityState = { blockId: block.id, sessionId, hostIdentity: null, phase: "REQUESTED", studentsLocked: false, visible: true };
      activeRef.current = requested;
      setActive(requested);
      publish({ version: 1, type: "REQUEST_OPEN", sessionId, blockId: block.id }, externalActivityHostTopic, true);
    }
  }, [enabled, isHost, publish, startHostSession]);

  const collapse = useCallback(() => {
    const current = activeRef.current;
    if (!current) return;
    if (isHost) collapseHostSession();
    else publish({ version: 1, type: "REQUEST_CLOSE", sessionId: current.sessionId, blockId: current.blockId }, externalActivityHostTopic, true);
  }, [collapseHostSession, isHost, publish]);

  const sendInput = useCallback((input: ExternalActivityInput) => {
    const current = activeRef.current;
    if (!current || current.phase !== "ACTIVE" || (!isHost && current.studentsLocked)) return;
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

  const setStudentsLocked = useCallback((locked: boolean) => {
    const current = activeRef.current;
    if (!current || !isHost) return;
    broadcastState({ ...current, studentsLocked: locked });
  }, [broadcastState, isHost]);

  const navigation = useCallback((type: "RELOAD" | "BACK") => {
    const current = activeRef.current;
    const nonce = extensionNonceRef.current;
    if (current && nonce && isHost) postExtensionCommand({ version: 1, type, sessionId: current.sessionId, nonce });
  }, [isHost, postExtensionCommand]);

  return useMemo(() => ({
    active,
    back: () => navigation("BACK"),
    collapse,
    cursors: Object.values(cursorsByIdentity),
    isHost,
    mediaStream,
    open,
    reload: () => navigation("RELOAD"),
    sendCursor,
    sendInput: sendInput as MaterialExternalActivitySync["sendInput"],
    setStudentsLocked,
    stop: () => { if (isHost) void stopHostSession(); },
  }), [active, collapse, cursorsByIdentity, isHost, mediaStream, navigation, open, sendCursor, sendInput, setStudentsLocked, stopHostSession]);
}

async function consumeCapture(streamId: string, sessionId: string): Promise<MediaStream> {
  const mandatory = { chromeMediaSource: "tab", chromeMediaSourceId: streamId };
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory } as unknown as MediaTrackConstraints,
    video: { mandatory, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 20, max: 24 } } as unknown as MediaTrackConstraints,
  });
  if (!stream.getVideoTracks().length) throw new Error(`CAPTURE_WITHOUT_VIDEO:${sessionId}`);
  return stream;
}
