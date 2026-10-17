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

  it("pauses the socket and outbound input while retaining game registrations", async () => {
    const fallback = vi.fn(), getUrl = vi.fn(async () => "ws://localhost/collab/ws");
    const client = createGameRealtimeClient({ fallback, getActorId: () => "student", getUrl });
    const release = client.acquire({ blockId: "game-a", runId: "run-a", getRevision: () => 0, isAuthority: false, onMessage: vi.fn() });
    await vi.waitFor(() => expect(sockets.length).toBe(1)); sockets[0].open("primary");
    fallback.mockClear();
    client.setSuspended(true); client.publish(requestMessage);
    expect(sockets[0].readyState).toBe(FakeWebSocket.CLOSED); expect(fallback).not.toHaveBeenCalled();
    client.setSuspended(false); await vi.waitFor(() => expect(sockets.length).toBe(2));
    expect(getUrl).toHaveBeenCalledTimes(2); release(); client.close();
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
    fallback.mockClear();
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

    fallback.mockClear();
    client.publish(requestMessage);
    expect(fallback).not.toHaveBeenCalled();

    socket?.close();

    expect(fallback).toHaveBeenCalledWith(requestMessage);
    client.close();
  });
  it.each(["unavailable", "shadow"] as const)("replays the first two actions over fallback after a fresh replica joins (%s)", async (mode) => {
    const fallback = vi.fn();
    const authority = createGameRealtimeClient({ fallback, getActorId: () => "teacher", getUrl: async () => "ws://localhost" });
    authority.acquire({ blockId: "game-a", runId: "run-a", getRevision: () => 2, isAuthority: true, onMessage: vi.fn() });
    await Promise.resolve();
    if (mode === "shadow") sockets[0]?.open("shadow");
    const actions = [1, 2].map(revision => ({ ...requestMessage.request, id: `action-${revision}`, authorityRevision: revision, logicalTime: revision }));
    actions.forEach(action => authority.publish({ kind: "ordered-action", action }));
    fallback.mockClear();
    authority.receiveFallback({ kind: "resume", blockId: "game-a", runId: "run-a", requesterId: "new-student", lastRevision: 0 });
    expect(fallback.mock.calls.map(([message]) => message)).toEqual(actions.map(action => ({ kind: "ordered-action", action })));
    authority.close();
  });

});
