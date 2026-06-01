import * as Y from "yjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollaborationClaims } from "./rooms.js";
import { SnapshotQueue } from "./snapshots.js";

describe("SnapshotQueue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists room snapshots with the collaboration service token header", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "hello");
    const queue = new SnapshotQueue({
      playsayApiBaseUrl: "https://api.example.test",
      collaborationServiceToken: "service-token-01234567890123456789",
      snapshotIntervalMs: 10_000,
    });

    queue.markDirty(claims, doc);
    await queue.flushAll();

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "/schedule/lessons/22222222-2222-4222-8222-222222222222/collaboration-documents/11111111-1111-4111-8111-111111111111/snapshot",
        "https://api.example.test",
      ),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "x-playsay-collaboration-service-token": "service-token-01234567890123456789",
          "content-type": "application/json",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.snapshot.encoding).toBe("yjs-update-v1");
    expect(body.snapshot.yjsUpdateBase64).toEqual(expect.any(String));
  });
});

const claims: CollaborationClaims = {
  documentId: "11111111-1111-4111-8111-111111111111",
  lessonId: "22222222-2222-4222-8222-222222222222",
  materialId: "33333333-3333-4333-8333-333333333333",
  documentKind: "MATERIAL_WORK",
  scope: "GROUP",
  yjsDocumentId: "lesson:22222222-2222-4222-8222-222222222222:material:33333333-3333-4333-8333-333333333333:group:kind:MATERIAL_WORK",
};
