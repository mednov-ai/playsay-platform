import { readFileSync } from "node:fs";
import http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { SignJWT } from "jose";
import { WebSocket } from "ws";
import * as decoding from "lib0/decoding";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeRecovery } from "./recoveryProtocol.js";

const secret = "synthetic-collaboration-test-key-0123456789";
const room = "lesson:lesson-fixture:material:material-fixture:group:kind:MATERIAL_WORK";
let api: http.Server;
let child: ChildProcess | undefined;
let port: number;
let documents: Set<string>;
let policyAllowed: boolean;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  documents = new Set(["document-fixture"]);
  policyAllowed = true;
  api = http.createServer((req, res) => {
    if (req.url?.startsWith("/internal/collaboration-documents/")) {
      res.writeHead(policyAllowed ? 204 : 403); res.end(); return;
    }
    const id = req.url?.split("/")[5] ?? "";
    res.writeHead(documents.has(id) ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify({ snapshot: null }));
  });
  api.listen(0, "127.0.0.1"); await once(api, "listening");
  child = undefined;
});

async function startServer(mode: "off" | "shadow" | "primary" = "primary") {
  const apiPort = (api.address() as { port: number }).port;
  const reservation = http.createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(), stdio: "ignore",
    env: { ...process.env, PORT: String(port), PLAYSAY_API_BASE_URL: `http://127.0.0.1:${apiPort}`, COLLABORATION_SERVICE_TOKEN: secret, COLLABORATION_TOKEN_SECRET: secret, COLLABORATION_RECOVERY_PROBES_ENABLED: "true", GAME_REALTIME_MODE: mode, SNAPSHOT_INTERVAL_MS: "50" },
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`http://127.0.0.1:${port}/healthz`).then(r => r.ok).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("fixture server startup failed");
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  child?.kill("SIGKILL");
  await new Promise<void>(resolve => api.close(() => resolve()));
});

async function connect(documentId = "document-fixture", protocol?: string) {
  if (!child) await startServer();
  const token = await new SignJWT({ documentId, lessonId: "lesson-fixture", materialId: "material-fixture", documentKind: "MATERIAL_WORK", scope: "GROUP", yjsDocumentId: room })
    .setProtectedHeader({ alg: "HS256" }).setIssuer("playsay-api-gateway").setSubject("fixture-user").setExpirationTime("1m").sign(new TextEncoder().encode(secret));
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?room=${encodeURIComponent(room)}&token=${token}`, protocol);
  sockets.push(socket);
  return socket;
}

function waitControl(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", onMessage); reject(new Error("control timeout")); }, 2_000);
    function onMessage(raw: Buffer) {
      const bytes = new Uint8Array(raw);
      if (bytes[0] !== 4) return;
      const decoder = decoding.createDecoder(bytes); decoding.readVarUint(decoder);
      const control = JSON.parse(decoding.readVarString(decoder));
      if (control.type !== type) return;
      clearTimeout(timer); socket.off("message", onMessage); resolve(control);
    }
    socket.on("message", onMessage);
  });
}

describe("real collaboration admission and recovery protocol", () => {
  it("rejects a missing document without admitting an empty room", async () => {
    const socket = await connect("absent");
    const [code] = await once(socket, "close");
    expect(code).toBe(4404);
    const metrics = await fetch(`http://127.0.0.1:${port}/metrics`).then(r => r.text());
    expect(metrics).toMatch(/playsay_collaboration_active_rooms 0/);
  });
  it("disconnects a revoked material participant and rejects reuse of the existing token", async () => {
    const socket = await connect(); await waitControl(socket, "hello");
    const closed = once(socket, "close");
    policyAllowed = false;
    expect((await closed)[0]).toBe(1008);
    const denied = await connect();
    const response = await new Promise<number>((resolve, reject) => {
      denied.once("unexpected-response", (_request, result) => { resolve(result.statusCode ?? 0); result.resume(); });
      denied.once("error", reject);
    });
    expect(response).toBe(403);
  }, 10_000);
  it("acknowledges negotiated probes and rejects a burst", async () => {
    const socket = await connect(); await waitControl(socket, "hello");
    const ack = waitControl(socket, "ack");
    socket.send(encodeRecovery({ type: "probe", version: 1, nonce: "0123456789abcdef" }));
    expect((await ack).nonce).toBe("0123456789abcdef");
    const closed = once(socket, "close");
    socket.send(encodeRecovery({ type: "probe", version: 1, nonce: "0123456789abcdef" }));
    expect((await closed)[0]).toBe(1003);
  });
  it("replaces a cached room only when its old document is absent", async () => {
    const old = await connect(); await waitControl(old, "hello");
    documents.delete("document-fixture"); documents.add("new-document");
    const oldClosed = once(old, "close");
    const fresh = await connect("new-document");
    expect((await waitControl(fresh, "hello")).liveness).toBe(true);
    expect((await oldClosed)[0]).toBe(4404);
  });
});

it.each(["primary", "shadow"] as const)("negotiates %s with a v1 browser and relays its action bytes", async (mode) => {
  await startServer(mode);
  const contract = JSON.parse(readFileSync(new URL("../../contracts/classroom-game-v1.frames.json", import.meta.url), "utf8")) as {
    subprotocol: string; frames: Array<{ name: string; hex: string }>;
  };
  const welcome = contract.frames.find(item => item.name === `welcome-${mode}`)!;
  const action = contract.frames.find(item => item.name === "action-request")!;
  async function baselineTab() {
    const socket = await connect("document-fixture", contract.subprotocol);
    const [frame] = await once(socket, "message");
    expect(socket.protocol).toBe(contract.subprotocol);
    expect(Buffer.from(frame).toString("hex")).toBe(welcome.hex);
    return socket;
  }
  const sender = await baselineTab();
  const recipient = await baselineTab();
  const relay = once(recipient, "message");
  sender.send(Buffer.from(action.hex, "hex"));
  const [received] = await relay;
  expect(Buffer.from(received).toString("hex")).toBe(action.hex);
});

it("refuses game negotiation while off", async () => {
  await startServer("off");
  const sender = await connect("document-fixture", "playsay-game-v1");
  const [error] = await once(sender, "error");
  expect(error.message).toMatch(/503/);
});
