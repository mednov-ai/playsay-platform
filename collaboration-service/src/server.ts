import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { tokenFromRequestUrl, verifyCollaborationToken } from "./auth.js";
import {
  sendWithBackpressure,
  type CollaborationBackpressurePolicy,
} from "./backpressure.js";
import { loadConfig } from "./config.js";
import {
  encodeGameWelcome,
  gameRealtimeSubprotocol,
  validateGameFrame,
  type GameRealtimeMode,
} from "./gameProtocol.js";
import { CollaborationMetrics } from "./metrics.js";
import { CollaborationHeartbeat } from "./heartbeat.js";
import { SnapshotQueue } from "./snapshots.js";
import type { CollaborationClaims } from "./rooms.js";
import { assertRoomMatchesClaims } from "./rooms.js";
import { disconnectLessonSubject } from "./disconnect.js";

const messageSync = 0;
const messageAwareness = 1;
const messageEphemeral = 2;
const maxEphemeralPayloadBytes = 64 * 1024;

interface CollaborationRoom {
  claims: CollaborationClaims;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Map<WebSocket, Set<number>>;
  destroy: () => void;
  idleTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Promise<CollaborationRoom>>();
const connectionClaims = new Map<WebSocket, CollaborationClaims>();

async function main(): Promise<void> {
  const config = loadConfig();
  const metrics = new CollaborationMetrics();
  const snapshots = new SnapshotQueue(config, metrics);
  const backpressurePolicy = {
    hardLimitBytes: config.websocketHardLimitBytes,
    softLimitBytes: config.websocketSoftLimitBytes,
  };
  const wss = new WebSocketServer({
    handleProtocols: (protocols) => (
      config.gameRealtimeMode !== "off" && protocols.has(gameRealtimeSubprotocol)
        ? gameRealtimeSubprotocol
        : false
    ),
    maxPayload: config.websocketMaxPayloadBytes,
    noServer: true,
    perMessageDeflate: false,
  });
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/metrics") {
      const bufferedBytes = [...wss.clients].reduce((total, client) => total + client.bufferedAmount, 0);
      void metrics.render({
        activeConnections: wss.clients.size,
        activeGameConnections: [...wss.clients].filter(isGameSocket).length,
        activeRooms: rooms.size,
        bufferedBytes,
        gameBufferedBytes: [...wss.clients]
          .filter(isGameSocket)
          .reduce((total, client) => total + client.bufferedAmount, 0),
      }).then((body) => {
        response.writeHead(200, { "content-type": metrics.contentType });
        response.end(body);
      }).catch(() => {
        response.writeHead(500);
        response.end();
      });
      return;
    }
    if (request.url === "/internal/disconnect" && request.method === "POST") {
      if (!serviceTokenMatches(request.headers["x-playsay-collaboration-token"], config.collaborationServiceToken)) {
        response.writeHead(401);
        response.end();
        return;
      }
      void readJsonBody(request, 4096).then((body) => {
        const lessonId = typeof body.lessonId === "string" ? body.lessonId : "";
        const subject = typeof body.subject === "string" ? body.subject : "";
        if (!lessonId || !subject) {
          response.writeHead(400);
          response.end();
          return;
        }
        const disconnected = disconnectLessonSubject(connectionClaims, lessonId, subject);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ disconnected }));
      }).catch(() => {
        response.writeHead(400);
        response.end();
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const heartbeat = new CollaborationHeartbeat(
    wss,
    config.websocketHeartbeatIntervalMs,
    config.websocketHeartbeatMissedPongs,
    metrics,
  );

  snapshots.start();
  heartbeat.start();

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const roomName = requestUrl.searchParams.get("room")?.trim();
    const requestsGameRealtime = requestedSubprotocols(request)
      .includes(gameRealtimeSubprotocol);
    if (requestsGameRealtime && config.gameRealtimeMode === "off") {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }
    const token = runCatching(() => tokenFromRequestUrl(requestUrl));
    if (!roomName || token.error) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const tokenValue = token.value as string;
    void verifyCollaborationToken(tokenValue, { tokenSecret: config.collaborationTokenSecret })
      .then((claims) => {
        assertRoomMatchesClaims(roomName, claims);
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request, claims);
        });
      })
      .catch(() => {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
      });
  });

  wss.on("connection", (ws: WebSocket, request: http.IncomingMessage, claims: CollaborationClaims) => {
    heartbeat.track(ws, isGameSocket(ws) ? "game" : "yjs");
    connectionClaims.set(ws, claims);
    ws.once("close", () => connectionClaims.delete(ws));
    request.socket.setNoDelay(true);
    request.socket.setKeepAlive(true, 30_000);
    const pendingMessages: RawData[] = [];
    const queuePendingMessage = (message: RawData) => {
      if (pendingMessages.length >= 100) {
        ws.close(1009, "too many messages while restoring room");
        return;
      }
      pendingMessages.push(message);
    };
    ws.on("message", queuePendingMessage);
    void getRoom(claims, snapshots, backpressurePolicy, metrics)
      .then((room) => {
        ws.off("message", queuePendingMessage);
        if (ws.readyState !== ws.OPEN) return;
        bindWebSocket(
          room,
          ws,
          snapshots,
          backpressurePolicy,
          metrics,
          config.gameRealtimeMode,
          pendingMessages,
        );
      })
      .catch(() => ws.close(1011, "room restore failed"));
  });

  process.on("SIGTERM", () => {
    shutdown(server, wss, snapshots, heartbeat);
  });
  process.on("SIGINT", () => {
    shutdown(server, wss, snapshots, heartbeat);
  });

  server.listen(config.port, () => {
    console.log(`collaboration-service listening on :${config.port}`);
  });
}

