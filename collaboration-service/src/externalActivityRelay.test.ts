import { WebSocket } from "ws";
import { describe, expect, it, vi } from "vitest";
import { relayExternalActivityFrame, type ExternalActivityRelayObserver } from "./externalActivityRelay.js";
import { externalActivityRealtimeSubprotocol } from "./externalActivityProtocol.js";

const policy = { softLimitBytes: 64, hardLimitBytes: 128 };
const bytes = new TextEncoder().encode(JSON.stringify({
  kind: "external-input",
  blockId: "block-1",
  sessionId: "session-1",
  eventId: "event-1",
  input: { type: "key", action: "down", key: "a" },
}));

function socket(protocol = externalActivityRealtimeSubprotocol, bufferedAmount = 0) {
  return {
    OPEN: WebSocket.OPEN,
    bufferedAmount,
    close: vi.fn(),
    protocol,
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function observer(): ExternalActivityRelayObserver {
  return {
    recordDropped: vi.fn(),
    recordForcedClose: vi.fn(),
    recordExternalActivityRelay: vi.fn(),
    recordExternalActivityFailure: vi.fn(),
  };
}

describe("external activity relay", () => {
  it("relays only to other external activity sockets", () => {
    const source = socket();
    const target = socket();
    const yjs = socket("");
    const game = socket("playsay-game-v1");
    relayExternalActivityFrame([source, target, yjs, game], source, bytes, policy, observer());
    expect(target.send).toHaveBeenCalledWith(bytes);
    expect(source.send).not.toHaveBeenCalled();
    expect(yjs.send).not.toHaveBeenCalled();
    expect(game.send).not.toHaveBeenCalled();
  });

  it("closes a slow external socket at the independent hard limit", () => {
    const source = socket();
    const target = socket(externalActivityRealtimeSubprotocol, 128);
    relayExternalActivityFrame([source, target], source, bytes, policy, observer());
    expect(target.close).toHaveBeenCalledWith(1013, expect.stringContaining("reconnect"));
    expect(target.send).not.toHaveBeenCalled();
  });

  it("accepts a replacement socket after disconnect without affecting the old socket", () => {
    const source = socket();
    const disconnected = socket();
    disconnected.readyState = WebSocket.CLOSED;
    const replacement = socket();
    relayExternalActivityFrame([source, disconnected, replacement], source, bytes, policy, observer());
    expect(disconnected.send).not.toHaveBeenCalled();
    expect(replacement.send).toHaveBeenCalledOnce();
  });
});
