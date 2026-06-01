import http from "node:http";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { tokenFromRequestUrl, verifyCollaborationToken } from "./auth.js";
import { loadConfig } from "./config.js";
import { SnapshotQueue } from "./snapshots.js";
import type { CollaborationClaims } from "./rooms.js";
import { assertRoomMatchesClaims } from "./rooms.js";

const messageSync = 0;
const messageAwareness = 1;

interface CollaborationRoom {
  claims: CollaborationClaims;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Map<WebSocket, Set<number>>;
}

const rooms = new Map<string, CollaborationRoom>();

async function main(): Promise<void> {
  const config = loadConfig();
  const snapshots = new SnapshotQueue(config);
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  });
  const wss = new WebSocketServer({ noServer: true });

  snapshots.start();

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const roomName = requestUrl.searchParams.get("room")?.trim();
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

  wss.on("connection", (ws: WebSocket, _request: http.IncomingMessage, claims: CollaborationClaims) => {
    const room = getRoom(claims);
    bindWebSocket(room, ws, snapshots);
  });

  process.on("SIGTERM", () => {
    shutdown(server, wss, snapshots);
  });
  process.on("SIGINT", () => {
    shutdown(server, wss, snapshots);
  });

  server.listen(config.port, () => {
    console.log(`collaboration-service listening on :${config.port}`);
  });
}

function getRoom(claims: CollaborationClaims): CollaborationRoom {
  const existing = rooms.get(claims.yjsDocumentId);
  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const room: CollaborationRoom = {
    claims,
    doc,
    awareness: new awarenessProtocol.Awareness(doc),
    connections: new Map(),
  };
  rooms.set(claims.yjsDocumentId, room);
  return room;
}

function bindWebSocket(room: CollaborationRoom, ws: WebSocket, snapshots: SnapshotQueue): void {
  room.connections.set(ws, new Set());

  const updateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin !== ws) {
      sendSyncUpdate(ws, update);
    }
    snapshots.markDirty(room.claims, room.doc);
  };
  const awarenessHandler = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const changedClients = [...changes.added, ...changes.updated, ...changes.removed];
    if (origin === ws) {
      room.connections.set(ws, new Set(changedClients));
    }
    broadcastAwareness(room, changedClients, ws);
  };

  room.doc.on("update", updateHandler);
  room.awareness.on("update", awarenessHandler);

  ws.on("message", (message) => {
    handleMessage(room, ws, message);
  });

  ws.on("close", () => {
    const controlledIds = room.connections.get(ws);
    room.connections.delete(ws);
    if (controlledIds && controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...controlledIds], ws);
    }
    room.doc.off("update", updateHandler);
    room.awareness.off("update", awarenessHandler);
    if (room.connections.size === 0) {
      snapshots.markDirty(room.claims, room.doc);
    }
  });

  sendSyncStep1(ws, room.doc);
  sendCurrentAwareness(ws, room.awareness);
}

function handleMessage(room: CollaborationRoom, ws: WebSocket, message: RawData): void {
  const bytes = rawDataToUint8Array(message);
  const decoder = decoding.createDecoder(bytes);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === messageSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
    if (encoding.length(encoder) > 1) {
      ws.send(encoding.toUint8Array(encoder));
    }
    return;
  }

  if (messageType === messageAwareness) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
  }
}

function sendSyncStep1(ws: WebSocket, doc: Y.Doc): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));
}

function sendSyncUpdate(ws: WebSocket, update: Uint8Array): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  ws.send(encoding.toUint8Array(encoder));
}

function sendCurrentAwareness(ws: WebSocket, awareness: awarenessProtocol.Awareness): void {
  const states = [...awareness.getStates().keys()];
  if (states.length === 0) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, states));
  ws.send(encoding.toUint8Array(encoder));
}

function broadcastAwareness(room: CollaborationRoom, changedClients: number[], origin: WebSocket): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients),
  );
  const payload = encoding.toUint8Array(encoder);
  room.connections.forEach((_controlledIds, connection) => {
    if (connection !== origin && connection.readyState === connection.OPEN) {
      connection.send(payload);
    }
  });
}

function rawDataToUint8Array(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  return new Uint8Array(data);
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
): void {
  snapshots.stop();
  void snapshots.flushAll().finally(() => {
    wss.close();
    server.close(() => {
      process.exit(0);
    });
  });
}

void main();
