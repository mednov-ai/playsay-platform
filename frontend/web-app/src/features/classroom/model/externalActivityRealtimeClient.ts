import type {
  ExternalActivityRealtime,
  ExternalActivityRealtimeMessage,
} from "./externalActivityProtocol";
import {
  decodeGameRealtimeFrame,
  encodeExternalActivityRealtimeMessage,
  gameRealtimeSubprotocol,
  type GameRealtimeMode,
} from "./gameRealtimeProtocol";

const maximumBufferedBytes = 512 * 1024;

export function createExternalActivityRealtimeClient({
  getUrl,
}: {
  getUrl: () => Promise<string>;
}): ExternalActivityRealtime {
  const subscribers = new Set<(message: ExternalActivityRealtimeMessage) => void>();
  let socket: WebSocket | null = null;
  let mode: GameRealtimeMode | null = null;
  let disposed = false;
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;

  const scheduleReconnect = () => {
    if (disposed || subscribers.size === 0 || reconnectTimer !== null) return;
    const delay = Math.min(10_000, 250 * (2 ** reconnectAttempt));
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (
      disposed
      || subscribers.size === 0
      || socket?.readyState === WebSocket.OPEN
      || socket?.readyState === WebSocket.CONNECTING
    ) return;
    try {
      const next = new WebSocket(await getUrl(), gameRealtimeSubprotocol);
      next.binaryType = "arraybuffer";
      socket = next;
      next.onmessage = (event) => {
        if (socket !== next || !(event.data instanceof ArrayBuffer)) return;
        try {
          const frame = decodeGameRealtimeFrame(event.data);
          if (frame.kind === "welcome") {
            mode = frame.mode;
            reconnectAttempt = 0;
            return;
          }
          if (
            frame.message.kind === "external-input"
            || frame.message.kind === "external-cursor"
          ) {
            subscribers.forEach((subscriber) => subscriber(frame.message as ExternalActivityRealtimeMessage));
          }
        } catch {
          next.close(1003, "invalid realtime frame");
        }
      };
      next.onclose = () => {
        if (socket === next) {
          socket = null;
          mode = null;
        }
        scheduleReconnect();
      };
      next.onerror = () => next.close();
    } catch {
      socket = null;
      mode = null;
      scheduleReconnect();
    }
  };

  return {
    acquire(onMessage) {
      subscribers.add(onMessage);
      void connect();
      return () => {
        subscribers.delete(onMessage);
        if (subscribers.size === 0) {
          if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
          socket?.close(1000, "external activity inactive");
          socket = null;
          mode = null;
        }
      };
    },
    close() {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      subscribers.clear();
      socket?.close(1000, "workspace disposed");
      socket = null;
      mode = null;
    },
    publish(message) {
      if (
        socket?.readyState !== WebSocket.OPEN
        || mode === null
        || socket.bufferedAmount >= maximumBufferedBytes
      ) return false;
      socket.send(encodeExternalActivityRealtimeMessage(message));
      return mode === "primary";
    },
  };
}
