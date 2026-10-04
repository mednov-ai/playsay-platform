import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type { WebSocket, WebSocketServer } from "ws";
import { CollaborationHeartbeat } from "./heartbeat.js";
import { CollaborationMetrics } from "./metrics.js";
import { ConnectionDiagnostics } from "./connectionDiagnostics.js";

afterEach(() => vi.useRealTimers());

it("records heartbeat lifecycle and coarse transport errors without socket data", () => {
  vi.useFakeTimers();
  const lines: string[] = [];
  const metrics = new CollaborationMetrics(new ConnectionDiagnostics(true, line => lines.push(line)));
  const socket = Object.assign(new EventEmitter(), {
    OPEN: 1, readyState: 1, ping: vi.fn(),
    terminate: () => socket.emit("close", 1006, "secret-token-room-user"),
  });
  const heartbeat = new CollaborationHeartbeat({ clients: new Set([socket]) } as unknown as WebSocketServer, 20_000, 2, metrics);
  heartbeat.track(socket as unknown as WebSocket, "yjs");
  socket.emit("error", new Error("secret-token-room-user"));
  heartbeat.start();
  vi.advanceTimersByTime(60_000);
  heartbeat.stop();
  expect(lines.map(line => JSON.parse(line).event)).toEqual([
    "connection_opened", "connection_error", "heartbeat_termination", "connection_closed",
  ]);
  expect(JSON.parse(lines[3]!)).toMatchObject({ channel: "yjs", close_class: "heartbeat" });
  expect(lines.join("")).not.toContain("secret-token-room-user");
});

it("limits burst and stdout backlog without delaying transport", () => {
  const write = vi.fn(); const dropped = vi.fn(); let time = 1000; let pending = 0;
  const log = new ConnectionDiagnostics(true, write, () => pending, () => time, dropped);
  for (let i = 0; i < 110; i++) log.record("connection_opened", "game");
  expect(write).toHaveBeenCalledTimes(100); expect(dropped).toHaveBeenCalledTimes(10);
  time = 2000; pending = 16_384; log.record("connection_error", "game");
  expect(write).toHaveBeenCalledTimes(100); expect(dropped).toHaveBeenCalledTimes(11);
  pending = 0; log.record("connection_closed", "game", "normal", Infinity);
  expect(JSON.parse(write.mock.calls[100]![0])).not.toHaveProperty("age_seconds");
});

it("is silent when disabled", () => {
  const write = vi.fn(); new ConnectionDiagnostics(false, write).record("connection_opened", "yjs");
  expect(write).not.toHaveBeenCalled();
});
