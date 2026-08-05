import type {
  MaterialHtmlGameRealtime,
  MaterialHtmlGameRealtimeMessage,
  MaterialHtmlGameRealtimeRegistration,
  MaterialHtmlGameSdkOrderedAction,
} from "../../materials/model/materialDocument";
import { recordGameSyncDiagnostic } from "../../materials/model/gameSyncDiagnostics";
import {
  decodeGameRealtimeFrame,
  encodeGameRealtimeMessage,
  gameRealtimeSubprotocol,
  type GameRealtimeMode,
} from "./gameRealtimeProtocol";

type Registration = MaterialHtmlGameRealtimeRegistration & { id: symbol };

declare global {
  interface Window {
    __PLAY_SAY_GAME_REALTIME__?: {
      mode: GameRealtimeMode | "fallback" | null;
      status: "closed" | "connecting" | "open";
    };
  }
}

const closeDelayMs = 3_000;
const maximumHistory = 200;
const maximumBufferedBytes = 4 * 1024 * 1024;

export function createGameRealtimeClient({
  fallback,
  getActorId,
  getUrl,
}: {
  fallback: (message: MaterialHtmlGameRealtimeMessage) => void;
  getActorId: () => string;
  getUrl: () => Promise<string>;
}): MaterialHtmlGameRealtime & { close: () => void } {
  const registrations = new Map<symbol, Registration>();
  const pendingRequests = new Map<string, MaterialHtmlGameRealtimeMessage>();
  const actionHistory = new Map<string, MaterialHtmlGameSdkOrderedAction[]>();
  let socket: WebSocket | null = null;
  let mode: GameRealtimeMode | null = null;
  let disposed = false;
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;
  let closeTimer: number | null = null;

  const reportStatus = (
    status: "closed" | "connecting" | "open",
    nextMode: GameRealtimeMode | "fallback" | null,
  ) => {
    window.__PLAY_SAY_GAME_REALTIME__ = { mode: nextMode, status };
  };
  reportStatus("closed", "fallback");

  const historyKey = (blockId: string, runId: string) => `${blockId}\u0000${runId}`;

  const fallbackDataMessage = (message: MaterialHtmlGameRealtimeMessage) => {
    if (
      message.kind === "action-request"
      || message.kind === "ordered-action"
      || message.kind === "effect"
    ) {
      fallback(message);
    }
  };

  const sendFast = (message: MaterialHtmlGameRealtimeMessage): boolean => {
    if (socket?.readyState !== WebSocket.OPEN || mode === null) {
      return false;
    }
    if (socket.bufferedAmount >= maximumBufferedBytes) {
      socket.close(1013, "game realtime client buffer is full");
      return false;
    }
    socket.send(encodeGameRealtimeMessage(message));
    return true;
  };

  const rememberAction = (action: MaterialHtmlGameSdkOrderedAction) => {
    const key = historyKey(action.blockId, action.runId);
    const history = actionHistory.get(key) ?? [];
    if (!history.some((candidate) => candidate.id === action.id)) {
      history.push(action);
      if (history.length > maximumHistory) {
        history.splice(0, history.length - maximumHistory);
      }
      actionHistory.set(key, history);
    }
    pendingRequests.delete(action.eventId);
  };

  const publish = (message: MaterialHtmlGameRealtimeMessage) => {
    if (message.kind === "action-request") {
      pendingRequests.set(message.request.eventId, message);
      while (pendingRequests.size > maximumHistory) {
        pendingRequests.delete(pendingRequests.keys().next().value as string);
      }
    } else if (message.kind === "ordered-action") {
      rememberAction(message.action);
    }
    const sentFast = sendFast(message);
    if (!sentFast || mode === "shadow") {
      fallbackDataMessage(message);
    }
  };

  const matchingRegistrations = (message: MaterialHtmlGameRealtimeMessage): Registration[] => {
    const blockId = "blockId" in message
      ? message.blockId
      : message.kind === "action-request"
        ? message.request.blockId
        : message.kind === "ordered-action"
          ? message.action.blockId
          : message.effect.blockId;
    const runId = "runId" in message
      ? message.runId
      : message.kind === "action-request"
        ? message.request.runId
        : message.kind === "ordered-action"
          ? message.action.runId
          : message.effect.runId;
    return [...registrations.values()].filter((registration) => (
      registration.blockId === blockId && registration.runId === runId
    ));
  };

  const respondToResume = (message: Extract<MaterialHtmlGameRealtimeMessage, { kind: "resume" }>) => {
    const authority = matchingRegistrations(message)
      .find((registration) => registration.isAuthority);
    if (!authority) {
      return;
    }
    const history = actionHistory.get(historyKey(message.blockId, message.runId)) ?? [];
    const missing = history.filter((action) => action.authorityRevision > message.lastRevision);
    if (
      missing.length > 0
      && missing[0]?.authorityRevision === message.lastRevision + 1
    ) {
      missing.forEach((action) => sendFast({ action, kind: "ordered-action" }));
      return;
    }
    if (authority.getRevision() > message.lastRevision) {
      sendFast({
        blockId: message.blockId,
        kind: "recovery-required",
        requesterId: message.requesterId,
        runId: message.runId,
      });
    }
  };

  const dispatch = (message: MaterialHtmlGameRealtimeMessage) => {
    if (message.kind === "ordered-action") {
      rememberAction(message.action);
      recordGameSyncDiagnostic({
        blockId: message.action.blockId,
        eventId: message.action.eventId,
        revision: message.action.authorityRevision,
        runId: message.action.runId,
        stage: "socket-received",
      });
    } else if (message.kind === "resume") {
      respondToResume(message);
      return;
    } else if (
      message.kind === "recovery-required"
      && message.requesterId !== getActorId()
    ) {
      return;
    }
    matchingRegistrations(message).forEach((registration) => registration.onMessage(message));
  };

  const sendResume = (registration: Registration) => {
    if (registration.isAuthority || mode === null) {
      return;
    }
    sendFast({
      blockId: registration.blockId,
      kind: "resume",
      lastRevision: registration.getRevision(),
      requesterId: getActorId(),
      runId: registration.runId,
    });
  };

  const scheduleReconnect = () => {
    if (disposed || registrations.size === 0 || reconnectTimer !== null) {
      return;
    }
    // A server with GAME_REALTIME_MODE=off rejects the optional subprotocol.
    // Keep the existing transport responsive without hammering the server while
    // an older/off deployment remains active.
    const delay = Math.min(30_000, 500 * (2 ** reconnectAttempt));
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (
      disposed
      || registrations.size === 0
      || socket?.readyState === WebSocket.OPEN
      || socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    try {
      const next = new WebSocket(await getUrl(), gameRealtimeSubprotocol);
      reportStatus("connecting", null);
      next.binaryType = "arraybuffer";
      socket = next;
      next.onmessage = (event) => {
        if (socket !== next || !(event.data instanceof ArrayBuffer)) {
          return;
        }
        try {
          const frame = decodeGameRealtimeFrame(event.data);
          if (frame.kind === "welcome") {
            mode = frame.mode;
            reportStatus("open", mode);
            reconnectAttempt = 0;
            pendingRequests.forEach((message) => sendFast(message));
            registrations.forEach(sendResume);
          } else {
            dispatch(frame.message);
          }
        } catch {
          next.close(1003, "invalid game realtime frame");
        }
      };
      next.onclose = () => {
        if (socket === next) {
          socket = null;
          const previousMode = mode;
          mode = null;
          reportStatus("closed", "fallback");
          if (previousMode === "primary") {
            pendingRequests.forEach(fallbackDataMessage);
          }
        }
        scheduleReconnect();
      };
      next.onerror = () => next.close();
    } catch {
      socket = null;
      mode = null;
      reportStatus("closed", "fallback");
      scheduleReconnect();
    }
  };

  return {
    acknowledge(eventId) {
      pendingRequests.delete(eventId);
    },
    acquire(registration) {
      const id = Symbol(registration.blockId);
      const stored = { ...registration, id };
      registrations.set(id, stored);
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      if (mode !== null) {
        sendResume(stored);
      } else {
        void connect();
      }
      return () => {
        registrations.delete(id);
        if (registrations.size === 0 && closeTimer === null) {
          closeTimer = window.setTimeout(() => {
            closeTimer = null;
            socket?.close(1000, "no active SDK game");
            socket = null;
            mode = null;
            reportStatus("closed", "fallback");
          }, closeDelayMs);
        }
      };
    },
    close() {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      socket?.close(1000, "workspace disposed");
      socket = null;
      mode = null;
      reportStatus("closed", null);
      registrations.clear();
      pendingRequests.clear();
      actionHistory.clear();
    },
    publish,
  };
}
