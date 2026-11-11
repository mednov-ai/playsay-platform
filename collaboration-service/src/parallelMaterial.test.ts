import http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { SignJWT } from "jose";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as sync from "y-protocols/sync";
import * as Y from "yjs";
import { WebSocket } from "ws";
import { afterEach, expect, it, vi } from "vitest";

const secret = "synthetic-collaboration-test-key-0123456789";
const snapshots = new Map<string, unknown>();
const sockets: WebSocket[] = [];
let api: http.Server;
let child: ChildProcess;
let port: number;
let apiPort: number;

async function startService() {
  child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(), stdio: "ignore", env: { ...process.env, PORT: String(port),
      PLAYSAY_API_BASE_URL: `http://127.0.0.1:${apiPort}`, COLLABORATION_SERVICE_TOKEN: secret,
      COLLABORATION_TOKEN_SECRET: secret, SNAPSHOT_INTERVAL_MS: "50" },
  });
  await vi.waitFor(async () => {
    expect(await fetch(`http://127.0.0.1:${port}/healthz`).then((response) => response.ok).catch(() => false)).toBe(true);
  }, { timeout: 5_000, interval: 25 });
}

async function connect(documentId: string, studentId: string, subject: string) {
  const room = `lesson:fixture:material:material:student:${studentId}:kind:MATERIAL_WORK`;
  const token = await new SignJWT({ documentId, lessonId: "fixture", materialId: "material", studentUserId: studentId,
    documentKind: "MATERIAL_WORK", scope: "INDIVIDUAL", yjsDocumentId: room })
    .setProtectedHeader({ alg: "HS256" }).setIssuer("playsay-api-gateway").setSubject(subject).setExpirationTime("1m")
    .sign(new TextEncoder().encode(secret));
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?room=${encodeURIComponent(room)}&token=${token}`);
  sockets.push(socket);
  const doc = new Y.Doc();
  const confirmations: { documentId: string; stateVector: string; deleteSet: string }[] = [];
  socket.on("message", (raw: Buffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(raw));
    const type = decoding.readVarUint(decoder);
    if (type === 6) { confirmations.push(JSON.parse(decoding.readVarString(decoder))); return; }
    if (type !== 0) return;
    const response = encoding.createEncoder();
    encoding.writeVarUint(response, 0);
    sync.readSyncMessage(decoder, response, doc, socket);
    if (encoding.length(response) > 1 && socket.readyState === WebSocket.OPEN) socket.send(encoding.toUint8Array(response));
  });
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === socket || socket.readyState !== WebSocket.OPEN) return;
    const message = encoding.createEncoder();
    encoding.writeVarUint(message, 0);
    sync.writeUpdate(message, update);
    socket.send(encoding.toUint8Array(message));
  });
  await once(socket, "open");
  const hello = encoding.createEncoder();
  encoding.writeVarUint(hello, 0);
  sync.writeSyncStep1(hello, doc);
  socket.send(encoding.toUint8Array(hello));
  return { doc, socket, confirmations };
}

function confirmed(doc: Y.Doc, documentId: string, acknowledgements: { documentId: string; stateVector: string; deleteSet: string }[]): boolean {
  const vector = Y.encodeStateVector(doc);
  const current = Y.decodeStateVector(vector);
  const deletes = Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64");
  return acknowledgements.some((ack) => {
    const saved = Y.decodeStateVector(Buffer.from(ack.stateVector, "base64"));
    return ack.documentId === documentId && [...current].every(([id, clock]) => (saved.get(id) ?? 0) >= clock) && ack.deleteSet === deletes;
  });
}

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.terminate());
  if (child && child.exitCode === null) { const stopped = once(child, "exit"); child.kill("SIGKILL"); await stopped; }
  if (api?.listening) await new Promise<void>((resolve) => api.close(() => resolve()));
  snapshots.clear();
});

it("isolates two students sharing a material and restores the teacher's selected document after reconnect", async () => {
  api = http.createServer((request, response) => {
    if (request.url?.startsWith("/internal/collaboration-documents/")) { response.writeHead(204); response.end(); return; }
    const id = request.url?.split("/")[5] ?? "";
    if (request.method !== "PUT") { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ snapshot: snapshots.get(id) ?? null })); return; }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => { snapshots.set(id, JSON.parse(Buffer.concat(chunks).toString()).snapshot); response.writeHead(200); response.end(); });
  });
  api.listen(0, "127.0.0.1"); await once(api, "listening"); apiPort = (api.address() as { port: number }).port;
  const reservation = http.createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  await startService();
  const teacherA = await connect("doc-a", "student-a", "teacher");
  const studentA = await connect("doc-a", "student-a", "student-a");
  const studentB = await connect("doc-b", "student-b", "student-b");
  studentA.doc.getMap("annotations").set("stroke-a", { pageId: "page-1", revision: "rev-1", text: "A" });
  studentB.doc.getMap("annotations").set("stroke-b", { pageId: "page-2", revision: "rev-1", text: "B" });
  await vi.waitFor(() => {
    expect(teacherA.doc.getMap("annotations").get("stroke-a")).toMatchObject({ text: "A", pageId: "page-1" });
    expect(snapshots.has("doc-a")).toBe(true);
    expect(snapshots.has("doc-b")).toBe(true);
    expect(confirmed(teacherA.doc, "doc-a", teacherA.confirmations)).toBe(true);
  }, { timeout: 4_000, interval: 25 });
  expect(teacherA.doc.getMap("annotations").has("stroke-b")).toBe(false);
  expect(studentB.doc.getMap("annotations").has("stroke-a")).toBe(false);
  sockets.splice(0).forEach((socket) => socket.terminate());
  const stopped = once(child, "exit"); child.kill("SIGKILL"); await stopped;
  await startService();
  const reconnected = await connect("doc-a", "student-a", "teacher");
  await vi.waitFor(() => expect(reconnected.doc.getMap("annotations").get("stroke-a"))
    .toMatchObject({ text: "A", pageId: "page-1", revision: "rev-1" }), { timeout: 4_000, interval: 25 });
  expect(reconnected.doc.getMap("annotations").has("stroke-b")).toBe(false);
  await vi.waitFor(() => expect(confirmed(reconnected.doc, "doc-a", reconnected.confirmations)).toBe(true), { timeout: 4_000, interval: 25 });
}, 15_000);
