import * as encoding from "lib0/encoding";
import { describe, expect, it } from "vitest";
import type { MaterialHtmlGameRealtimeMessage } from "../../materials/model/materialDocument";
import {
  decodeGameRealtimeFrame,
  encodeExternalActivityRealtimeMessage,
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

  it("round-trips external pointer input through the shared fast-lane envelope", () => {
    const message = {
      blockId: "external-a",
      eventId: "event-a",
      input: { action: "move", type: "pointer", x: 120, y: 80 },
      kind: "external-input",
      sessionId: "session-a",
    } as const;
    const encoded = encodeExternalActivityRealtimeMessage(message);

    expect(decodeGameRealtimeFrame(
      encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    )).toEqual({ kind: "message", message });
  });
});
