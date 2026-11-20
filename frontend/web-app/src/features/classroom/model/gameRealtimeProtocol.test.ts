import { readFileSync } from "node:fs";
import * as encoding from "lib0/encoding";
import { describe, expect, it } from "vitest";
import type { MaterialHtmlGameRealtimeMessage } from "../../materials/model/materialDocument";
import {
  decodeGameRealtimeFrame,
  encodeGameRealtimeMessage,
} from "./gameRealtimeProtocol";

describe("game realtime browser protocol", () => {
  it("round-trips an ordered action without changing its payload", () => {
    const message = {
      action: {
        actorId: "teacher",
        actorSequence: 1,
        at: 10,
        authorityRevision: 1,
        blockId: "game-a",
        eventId: "event-a",
        gameId: "counter",
        id: "event-a",
        logicalTime: 1,
        payload: { amount: 2 },
        runId: "run-a",
        stateVersion: "1",
        type: "increment",
      },
      kind: "ordered-action",
    } satisfies MaterialHtmlGameRealtimeMessage;

    const encoded = encodeGameRealtimeMessage(message);
    const decoded = decodeGameRealtimeFrame(
      encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    );

    expect(decoded).toEqual({ kind: "message", message });
  });

  it("rejects an envelope whose type disagrees with its JSON kind", () => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 3);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint8Array(
      encoder,
      new TextEncoder().encode(JSON.stringify({ kind: "effect" })),
    );
    const encoded = encoding.toUint8Array(encoder);

    expect(() => decodeGameRealtimeFrame(
      encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    )).toThrow(/Invalid game realtime message/);
  });
});

const baseline = JSON.parse(readFileSync(new URL("../../../../../../contracts/classroom-game-v1.frames.json", import.meta.url), "utf8")) as {
  frames: Array<{ name: string; hex: string; decoded: ReturnType<typeof decodeGameRealtimeFrame> }>;
};

describe("published v1 frames", () => {
  it.each(baseline.frames)("exchanges $name with a baseline peer", ({ hex, decoded }) => {
    const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
    expect(decodeGameRealtimeFrame(bytes.buffer)).toEqual(decoded);
    if (decoded.kind === "message") {
      expect(Buffer.from(encodeGameRealtimeMessage(decoded.message)).toString("hex")).toBe(hex);
    }
    expect(() => decodeGameRealtimeFrame(bytes.slice(0, -1).buffer)).toThrow();
    expect(() => decodeGameRealtimeFrame(Uint8Array.from([...bytes, 0]).buffer)).toThrow();
  });
});

it("checks the published byte limit and message header on receive", () => {
  const empty = JSON.stringify({ kind: "effect", padding: "" });
  const encode = (length: number, header = [3, 1, 3]) => {
    const payload = new TextEncoder().encode(empty.replace('""', JSON.stringify("x".repeat(length - empty.length))));
    const encoder = encoding.createEncoder();
    for (const field of header) encoding.writeVarUint(encoder, field);
    encoding.writeVarUint8Array(encoder, payload);
    return Uint8Array.from(encoding.toUint8Array(encoder)).buffer;
  };
  expect(decodeGameRealtimeFrame(encode(24576)).kind).toBe("message");
  expect(() => decodeGameRealtimeFrame(encode(24577))).toThrow();
  for (const header of [[4, 1, 3], [3, 2, 3], [3, 1, 7]]) {
    expect(() => decodeGameRealtimeFrame(encode(empty.length, header))).toThrow();
  }
});
