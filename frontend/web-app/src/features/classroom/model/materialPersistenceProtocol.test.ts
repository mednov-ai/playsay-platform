import * as encoding from "lib0/encoding";
import { expect, it } from "vitest";
import { decodeMaterialPersistence } from "./materialPersistenceProtocol";

it("accepts only a bounded, versioned material persistence confirmation", () => {
  const frame = (value: unknown) => {
    const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 6); encoding.writeVarString(encoder, JSON.stringify(value));
    return encoding.toUint8Array(encoder);
  };
  expect(decodeMaterialPersistence(frame({ type: "material-persisted", version: 1, documentId: "doc", stateVector: "AA==", deleteSet: "AAA=" })))
    .toEqual({ documentId: "doc", stateVector: "AA==", deleteSet: "AAA=" });
  expect(decodeMaterialPersistence(frame({ type: "persisted", version: 1, documentId: "doc", stateVector: "", deleteSet: "" }))).toBeNull();
  expect(decodeMaterialPersistence(frame({ type: "material-persisted", version: 2, documentId: "doc", stateVector: "", deleteSet: "" }))).toBeNull();
  expect(decodeMaterialPersistence(new Uint8Array(2_000_001).fill(6))).toBeNull();
});
