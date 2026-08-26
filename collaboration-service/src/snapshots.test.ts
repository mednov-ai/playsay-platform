import * as Y from "yjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollaborationClaims } from "./rooms.js";
import { SnapshotQueue } from "./snapshots.js";

describe("SnapshotQueue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("restores a persisted room snapshot with the service token", async () => {
    const persisted = { encoding: "yjs-update-v1", schemaVersion: 1, yjsUpdateBase64: "AQ==" };
    const fetchMock = vi.fn(async () => Response.json({ snapshot: persisted }));
    vi.stubGlobal("fetch", fetchMock);
    const queue = new SnapshotQueue({
      playsayApiBaseUrl: "https://api.example.test",
      collaborationServiceToken: "service-token-01234567890123456789",
      snapshotIntervalMs: 10_000,
    });

    await expect(queue.load(claims)).resolves.toEqual(persisted);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "/schedule/lessons/22222222-2222-4222-8222-222222222222/collaboration-documents/11111111-1111-4111-8111-111111111111/snapshot",
        "https://api.example.test",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-playsay-collaboration-service-token": "service-token-01234567890123456789",
        }),
      }),
    );
  });

  it("does not crash when a deleted collaboration document returns 404", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    const queue = new SnapshotQueue({
      playsayApiBaseUrl: "https://api.example.test",
      collaborationServiceToken: "service-token-01234567890123456789",
      snapshotIntervalMs: 10_000,
    });

    queue.markDirty(claims, new Y.Doc());
    await expect(queue.flushAll()).resolves.toBeUndefined();
    await queue.flushAll();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining("HTTP 404"));
  });

  it("retries transient snapshot persistence failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    const queue = new SnapshotQueue({
      playsayApiBaseUrl: "https://api.example.test",
      collaborationServiceToken: "service-token-01234567890123456789",
      snapshotIntervalMs: 10_000,
    });

    queue.markDirty(claims, new Y.Doc());
    await queue.flushAll();
    await queue.flushAll();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serializes overlapping flush requests and keeps changes made during a flush dirty", async () => {
    let releaseFirstRequest: (() => void) | undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstRequest;
        return new Response(null, { status: 200 });
      })
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const queue = new SnapshotQueue({
      playsayApiBaseUrl: "https://api.example.test",
      collaborationServiceToken: "service-token-01234567890123456789",
      snapshotIntervalMs: 10_000,
    });
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "first");
    queue.markDirty(claims, doc);

    const firstFlush = queue.flushAll();
    const overlappingFlush = queue.flushAll();
    doc.getText("body").insert(doc.getText("body").length, " second");
    queue.markDirty(claims, doc);
    releaseFirstRequest?.();
    await Promise.all([firstFlush, overlappingFlush]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await queue.flushAll();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Buffer.from(secondBody.snapshot.yjsUpdateBase64, "base64"));
    expect(restored.getText("body").toString()).toBe("first second");
  });
});

const claims: CollaborationClaims = {
  subject: "student-1",
  documentId: "11111111-1111-4111-8111-111111111111",
  lessonId: "22222222-2222-4222-8222-222222222222",
  materialId: "33333333-3333-4333-8333-333333333333",
  documentKind: "MATERIAL_WORK",
  scope: "GROUP",
  yjsDocumentId: "lesson:22222222-2222-4222-8222-222222222222:material:33333333-3333-4333-8333-333333333333:group:kind:MATERIAL_WORK",
};
