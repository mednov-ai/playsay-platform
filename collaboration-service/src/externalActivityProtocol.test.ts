import { describe, expect, it } from "vitest";
import { maxExternalActivityPayloadBytes, parseExternalActivityFrame } from "./externalActivityProtocol.js";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("external activity realtime protocol", () => {
  it.each([
    { kind: "external-input", blockId: "b", sessionId: "s", eventId: "e", input: { type: "key", action: "down", key: "a" } },
    { kind: "external-result", blockId: "b", sessionId: "s", eventId: "e", result: "DISPATCHED" },
    { kind: "external-cursor", blockId: "b", sessionId: "s", x: 0.5, y: 0.4, identity: "opaque-client", name: "Participant", color: "#fff" },
  ])("accepts the strict external frame allowlist", (frame) => {
    expect(parseExternalActivityFrame(encode(frame))).toEqual(frame);
  });

  it.each([
    { kind: "action-request", blockId: "b", sessionId: "s", eventId: "e" },
    { kind: "yjs-sync", blockId: "b", sessionId: "s" },
    { kind: "external-input", blockId: "b", sessionId: "s", eventId: "e", input: { type: "clipboard", value: "private" } },
    { kind: "external-result", blockId: "b", sessionId: "s", eventId: "e", result: "DISPATCHED", providerUrl: "https://private" },
  ])("rejects game, Yjs, unknown, and content-bearing frames", (frame) => {
    expect(() => parseExternalActivityFrame(encode(frame))).toThrow();
  });

  it("rejects oversized frames", () => {
    expect(() => parseExternalActivityFrame(new Uint8Array(maxExternalActivityPayloadBytes + 1))).toThrow();
  });
});
