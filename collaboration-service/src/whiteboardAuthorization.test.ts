import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import { assertWhiteboardSync, applyWhiteboardCamera, loadWhiteboardPolicy } from "./whiteboardAuthorization.js";
import { collaborationRoomName, type CollaborationClaims } from "./rooms.js";
import { SnapshotQueue } from "./snapshots.js";
const claims: CollaborationClaims = { subject: "learner", documentId: "11111111-1111-4111-8111-111111111111", lessonId: "22222222-2222-4222-8222-222222222222", materialId: null, whiteboardId: "33333333-3333-4333-8333-333333333333", contentEpoch: 0, documentKind: "LESSON_WHITEBOARD", scope: "GROUP", yjsDocumentId: "room", canPublishMaterialViewport: false };
const policy = { canManage: false, canDraw: true, contentEpoch: 0, controlRevision: 1 };
const config = { playsayApiBaseUrl: "http://api.example.test", collaborationServiceToken: "synthetic-service-token-with-at-least-32-chars", snapshotIntervalMs: 10000 };
function frame(update: Uint8Array) { const e = encoding.createEncoder(); encoding.writeVarUint(e, 0); encoding.writeVarUint(e, 2); encoding.writeVarUint8Array(e, update); return encoding.toUint8Array(e); }
function candidate(doc: Y.Doc, change: (copy: Y.Doc) => void) { const copy = new Y.Doc(); Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc)); const vector = Y.encodeStateVector(copy); change(copy); const update = Y.encodeStateAsUpdate(copy, vector); copy.destroy(); return frame(update); }
function add(doc: Y.Doc, id: string, owner = "learner") { const e = new Y.Map(); doc.getMap("annotations").set(id, e); Object.entries({ id, ownerSubject: owner, kind: "text", pageId: "whiteboard", fill: "transparent", x: 10, y: 20, width: 200, height: 80, fontSize: 30, color: "#202433", text: "hello", createdAt: 100 }).forEach(([k, v]) => e.set(k, v)); }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("whiteboard authority", () => {
 it("uses board identity and epoch, independent of material", () => {
  expect(collaborationRoomName(claims)).toBe(`lesson:${claims.lessonId}:whiteboard:${claims.whiteboardId}:epoch:0`);
  expect(() => collaborationRoomName({ ...claims, materialId: "forged" })).toThrow();
 });
 it("accepts own drawing and rejects current revoke before mutation", () => {
  const doc = new Y.Doc(); const update = candidate(doc, d => add(d, "mine"));
  expect(() => assertWhiteboardSync(doc, update, claims, policy)).not.toThrow();
  expect(() => assertWhiteboardSync(doc, update, claims, { ...policy, canDraw: false })).toThrow(/disabled/);
  expect(doc.getMap("annotations").size).toBe(0); doc.destroy();
 });
 it.each(["edit", "delete", "owner"])("rejects forged %s of another learner's element", mode => {
  const doc = new Y.Doc(); add(doc, "other", "other-learner");
  const update = candidate(doc, d => { const map = d.getMap<Y.Map<unknown>>("annotations"); if (mode === "delete") map.delete("other"); else map.get("other")!.set(mode === "owner" ? "ownerSubject" : "text", mode === "owner" ? "learner" : "forged"); });
  expect(() => assertWhiteboardSync(doc, update, claims, policy)).toThrow(); expect(doc.getMap<Y.Map<unknown>>("annotations").get("other")!.get("text")).toBe("hello"); doc.destroy();
 });
 it.each(["whiteboardCamera", "permissions", "materialViewport"])("rejects raw reserved root %s", root => {
  const doc = new Y.Doc(); const update = candidate(doc, d => d.getMap(root).set("state", { x: 1 }));
  expect(() => assertWhiteboardSync(doc, update, claims, { ...policy, canManage: true })).toThrow(); doc.destroy();
 });
 it("rejects nonfinite/out-of-world coordinates and oversized text", () => {
  const doc = new Y.Doc();
  for (const [key, value] of [["x", Infinity], ["y", 300000], ["text", "x".repeat(20001)]] as const) {
   expect(() => assertWhiteboardSync(doc, candidate(doc, d => { add(d, "bad"); d.getMap<Y.Map<unknown>>("annotations").get("bad")!.set(key, value); }), claims, policy)).toThrow();
  } doc.destroy();
 });
 it("rejects deferred Yjs structs rather than parking an unchecked mutation", () => {
  const doc = new Y.Doc(), evil = new Y.Doc(); add(evil, "mine"); const vector = Y.encodeStateVector(evil); evil.getMap<Y.Map<unknown>>("annotations").get("mine")!.set("text", "hidden");
  expect(() => assertWhiteboardSync(doc, frame(Y.encodeStateAsUpdate(evil, vector)), claims, policy)).toThrow(/deferred/); doc.destroy(); evil.destroy();
 });
 it("requires teacher and connection-owned client ID for canonical camera", () => {
  const doc = new Y.Doc(); const command = { type: "camera", version: 1, sourceClientId: 7, region: { x: 10, y: 20, width: 900, height: 500 } };
  expect(() => applyWhiteboardCamera(doc, command, false, new Set([7]))).toThrow();
  expect(() => applyWhiteboardCamera(doc, command, true, new Set([8]))).toThrow();
  applyWhiteboardCamera(doc, command, true, new Set([7])); const first = doc.getMap("whiteboardCamera").get("state") as {revision:number};
  applyWhiteboardCamera(doc, command, true, new Set([7])); expect((doc.getMap("whiteboardCamera").get("state") as {revision:number}).revision).toBeGreaterThan(first.revision); doc.destroy();
 });
 it("fails closed for stale epochs and unavailable authoritative access", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...policy, contentEpoch: 1 }), { status: 200 })));
  await expect(loadWhiteboardPolicy(config, claims)).rejects.toThrow();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {status:403})));
  await expect(loadWhiteboardPolicy(config, claims)).rejects.toThrow();
 });
 it("acknowledges exactly the durable vector and restores it after restart", async () => {
  let saved: Record<string, unknown> = {}; const outcome = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => { if (options?.method === "PUT") saved = JSON.parse(options.body as string).snapshot; return new Response(JSON.stringify({snapshot:saved}), {status:200}); }));
  const doc = new Y.Doc(); add(doc, "mine"); const queue = new SnapshotQueue(config); queue.onOutcome = outcome; queue.markDirty(claims, doc); await queue.flushAll();
  expect(outcome).toHaveBeenCalledWith(claims, "saved", expect.objectContaining({contentEpoch:0, stateVectorBase64:Buffer.from(Y.encodeStateVector(doc)).toString("base64")}));
  const restored = new Y.Doc(); Y.applyUpdate(restored, Buffer.from(saved.yjsUpdateBase64 as string,"base64")); expect(restored.getMap("annotations").toJSON()).toEqual(doc.getMap("annotations").toJSON()); doc.destroy(); restored.destroy();
 });
});
