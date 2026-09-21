import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  applyMaterialViewportCommand,
  assertSyncMessageDoesNotModifyMaterialViewport,
} from "./materialViewportAuthorization.js";

describe("material viewport authorization", () => {
  it("rejects a learner Yjs update that directly changes the viewport map", () => {
    const serverDoc = new Y.Doc();
    const learnerDoc = new Y.Doc();
    Y.applyUpdate(learnerDoc, Y.encodeStateAsUpdate(serverDoc));
    learnerDoc.getMap("materialViewport").set("state", { materialId: "material-1", pageId: "page-2" });
    const message = syncUpdateMessage(Y.encodeStateAsUpdate(learnerDoc, Y.encodeStateVector(serverDoc)));

    expect(() => assertSyncMessageDoesNotModifyMaterialViewport(serverDoc, message)).toThrow(
      /requires an authorized command/,
    );
  });

  it("accepts a learner Yjs update to another shared type", () => {
    const serverDoc = new Y.Doc();
    const learnerDoc = new Y.Doc();
    Y.applyUpdate(learnerDoc, Y.encodeStateAsUpdate(serverDoc));
    learnerDoc.getText("workspace").insert(0, "answer");
    const message = syncUpdateMessage(Y.encodeStateAsUpdate(learnerDoc, Y.encodeStateVector(serverDoc)));

    expect(() => assertSyncMessageDoesNotModifyMaterialViewport(serverDoc, message)).not.toThrow();
  });

  it("writes a canonical viewport revision for an authorized controlled client", () => {
    const doc = new Y.Doc();
    const command = new TextEncoder().encode(JSON.stringify({
      presentationChanged: true,
      viewport: {
        materialId: "material-1",
        pageId: "page-2",
        presentationMode: "document-focus",
        scrollContainer: "document",
        sourceClientId: 42,
        x: 100,
        y: 200,
      },
    }));

    const canonical = applyMaterialViewportCommand(doc, command, "material-1", new Set([42]), 1_000);

    expect(canonical).toMatchObject({ presentationRevision: 1_000, revision: 1_000, sourceClientId: 42 });
    expect(doc.getMap("materialViewport").get("state")).toEqual(canonical);
  });

  it("rejects commands for another material or uncontrolled client id", () => {
    const command = new TextEncoder().encode(JSON.stringify({
      viewport: {
        materialId: "material-2",
        pageId: "page-1",
        presentationMode: "default",
        scrollContainer: "document",
        sourceClientId: 99,
        x: 0,
        y: 0,
      },
    }));

    expect(() => applyMaterialViewportCommand(new Y.Doc(), command, "material-1", new Set([42]))).toThrow();
  });
});

function syncUpdateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}
