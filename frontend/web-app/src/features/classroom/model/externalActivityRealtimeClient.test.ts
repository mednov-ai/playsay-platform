// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import * as encoding from "lib0/encoding";
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
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;

  constructor() {
    sockets.push(this);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  open(mode: "shadow" | "primary") {
    this.readyState = FakeWebSocket.OPEN;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 3);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, 0);
    encoding.writeVarUint8Array(encoder, new TextEncoder().encode(JSON.stringify({ mode })));
    const frame = encoding.toUint8Array(encoder);
    this.onmessage?.({
      data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer,
    });
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

  it("uses the fast lane in both server modes without a LiveKit duplicate", async () => {
    const client = createExternalActivityRealtimeClient({
      getUrl: async () => "ws://localhost/collab/ws",
    });
    const release = client.acquire(vi.fn());
    await Promise.resolve();
    sockets[0]?.open("shadow");

    expect(client.publish(inputMessage)).toBe(true);
    expect(sockets[0]?.sent).toHaveLength(1);

    sockets[0]?.open("primary");
    expect(client.publish(inputMessage)).toBe(true);
    expect(sockets[0]?.sent).toHaveLength(2);

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
});
