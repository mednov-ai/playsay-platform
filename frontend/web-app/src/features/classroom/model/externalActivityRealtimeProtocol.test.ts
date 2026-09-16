import { describe, expect, it } from "vitest";
import {
  decodeExternalActivityRealtimeFrame,
  encodeExternalActivityRealtimeFrame,
  maximumExternalActivityRealtimePayloadBytes,
} from "./externalActivityRealtimeProtocol";

describe("external activity realtime frames", () => {
  it.each([
    { kind: "external-input", blockId: "b", sessionId: "s", eventId: "e", input: { type: "key", action: "down", key: "a" } },
    { kind: "external-result", blockId: "b", sessionId: "s", eventId: "e", result: "DISPATCHED" },
    { kind: "external-cursor", blockId: "b", sessionId: "s", x: 0.5, y: 0.4, identity: "opaque", name: "Participant", color: "#fff" },
  ] as const)("round trips strict allowed frames", (message) => {
    const encoded = encodeExternalActivityRealtimeFrame(message);
    expect(decodeExternalActivityRealtimeFrame(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength))).toEqual(message);
  });

  it("rejects unrelated, malformed and oversized frames", () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;
    expect(() => decodeExternalActivityRealtimeFrame(encode({ kind: "action-request", blockId: "b", sessionId: "s" }))).toThrow();
    expect(() => decodeExternalActivityRealtimeFrame(encode({ kind: "external-result", blockId: "b", sessionId: "s", eventId: "e", result: "raw error" }))).toThrow();
    expect(() => decodeExternalActivityRealtimeFrame(new Uint8Array(maximumExternalActivityRealtimePayloadBytes + 1).buffer)).toThrow();
  });
});