function serviceTokenMatches(presented: string | string[] | undefined, expected: string): boolean {
  const value = Array.isArray(presented) ? "" : presented ?? "";
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && right.length > 0 && timingSafeEqual(left, right);
}

async function readJsonBody(request: http.IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid request body");
  return parsed as Record<string, unknown>;
}

function getRoom(
  claims: CollaborationClaims,
  snapshots: SnapshotQueue,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): Promise<CollaborationRoom> {
  const existing = rooms.get(claims.yjsDocumentId);
  if (existing) {
    return existing;
  }

  const roomPromise = createRoom(claims, snapshots, backpressurePolicy, metrics);
  rooms.set(claims.yjsDocumentId, roomPromise);
  void roomPromise.catch(() => rooms.delete(claims.yjsDocumentId));
  return roomPromise;
}

async function createRoom(
  claims: CollaborationClaims,
  snapshots: SnapshotQueue,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): Promise<CollaborationRoom> {
  const doc = new Y.Doc();
  const persistedSnapshot = await snapshots.load(claims);
  applyPersistedSnapshot(doc, persistedSnapshot);
  const room = {
    claims,
    doc,
    awareness: new awarenessProtocol.Awareness(doc),
    connections: new Map(),
    destroy: () => undefined,
    idleTimer: null,
  } satisfies CollaborationRoom;
  const updateHandler = (update: Uint8Array, origin: unknown) => {
    const originSocket = room.connections.has(origin as WebSocket) ? origin as WebSocket : null;
    room.connections.forEach((_controlledIds, connection) => {
      if (
        connection !== originSocket
        && !isGameSocket(connection)
        && connection.readyState === connection.OPEN
      ) {
        sendSyncUpdate(connection, update, backpressurePolicy, metrics);
      }
    });
    snapshots.markDirty(room.claims, room.doc);
  };
  const awarenessHandler = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const changedClients = [...changes.added, ...changes.updated, ...changes.removed];
    const originSocket = room.connections.has(origin as WebSocket) ? origin as WebSocket : null;
    if (originSocket) {
      const controlledIds = room.connections.get(originSocket) ?? new Set<number>();
      for (const clientId of [...changes.added, ...changes.updated]) {
        controlledIds.add(clientId);
      }
      for (const clientId of changes.removed) {
        controlledIds.delete(clientId);
      }
      room.connections.set(originSocket, controlledIds);
    }
    broadcastAwareness(room, changedClients, originSocket, backpressurePolicy, metrics);
  };
  doc.on("update", updateHandler);
  room.awareness.on("update", awarenessHandler);
  room.destroy = () => {
    if (room.idleTimer) clearTimeout(room.idleTimer);
    doc.off("update", updateHandler);
    room.awareness.off("update", awarenessHandler);
    room.awareness.destroy();
    doc.destroy();
  };
  return room;
}

function applyPersistedSnapshot(doc: Y.Doc, snapshot: unknown): void {
  if (!snapshot || typeof snapshot !== "object") return;
  const value = snapshot as Record<string, unknown>;
  if (value.encoding !== "yjs-update-v1" || typeof value.yjsUpdateBase64 !== "string") return;
  Y.applyUpdate(doc, Buffer.from(value.yjsUpdateBase64, "base64"));
}

function bindWebSocket(
  room: CollaborationRoom,
  ws: WebSocket,
  snapshots: SnapshotQueue,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
  gameRealtimeMode: GameRealtimeMode,
  pendingMessages: RawData[] = [],
): void {
  if (room.idleTimer) {
    clearTimeout(room.idleTimer);
    room.idleTimer = null;
  }
  room.connections.set(ws, new Set());

  ws.on("message", (message) => {
    processMessage(room, ws, message, backpressurePolicy, metrics);
  });

  ws.on("close", () => {
    const controlledIds = room.connections.get(ws);
    room.connections.delete(ws);
    if (controlledIds && controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...controlledIds], ws);
    }
    if (room.connections.size === 0) {
      snapshots.markDirty(room.claims, room.doc);
      room.idleTimer = setTimeout(() => {
        room.idleTimer = null;
        void snapshots.flushAll().finally(() => {
          if (room.connections.size === 0) {
            rooms.delete(room.claims.yjsDocumentId);
            room.destroy();
          }
        });
      }, 30_000);
    }
  });

  if (isGameSocket(ws)) {
    if (gameRealtimeMode === "off") {
      ws.close(1008, "game realtime is disabled");
      return;
    }
    sendWithBackpressure(
      ws,
      encodeGameWelcome(gameRealtimeMode),
      "game",
      backpressurePolicy,
      metrics,
    );
  } else {
    sendSyncStep1(ws, room.doc, backpressurePolicy, metrics);
    sendCurrentAwareness(ws, room.awareness, backpressurePolicy, metrics);
  }
  pendingMessages.forEach((message) => {
    processMessage(room, ws, message, backpressurePolicy, metrics);
  });
}

