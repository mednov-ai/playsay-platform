import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  assertAwarenessClientOwnership,
  authorizeAwarenessUpdate,
  awarenessClientIds,
} from "./awarenessAuthorization.js";

describe("awareness authorization", () => {
  it("preserves participant state but strips a learner material viewport", () => {
    const { clientId, update } = awarenessUpdate({
      user: { name: "Learner" },
      cursor: { x: 10, y: 20 },
      materialViewport: { page: 4, zoom: 1.5 },
    });

    const authorized = authorizeAwarenessUpdate(update, false);
    const state = appliedState(authorized, clientId);

    expect(state).toEqual({ user: { name: "Learner" }, cursor: { x: 10, y: 20 } });
  });

  it("preserves an authorized teacher material viewport", () => {
    const { clientId, update } = awarenessUpdate({
      user: { name: "Teacher" },
      materialViewport: { page: 2, zoom: 1.25 },
    });

    expect(appliedState(authorizeAwarenessUpdate(update, true), clientId)).toEqual({
      user: { name: "Teacher" },
      materialViewport: { page: 2, zoom: 1.25 },
    });
  });

  it("rejects an awareness client id controlled by another socket", () => {
    const firstSocket = { id: "first" };
    const secondSocket = { id: "second" };
    const { clientId, update } = awarenessUpdate({ user: { name: "Teacher" } });
    const controlledIds = new Map([[firstSocket, new Set([clientId])], [secondSocket, new Set<number>()]]);

    expect(awarenessClientIds(update)).toEqual([clientId]);
    expect(() => assertAwarenessClientOwnership(secondSocket, [clientId], controlledIds)).toThrow(
      /controlled by another connection/,
    );
    expect(() => assertAwarenessClientOwnership(firstSocket, [clientId], controlledIds)).not.toThrow();
  });
});

function awarenessUpdate(state: Record<string, unknown>): { clientId: number; update: Uint8Array } {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(state);
  return {
    clientId: doc.clientID,
    update: awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]),
  };
}

function appliedState(update: Uint8Array, clientId: number): unknown {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awarenessProtocol.applyAwarenessUpdate(awareness, update, "test");
  return awareness.getStates().get(clientId);
}
