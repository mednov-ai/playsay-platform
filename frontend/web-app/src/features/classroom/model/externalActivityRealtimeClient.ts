import type {
  ExternalActivityRealtime,
  ExternalActivityRealtimeMessage,
} from "./externalActivityProtocol";
import {
  decodeExternalActivityRealtimeFrame,
  encodeExternalActivityRealtimeFrame,
  externalActivityRealtimeSubprotocol,
} from "./externalActivityRealtimeProtocol";

const maximumBufferedBytes = 512 * 1024;

export function createExternalActivityRealtimeClient({
  getUrl,
}: {
  getUrl: () => Promise<string>;
}): ExternalActivityRealtime & { setSuspended: (value: boolean) => void } {
  const subscribers = new Set<(message: ExternalActivityRealtimeMessage) => void>();
  let socket: WebSocket | null = null;
  let disposed = false;
  let suspended = false;
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;

  const scheduleReconnect = () => {
    if (disposed || suspended || subscribers.size === 0 || reconnectTimer !== null) return;
    const delay = Math.min(10_000, 250 * (2 ** reconnectAttempt));
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (
      disposed || suspended
      || subscribers.size === 0
      || socket?.readyState === WebSocket.OPEN
      || socket?.readyState === WebSocket.CONNECTING
    ) return;
    try {
      const url = await getUrl();
      if (disposed || suspended) return;
      const next = new WebSocket(url, externalActivityRealtimeSubprotocol);
      next.binaryType = "arraybuffer";
      socket = next;
      next.onmessage = (event) => {
        if (suspended || socket !== next || !(event.data instanceof ArrayBuffer)) return;
        try {
          const message = decodeExternalActivityRealtimeFrame(event.data);
          subscribers.forEach((subscriber) => subscriber(message));
        } catch {
          next.close(1003, "invalid realtime frame");
        }
      };
      next.onopen = () => { reconnectAttempt = 0; };
      next.onclose = () => {
        if (socket === next) {
          socket = null;
        }
        scheduleReconnect();
      };
      next.onerror = () => next.close();
    } catch {
      socket = null;
      scheduleReconnect();
    }
  };

  return {
    setSuspended(value: boolean) {
      suspended = value;
      if (value) { if (reconnectTimer !== null) window.clearTimeout(reconnectTimer); reconnectTimer = null; socket?.close(1000, "surface paused"); socket = null; }
      else void connect();
    },
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
    },
    publish(message) {
      if (suspended) return false;
      if (
        socket?.readyState !== WebSocket.OPEN
        || socket.bufferedAmount >= maximumBufferedBytes
      ) return false;
      socket.send(encodeExternalActivityRealtimeFrame(message));
      return true;
    },
  };
}