function processMessage(
  room: CollaborationRoom,
  ws: WebSocket,
  message: RawData,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): void {
  try {
    if (isGameSocket(ws)) {
      handleGameMessage(room, ws, message, backpressurePolicy, metrics);
    } else {
      handleMessage(room, ws, message, backpressurePolicy, metrics);
    }
  } catch {
    ws.close(1003, "invalid collaboration message");
  }
}

function handleMessage(
  room: CollaborationRoom,
  ws: WebSocket,
  message: RawData,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): void {
  const bytes = rawDataToUint8Array(message);
  const decoder = decoding.createDecoder(bytes);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === messageSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
    if (encoding.length(encoder) > 1) {
      sendWithBackpressure(
        ws,
        encoding.toUint8Array(encoder),
        "sync",
        backpressurePolicy,
        metrics,
      );
    }
    return;
  }

  if (messageType === messageAwareness) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
    return;
  }

  if (messageType === messageEphemeral) {
    const relayStartedAt = performance.now();
    const payload = decoding.readVarUint8Array(decoder);
    if (payload.byteLength > maxEphemeralPayloadBytes) {
      throw new Error("ephemeral payload is too large");
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageEphemeral);
    encoding.writeVarUint8Array(encoder, payload);
    const encoded = encoding.toUint8Array(encoder);
    room.connections.forEach((_controlledIds, connection) => {
      if (
        connection !== ws
        && !isGameSocket(connection)
        && connection.readyState === connection.OPEN
      ) {
        sendWithBackpressure(connection, encoded, "ephemeral", backpressurePolicy, metrics);
      }
    });
    metrics.recordEphemeralRelay(payload.byteLength, (performance.now() - relayStartedAt) / 1000);
    return;
  }

  throw new Error("unsupported collaboration message");
}

function handleGameMessage(
  room: CollaborationRoom,
  ws: WebSocket,
  message: RawData,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): void {
  const relayStartedAt = performance.now();
  const bytes = rawDataToUint8Array(message);
  const validated = validateGameFrame(bytes);
  room.connections.forEach((_controlledIds, connection) => {
    if (
      connection !== ws
      && isGameSocket(connection)
      && connection.readyState === connection.OPEN
    ) {
      sendWithBackpressure(connection, bytes, "game", backpressurePolicy, metrics);
    }
  });
  metrics.recordGameRelay(
    validated.type,
    validated.payloadBytes,
    (performance.now() - relayStartedAt) / 1000,
  );
}

function sendSyncStep1(
  ws: WebSocket,
  doc: Y.Doc,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  sendWithBackpressure(ws, encoding.toUint8Array(encoder), "sync", backpressurePolicy, metrics);
}

function sendSyncUpdate(
  ws: WebSocket,
  update: Uint8Array,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  sendWithBackpressure(ws, encoding.toUint8Array(encoder), "sync", backpressurePolicy, metrics);
}

function sendCurrentAwareness(
  ws: WebSocket,
  awareness: awarenessProtocol.Awareness,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): void {
  const states = [...awareness.getStates().keys()];
  if (states.length === 0) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, states));
  sendWithBackpressure(
    ws,
    encoding.toUint8Array(encoder),
    "awareness",
    backpressurePolicy,
    metrics,
  );
}

function broadcastAwareness(
  room: CollaborationRoom,
  changedClients: number[],
  origin: WebSocket | null,
  backpressurePolicy: CollaborationBackpressurePolicy,
  metrics: CollaborationMetrics,
): void {
  if (changedClients.length === 0) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients),
  );
  const payload = encoding.toUint8Array(encoder);
  room.connections.forEach((_controlledIds, connection) => {
    if (
      connection !== origin
      && !isGameSocket(connection)
      && connection.readyState === connection.OPEN
    ) {
      sendWithBackpressure(connection, payload, "awareness", backpressurePolicy, metrics);
    }
  });
}

function isGameSocket(ws: WebSocket): boolean {
  return ws.protocol === gameRealtimeSubprotocol;
}

function requestedSubprotocols(request: http.IncomingMessage): string[] {
  const header = request.headers["sec-websocket-protocol"];
  return typeof header === "string"
    ? header.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
}

function rawDataToUint8Array(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function runCatching<T>(action: () => T): { value: T; error?: never } | { value?: never; error: unknown } {
  try {
    return { value: action() };
  } catch (error) {
    return { error };
  }
}

function shutdown(
  server: http.Server,
  wss: WebSocketServer,
  snapshots: SnapshotQueue,
  heartbeat: CollaborationHeartbeat,
): void {
  heartbeat.stop();
  snapshots.stop();
  void snapshots.flushAll().finally(() => {
    wss.close();
    server.close(() => {
      process.exit(0);
    });
  });
}

void main();
