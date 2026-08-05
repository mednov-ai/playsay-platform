import type {
  GameActionRequest,
  GameCheckpoint,
  GameEffect,
  GameSyncInboundMessage,
  GameSyncOutboundMessage,
  GameSyncTransport,
} from "./types";

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createMessagePortTransport(port: MessagePort): GameSyncTransport {
  const listeners = new Set<(message: GameSyncInboundMessage) => void>();
  const handleMessage = (event: MessageEvent<GameSyncInboundMessage>) => {
    for (const listener of listeners) {
      listener(event.data);
    }
  };
  port.addEventListener("message", handleMessage);
  port.start();
  return {
    close() {
      listeners.clear();
      port.removeEventListener("message", handleMessage);
      port.close();
    },
    send(message) {
      port.postMessage(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createStandaloneTransport(options: {
  actorId?: string;
  isAuthority?: boolean;
  runId?: string;
  seed?: number;
} = {}): GameSyncTransport {
  const actorId = options.actorId ?? `local-${randomId()}`;
  const isAuthority = options.isAuthority ?? true;
  const runId = options.runId ?? `run-${randomId()}`;
  const seed = options.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const listeners = new Set<(message: GameSyncInboundMessage) => void>();
  let revision = 0;
  let logicalTime = 0;

  const emit = (message: GameSyncInboundMessage) => {
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener(message);
      }
    });
  };

  return {
    send(message: GameSyncOutboundMessage) {
      if (message.kind === "hello") {
        emit({ actorId, isAuthority, kind: "context", runId, seed });
      } else if (message.kind === "action-request") {
        const action: GameActionRequest = message.action;
        revision += 1;
        logicalTime += 1;
        emit({
          action: { ...action, authorityRevision: revision, logicalTime },
          kind: "ordered-action",
        });
      } else if (message.kind === "effect") {
        emit({ effect: message.effect as GameEffect, kind: "effect" });
      } else if (message.kind === "checkpoint") {
        emit({ checkpoint: message.checkpoint as GameCheckpoint, kind: "checkpoint" });
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function resolveDefaultTransport(): GameSyncTransport {
  return typeof window !== "undefined" && window.__PLAY_SAY_GAME_SYNC_TRANSPORT__
    ? window.__PLAY_SAY_GAME_SYNC_TRANSPORT__
    : createStandaloneTransport();
}
