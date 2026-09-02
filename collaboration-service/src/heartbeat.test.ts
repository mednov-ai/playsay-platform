import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocket, WebSocketServer } from "ws";
import {
  CollaborationHeartbeat,
  type CollaborationConnectionObserver,
} from "./heartbeat.js";

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  ping = vi.fn();
  terminate = vi.fn(() => {
    this.readyState = 3;
    this.emit("close", 1006);
  });
}

function observer(): CollaborationConnectionObserver {
  return {
    recordConnectionClosed: vi.fn(),
    recordConnectionOpened: vi.fn(),
    recordHeartbeatTermination: vi.fn(),
  };
}

afterEach(() => vi.useRealTimers());

describe("CollaborationHeartbeat", () => {
  it("terminates a stale connection within the configured window", () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const server = { clients: new Set([socket]) } as unknown as WebSocketServer;
    const metrics = observer();
    const heartbeat = new CollaborationHeartbeat(server, 20_000, 2, metrics);

    heartbeat.track(socket as unknown as WebSocket, "yjs");
    heartbeat.start();
    vi.advanceTimersByTime(59_999);
    expect(socket.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(metrics.recordHeartbeatTermination).toHaveBeenCalledWith("yjs");
    expect(metrics.recordConnectionClosed).toHaveBeenCalledWith(
      "yjs",
      "heartbeat",
      expect.any(Number),
    );
    heartbeat.stop();
  });

  it("keeps a connection alive when pong responses arrive", () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const server = { clients: new Set([socket]) } as unknown as WebSocketServer;
    const metrics = observer();
    const heartbeat = new CollaborationHeartbeat(server, 20_000, 2, metrics);

    heartbeat.track(socket as unknown as WebSocket, "game");
    heartbeat.start();
    for (let index = 0; index < 4; index += 1) {
      vi.advanceTimersByTime(20_000);
      socket.emit("pong");
    }

    expect(socket.terminate).not.toHaveBeenCalled();
    heartbeat.stop();
    vi.advanceTimersByTime(60_000);
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it("tracks intentional tabs independently while stale replacements are cleaned", () => {
    vi.useFakeTimers();
    const staleTab = new FakeSocket();
    const responsiveTab = new FakeSocket();
    const clients = new Set([staleTab, responsiveTab]);
    const server = { clients } as unknown as WebSocketServer;
    const metrics = observer();
    const heartbeat = new CollaborationHeartbeat(server, 20_000, 2, metrics);

    heartbeat.track(staleTab as unknown as WebSocket, "yjs");
    heartbeat.track(responsiveTab as unknown as WebSocket, "yjs");
    heartbeat.start();
    for (let index = 0; index < 3; index += 1) {
      vi.advanceTimersByTime(20_000);
      responsiveTab.emit("pong");
    }

    expect(staleTab.terminate).toHaveBeenCalledOnce();
    expect(responsiveTab.terminate).not.toHaveBeenCalled();

    const replacement = new FakeSocket();
    clients.add(replacement);
    heartbeat.track(replacement as unknown as WebSocket, "yjs");
    vi.advanceTimersByTime(20_000);
    replacement.emit("pong");
    responsiveTab.emit("pong");
    expect(metrics.recordConnectionOpened).toHaveBeenCalledTimes(3);
    heartbeat.stop();
  });
});
