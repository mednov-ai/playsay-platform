// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import * as encoding from "lib0/encoding";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaterialHtmlGameRealtimeMessage } from "../../materials/model/materialDocument";
import { createGameRealtimeClient } from "./gameRealtimeClient";

const sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readonly protocol: string;
  readonly sent: Uint8Array[] = [];
  binaryType = "";
  bufferedAmount = 0;
  readyState = FakeWebSocket.CONNECTING;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;

  constructor(_url: string, protocol: string) {
    this.protocol = protocol;
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
    encoding.writeVarUint8Array(
      encoder,
      new TextEncoder().encode(JSON.stringify({ mode })),
    );
    const frame = encoding.toUint8Array(encoder);
    this.onmessage?.({
      data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer,
    });
  }

  send(payload: Uint8Array) {
    this.sent.push(payload);
  }
}

const requestMessage = {
  kind: "action-request",
  request: {
    actorId: "student",
    actorSequence: 1,
    at: 10,
    blockId: "game-a",
    eventId: "event-a",
    gameId: "counter",
    id: "event-a",
    payload: { amount: 1 },
    runId: "run-a",
    stateVersion: "1",
    type: "increment",
  },
} satisfies MaterialHtmlGameRealtimeMessage;

describe("createGameRealtimeClient", () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("dual-publishes in shadow and uses only the fast lane in primary", async () => {
    const fallback = vi.fn();
    const client = createGameRealtimeClient({
      fallback,
      getActorId: () => "student",
      getUrl: async () => "ws://localhost/collab/ws",
    });
    const release = client.acquire({
      blockId: "game-a",
      getRevision: () => 0,
      isAuthority: false,
      onMessage: vi.fn(),
      runId: "run-a",
    });
    await Promise.resolve();
    sockets[0]?.open("shadow");

    client.publish(requestMessage);
    expect(sockets[0]?.sent.length).toBeGreaterThan(1);
    expect(fallback).toHaveBeenCalledWith(requestMessage);

    release();
    client.close();

    fallback.mockClear();
    const primary = createGameRealtimeClient({
      fallback,
      getActorId: () => "student",
      getUrl: async () => "ws://localhost/collab/ws",
    });
    primary.acquire({
      blockId: "game-a",
      getRevision: () => 0,
      isAuthority: false,
      onMessage: vi.fn(),
      runId: "run-a",
    });
    await Promise.resolve();
    sockets.at(-1)?.open("primary");
    primary.publish(requestMessage);

    expect(fallback).not.toHaveBeenCalled();
    primary.close();
  });

  it("falls back immediately when the fast connection is unavailable", () => {
    const fallback = vi.fn();
    const client = createGameRealtimeClient({
      fallback,
      getActorId: () => "student",
      getUrl: async () => "ws://localhost/collab/ws",
    });

    client.publish(requestMessage);

    expect(fallback).toHaveBeenCalledWith(requestMessage);
    client.close();
  });

  it("replays pending primary requests through fallback after disconnect", async () => {
    const fallback = vi.fn();
    const client = createGameRealtimeClient({
      fallback,
      getActorId: () => "student",
      getUrl: async () => "ws://localhost/collab/ws",
    });
    client.acquire({
      blockId: "game-a",
      getRevision: () => 0,
      isAuthority: false,
      onMessage: vi.fn(),
      runId: "run-a",
    });
    await Promise.resolve();
    const socket = sockets[0];
    socket?.open("primary");

    client.publish(requestMessage);
    expect(fallback).not.toHaveBeenCalled();

    socket?.close();

    expect(fallback).toHaveBeenCalledWith(requestMessage);
    client.close();
  });
});
