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
