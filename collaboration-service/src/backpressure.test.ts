import { WebSocket } from "ws";
import { describe, expect, it, vi } from "vitest";
import {
  sendWithBackpressure,
  type CollaborationBackpressureObserver,
} from "./backpressure.js";

const policy = {
  softLimitBytes: 1024,
  hardLimitBytes: 4096,
};

function socket(bufferedAmount: number) {
  return {
    bufferedAmount,
    close: vi.fn(),
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function observer(): CollaborationBackpressureObserver {
  return {
    recordDropped: vi.fn(),
    recordForcedClose: vi.fn(),
  };
}

describe("sendWithBackpressure", () => {
  it("sends durable sync updates below the hard limit", () => {
    const ws = socket(2048);
    const metrics = observer();

    expect(sendWithBackpressure(ws, new Uint8Array([1]), "sync", policy, metrics)).toBe(true);
    expect(ws.send).toHaveBeenCalledOnce();
    expect(metrics.recordDropped).not.toHaveBeenCalled();
  });

  it("drops awareness and ephemeral traffic at the soft limit", () => {
    const ws = socket(1024);
    const metrics = observer();

    expect(sendWithBackpressure(ws, new Uint8Array([1]), "awareness", policy, metrics)).toBe(false);
    expect(ws.send).not.toHaveBeenCalled();
    expect(metrics.recordDropped).toHaveBeenCalledWith("awareness");
  });

  it("closes a slow client at the hard limit so it can reconnect and resync", () => {
    const ws = socket(4096);
    const metrics = observer();

    expect(sendWithBackpressure(ws, new Uint8Array([1]), "sync", policy, metrics)).toBe(false);
    expect(metrics.recordForcedClose).toHaveBeenCalledOnce();
    expect(ws.close).toHaveBeenCalledWith(1013, expect.stringContaining("reconnect"));
  });
});
