import { readFileSync } from "node:fs";
import * as encoding from "lib0/encoding";
import { describe, expect, it } from "vitest";
import {
  encodeGameWelcome,
  gameMessageTypes,
  gameProtocolVersion,
  maxGamePayloadBytes,
  messageGame,
  validateGameFrame,
} from "./gameProtocol.js";

function frame(type: number, payload: Uint8Array, version = gameProtocolVersion): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageGame);
  encoding.writeVarUint(encoder, version);
  encoding.writeVarUint(encoder, type);
  encoding.writeVarUint8Array(encoder, payload);
  return encoding.toUint8Array(encoder);
}

describe("game realtime protocol", () => {
  it("accepts a bounded client action frame", () => {
    expect(validateGameFrame(frame(
      gameMessageTypes.actionRequest,
      new TextEncoder().encode("{}"),
    ))).toEqual({
      payloadBytes: 2,
      type: gameMessageTypes.actionRequest,
    });
  });

  it("rejects welcome forgery, unknown versions and oversized payloads", () => {
    expect(() => validateGameFrame(frame(gameMessageTypes.welcome, new Uint8Array())))
      .toThrow(/message type/);
    expect(() => validateGameFrame(frame(
      gameMessageTypes.actionRequest,
      new Uint8Array(),
      2,
    ))).toThrow(/version/);
    expect(() => validateGameFrame(frame(
      gameMessageTypes.actionRequest,
      new Uint8Array(maxGamePayloadBytes + 1),
    ))).toThrow(/too large/);
  });

  it("emits a server-only welcome frame", () => {
    expect(encodeGameWelcome("shadow")).toBeInstanceOf(Uint8Array);
  });
});

const baseline = JSON.parse(readFileSync(new URL("../../contracts/classroom-game-v1.frames.json", import.meta.url), "utf8")) as {
  frames: Array<{ name: string; hex: string; decoded: { mode?: "shadow" | "primary" } }>;
};

describe("published v1 frames", () => {
  it.each(baseline.frames)("handles $name from the baseline", ({ hex, decoded }) => {
    const bytes = Buffer.from(hex, "hex");
    if (decoded.mode) {
      expect(Buffer.from(encodeGameWelcome(decoded.mode))).toEqual(bytes);
      expect(() => validateGameFrame(bytes)).toThrow();
    } else {
      expect(validateGameFrame(bytes).type).toBe(bytes[2]);
    }
    expect(() => validateGameFrame(bytes.subarray(0, bytes.length - 1))).toThrow();
    expect(() => validateGameFrame(Buffer.concat([bytes, Buffer.from([0])]))).toThrow();
  });

  it("rejects other message classes and unknown game types", () => {
    for (const bytes of [[4, 1, 1, 0], [3, 1, 7, 0]]) {
      expect(() => validateGameFrame(Uint8Array.from(bytes))).toThrow();
    }
  });

  it("accepts the exact encoded payload limit", () => {
    expect(validateGameFrame(frame(gameMessageTypes.effect, new Uint8Array(24 * 1024))).payloadBytes).toBe(24 * 1024);
  });
});
