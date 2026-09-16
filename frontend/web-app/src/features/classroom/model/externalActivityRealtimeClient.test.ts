// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExternalActivityRealtimeClient } from "./externalActivityRealtimeClient";

const sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readonly sent: Uint8Array[] = [];
  binaryType = "";
  bufferedAmount = 0;
  readyState = FakeWebSocket.CONNECTING;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;

  constructor() {
    sockets.push(this);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(payload: Uint8Array) {
    this.sent.push(payload);
  }
}

const inputMessage = {
  blockId: "external-a",
  eventId: "event-a",
  input: { action: "move", type: "pointer", x: 120, y: 80 },
  kind: "external-input",
  sessionId: "session-a",
} as const;

describe("createExternalActivityRealtimeClient", () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the dedicated fast lane without a LiveKit duplicate", async () => {
    const client = createExternalActivityRealtimeClient({
      getUrl: async () => "ws://localhost/collab/ws",
    });
    const release = client.acquire(vi.fn());
    await Promise.resolve();
    sockets[0]?.open();

    expect(client.publish(inputMessage)).toBe(true);
    expect(sockets[0]?.sent).toHaveLength(1);

    expect(client.publish(inputMessage)).toBe(true);
    expect(sockets[0]?.sent).toHaveLength(2);

    release();
    client.close();
  });

  it("requests the external activity subprotocol independently from game mode", async () => {
    const protocols: string[] = [];
    class ProtocolSocket extends FakeWebSocket {
      constructor(_url: string, protocol: string) {
        super();
        protocols.push(protocol);
      }
    }
    vi.stubGlobal("WebSocket", ProtocolSocket);
    const client = createExternalActivityRealtimeClient({ getUrl: async () => "ws://localhost/collab/ws" });
    const release = client.acquire(vi.fn());
    await Promise.resolve();
    expect(protocols).toEqual(["playsay-external-activity-v1"]);
    release();
    client.close();
  });

  it("falls back while the fast socket is unavailable", () => {
    const client = createExternalActivityRealtimeClient({
      getUrl: async () => "ws://localhost/collab/ws",
    });

    expect(client.publish(inputMessage)).toBe(false);
    client.close();
  });

  it("reconnects after transport close while subscribers remain", async () => {
    vi.useFakeTimers();
    const client = createExternalActivityRealtimeClient({ getUrl: async () => "ws://localhost/collab/ws" });
    const release = client.acquire(vi.fn());
    await Promise.resolve();
    sockets[0]?.open();
    sockets[0]?.close();

    await vi.advanceTimersByTimeAsync(250);
    expect(sockets).toHaveLength(2);

    release();
    client.close();
    vi.useRealTimers();
  });
});
