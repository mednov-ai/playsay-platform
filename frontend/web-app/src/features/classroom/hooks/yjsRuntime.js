/* global Blob, WebSocket, window */

import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as Y from "yjs";

const messageSync = 0;
const messageAwareness = 1;

export function createYjsWorkspaceRuntime({
  color,
  onParticipantsChange,
  onTextChange,
  participantName,
  snapshot,
}) {
  const ydoc = new Y.Doc();
  applyPersistedSnapshot(ydoc, snapshot);
  const ytext = ydoc.getText("workspace");
  const awareness = new awarenessProtocol.Awareness(ydoc);
  let socket = null;
  let disposed = false;

  const updateLocalText = () => {
    if (!disposed) {
      onTextChange(ytext.toString());
    }
  };
  const syncUpdateHandler = (update, origin) => {
    if (origin !== socket) {
      sendSyncUpdate(socket, update);
    }
  };
  const awarenessUpdateHandler = (changes, origin) => {
    updateParticipants(awareness, onParticipantsChange);
    if (origin !== socket) {
      sendAwarenessUpdate(socket, awareness, [
        ...changes.added,
        ...changes.updated,
        ...changes.removed,
      ]);
    }
  };

  ytext.observe(updateLocalText);
  ydoc.on("update", syncUpdateHandler);
  awareness.on("update", awarenessUpdateHandler);
  awareness.setLocalState({
    cursor: null,
    user: { color, name: participantName },
  });
  updateLocalText();

  return {
    destroy() {
      disposed = true;
      socket = null;
      awareness.destroy();
      ytext.unobserve(updateLocalText);
      ydoc.off("update", syncUpdateHandler);
      ydoc.destroy();
      onParticipantsChange([]);
    },
    getText() {
      return ytext.toString();
    },
    handleSocketMessage(data) {
      handleMessage(ydoc, awareness, socket, data);
    },
    setSocket(nextSocket) {
      socket = nextSocket;
    },
    snapshot() {
      return {
        schemaVersion: 1,
        encoding: "yjs-update-v1",
        yjsUpdateBase64: uint8ArrayToBase64(Y.encodeStateAsUpdate(ydoc)),
        savedAt: new Date().toISOString(),
      };
    },
    startSocketSync(nextSocket) {
      socket = nextSocket;
      sendSyncStep1(nextSocket, ydoc);
      sendAwarenessUpdate(nextSocket, awareness, [ydoc.clientID]);
    },
    updateCursor(cursor) {
      awareness.setLocalStateField("cursor", cursor);
    },
    updateText(nextText) {
      if (ytext.toString() === nextText) {
        return;
      }
      ytext.doc?.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, nextText);
      });
      onTextChange(nextText);
    },
  };
}

function handleMessage(ydoc, awareness, socket, data) {
  const decoder = decoding.createDecoder(rawMessageToUint8Array(data));
  const messageType = decoding.readVarUint(decoder);
  if (messageType === messageSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.readSyncMessage(decoder, encoder, ydoc, socket);
    if (encoding.length(encoder) > 1) {
      socket?.send(encoding.toUint8Array(encoder));
    }
    return;
  }

  if (messageType === messageAwareness) {
    awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), socket);
  }
}

function sendSyncStep1(socket, ydoc) {
  if (!isSocketOpen(socket)) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, ydoc);
  socket.send(encoding.toUint8Array(encoder));
}

function sendSyncUpdate(socket, update) {
  if (!isSocketOpen(socket)) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  socket.send(encoding.toUint8Array(encoder));
}

function sendAwarenessUpdate(socket, awareness, changedClients) {
  if (!isSocketOpen(socket) || changedClients.length === 0) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
  socket.send(encoding.toUint8Array(encoder));
}

function updateParticipants(awareness, onParticipantsChange) {
  const nextParticipants = [...awareness.getStates()]
    .filter(([clientId]) => clientId !== awareness.clientID)
    .map(([clientId, state]) => {
      const root = asObject(state);
      const user = asObject(root?.user);
      const cursor = asObject(root?.cursor);
      return {
        clientId,
        color: asString(user?.color) || "#2574ff",
        cursor: cursor ? { x: clamp01(asNumber(cursor.x)), y: clamp01(asNumber(cursor.y)) } : null,
        name: asString(user?.name) || "Play&Say",
      };
    });
  onParticipantsChange(nextParticipants);
}

function applyPersistedSnapshot(ydoc, snapshot) {
  if (!snapshot || snapshot.encoding !== "yjs-update-v1" || typeof snapshot.yjsUpdateBase64 !== "string") {
    return;
  }
  try {
    Y.applyUpdate(ydoc, base64ToUint8Array(snapshot.yjsUpdateBase64));
  } catch {
    // Ignore malformed snapshots and let the live room become the source of truth.
  }
}

function rawMessageToUint8Array(data) {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Blob) {
    throw new Error("Blob websocket messages are not supported");
  }
  return new Uint8Array(data);
}

function isSocketOpen(socket) {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

function uint8ArrayToBase64(value) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function base64ToUint8Array(value) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
