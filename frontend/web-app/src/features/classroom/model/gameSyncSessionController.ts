import {
  GAME_SYNC_LIMITS,
  type GameActionRequest,
  type GameSyncInboundMessage,
  type GameSyncOutboundMessage,
} from "@playsay/game-sync";
import type {
  MaterialHtmlGameRealtime,
  MaterialHtmlGameRealtimeMessage,
  MaterialHtmlGameSdkActionRequest,
  MaterialHtmlGameSdkChannel,
  MaterialHtmlGameSdkCheckpoint,
  MaterialHtmlGameSdkEffect,
  MaterialHtmlGameSdkOrderedAction,
  MaterialHtmlGameSdkSessionAttachment,
  MaterialHtmlGameSdkSessionRegistration,
} from "../../materials/model/materialDocument";
import { recordGameSyncDiagnostic } from "../../materials/model/gameSyncDiagnostics";

const textEncoder = new TextEncoder();
const maximumRememberedIds = 200;

class BoundedIdSet {
  private readonly ids = new Set<string>();

  add(id: string): void {
    this.ids.add(id);
    if (this.ids.size > maximumRememberedIds) {
      this.ids.delete(this.ids.values().next().value as string);
    }
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }
}

class ActionRateWindow {
  private readonly timestamps = new Array<number>(
    GAME_SYNC_LIMITS.actionSustainedPerThreeSeconds,
  );

  private count = 0;

  private cursor = 0;

  tryRecord(now = Date.now()): boolean {
    let oneSecondCount = 0;
    let threeSecondCount = 0;
    for (let index = 0; index < this.count; index += 1) {
      const timestamp = this.timestamps[index] ?? 0;
      if (now - timestamp < 3_000) {
        threeSecondCount += 1;
        if (now - timestamp < 1_000) {
          oneSecondCount += 1;
        }
      }
    }
    if (
      oneSecondCount >= GAME_SYNC_LIMITS.actionBurstPerSecond
      || threeSecondCount >= GAME_SYNC_LIMITS.actionSustainedPerThreeSeconds
    ) {
      return false;
    }
    this.timestamps[this.cursor] = now;
    this.cursor = (this.cursor + 1) % this.timestamps.length;
    this.count = Math.min(this.count + 1, this.timestamps.length);
    return true;
  }
}

type Session = MaterialHtmlGameSdkSessionRegistration & {
  handledActions: BoundedIdSet;
  handledEffects: BoundedIdSet;
  handledRequests: BoundedIdSet;
  logicalTime: number;
  rateWindow: ActionRateWindow;
  releaseRealtime: () => void;
  revision: number;
};

function sessionKey(blockId: string, runId: string): string {
  return `${blockId}\u0000${runId}`;
}

function serializedMessageBytes(value: unknown): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}

function orderAction(
  session: Session,
  request: GameActionRequest & { at: number; blockId: string; id: string },
): MaterialHtmlGameSdkOrderedAction {
  session.revision += 1;
  session.logicalTime += 1;
  return {
    ...request,
    authorityRevision: session.revision,
    logicalTime: session.logicalTime,
  };
}

function deliver(
  session: Session,
  message: GameSyncInboundMessage,
  action?: MaterialHtmlGameSdkOrderedAction,
): void {
  session.getPort()?.postMessage(message);
  if (action) {
    recordGameSyncDiagnostic({
      blockId: action.blockId,
      eventId: action.eventId,
      revision: action.authorityRevision,
      runId: action.runId,
      stage: "iframe-delivered",
    });
  }
}

export function createGameSyncSessionController({
  realtime,
  publishCheckpoint,
}: {
  publishCheckpoint: (blockId: string, checkpoint: MaterialHtmlGameSdkCheckpoint) => void;
  realtime: MaterialHtmlGameRealtime;
}): MaterialHtmlGameSdkChannel & {
  close: () => void;
  receiveFallback: (message: MaterialHtmlGameRealtimeMessage) => void;
  replaceCheckpoints: (
    checkpoints: Record<string, MaterialHtmlGameSdkCheckpoint>,
  ) => void;
} {
  const sessions = new Map<string, Session>();
  const checkpoints = new Map<string, MaterialHtmlGameSdkCheckpoint>();

  const publish = (message: MaterialHtmlGameRealtimeMessage) => {
    realtime.publish(message);
  };

  const reject = (
    session: Session,
    eventId: string | undefined,
    code: string,
    failRuntime = false,
  ) => {
    deliver(session, { code, eventId, kind: "rejected" });
    if (failRuntime) {
      session.onFailure();
    }
  };

  const applyOrderedAction = (session: Session, action: MaterialHtmlGameSdkOrderedAction) => {
    realtime.acknowledge(action.eventId);
    if (action.authorityRevision > session.revision + 1) {
      publish({
        blockId: session.blockId,
        kind: "resume",
        lastRevision: session.revision,
        requesterId: session.actorId,
        runId: session.runId,
      });
      return;
    }
    session.revision = Math.max(session.revision, action.authorityRevision);
    session.logicalTime = Math.max(session.logicalTime, action.logicalTime);
    if (session.handledActions.has(action.id)) {
      return;
    }
    session.handledActions.add(action.id);
    recordGameSyncDiagnostic({
      blockId: action.blockId,
      eventId: action.eventId,
      revision: action.authorityRevision,
      runId: action.runId,
      stage: "client-inbound-start",
    });
    recordGameSyncDiagnostic({
      blockId: action.blockId,
      eventId: action.eventId,
      revision: action.authorityRevision,
      runId: action.runId,
      stage: "socket-received",
    });
    deliver(session, { action, kind: "ordered-action" }, action);
  };

  const orderRequest = (
    session: Session,
    request: MaterialHtmlGameSdkActionRequest,
    received = false,
  ) => {
    if (
      session.handledRequests.has(request.id)
      || !session.validateRequest(request)
    ) {
      return;
    }
    session.handledRequests.add(request.id);
    if (received) {
      recordGameSyncDiagnostic({
        blockId: request.blockId,
        eventId: request.eventId,
        runId: request.runId,
        stage: "client-inbound-start",
      });
      recordGameSyncDiagnostic({
        blockId: request.blockId,
        eventId: request.eventId,
        runId: request.runId,
        stage: "socket-received",
      });
    }
    const action = orderAction(session, request);
    session.handledActions.add(action.id);
    recordGameSyncDiagnostic({
      blockId: action.blockId,
      eventId: action.eventId,
      revision: action.authorityRevision,
      runId: action.runId,
      stage: "authority-ordered",
    });
    deliver(session, { action, kind: "ordered-action" }, action);
    publish({ action, kind: "ordered-action" });
  };

  const receive = (message: MaterialHtmlGameRealtimeMessage) => {
    const blockId = message.kind === "action-request"
      ? message.request.blockId
      : message.kind === "ordered-action"
        ? message.action.blockId
        : "blockId" in message
          ? message.blockId
          : message.effect.blockId;
    const runId = message.kind === "action-request"
      ? message.request.runId
      : message.kind === "ordered-action"
        ? message.action.runId
        : "runId" in message
          ? message.runId
          : message.effect.runId;
    const session = sessions.get(sessionKey(blockId, runId));
    if (!session) {
      return;
    }
    if (message.kind === "action-request") {
      if (session.isAuthority) {
        orderRequest(session, message.request, true);
      }
    } else if (message.kind === "ordered-action") {
      applyOrderedAction(session, message.action);
    } else if (message.kind === "effect") {
      if (!session.handledEffects.has(message.effect.id)) {
        session.handledEffects.add(message.effect.id);
        deliver(session, { effect: message.effect, kind: "effect" });
      }
    } else if (message.kind === "recovery-required") {
      const checkpoint = checkpoints.get(session.blockId);
      if (checkpoint?.runId === session.runId) {
        session.revision = checkpoint.revision;
        session.logicalTime = checkpoint.logicalTime;
        deliver(session, { checkpoint, kind: "checkpoint" });
      }
    }
  };

  return {
    acknowledge: realtime.acknowledge,
    attach(registration) {
      const key = sessionKey(registration.blockId, registration.runId);
      const checkpoint = checkpoints.get(registration.blockId) ?? registration.getCheckpoint();
      if (checkpoint) {
        checkpoints.set(registration.blockId, checkpoint);
      }
      const session: Session = {
        ...registration,
        handledActions: new BoundedIdSet(),
        handledEffects: new BoundedIdSet(),
        handledRequests: new BoundedIdSet(),
        logicalTime: checkpoint?.runId === registration.runId ? checkpoint.logicalTime : 0,
        rateWindow: new ActionRateWindow(),
        releaseRealtime: () => undefined,
        revision: checkpoint?.runId === registration.runId ? checkpoint.revision : 0,
      };
      sessions.set(key, session);
      session.releaseRealtime = realtime.acquire({
        blockId: session.blockId,
        getRevision: () => session.revision,
        isAuthority: session.isAuthority,
        onMessage: receive,
        runId: session.runId,
      });
      const attachment: MaterialHtmlGameSdkSessionAttachment = {
        handleOutbound(message: GameSyncOutboundMessage) {
          if (message.kind === "action-request") {
            if (!session.validateRequest(message.action)) {
              reject(session, message.action?.eventId, "ACTION_CONTRACT_INVALID", true);
              return;
            }
            if (!session.rateWindow.tryRecord()) {
              reject(session, message.action.eventId, "ACTION_RATE_EXCEEDED", true);
              return;
            }
            if (serializedMessageBytes(message.action) > GAME_SYNC_LIMITS.actionBytes) {
              reject(session, message.action.eventId, "ACTION_TOO_LARGE");
              return;
            }
            const request = {
              ...message.action,
              at: Date.now(),
              blockId: session.blockId,
              id: message.action.eventId,
              runId: session.runId,
            };
            if (session.isAuthority) {
              orderRequest(session, request);
            } else {
              publish({ kind: "action-request", request });
            }
          } else if (message.kind === "effect") {
            if (serializedMessageBytes(message.effect) > GAME_SYNC_LIMITS.effectBytes) {
              return;
            }
            const effect: MaterialHtmlGameSdkEffect = {
              ...message.effect,
              at: Date.now(),
              blockId: session.blockId,
              id: message.effect.effectId,
              runId: session.runId,
            };
            session.handledEffects.add(effect.id);
            publish({ effect, kind: "effect" });
          } else if (message.kind === "checkpoint" && session.isAuthority) {
            if (serializedMessageBytes(message.checkpoint) <= GAME_SYNC_LIMITS.checkpointBytes) {
              const checkpoint = {
                ...message.checkpoint,
                runId: session.runId,
                updatedAt: Date.now(),
              };
              checkpoints.set(session.blockId, checkpoint);
              publishCheckpoint(session.blockId, checkpoint);
            }
          }
        },
        release() {
          if (sessions.get(key) === session) {
            sessions.delete(key);
          }
          session.releaseRealtime();
        },
      };
      return attachment;
    },
    close() {
      sessions.forEach((session) => session.releaseRealtime());
      sessions.clear();
      checkpoints.clear();
    },
    getCheckpoint: (blockId) => checkpoints.get(blockId),
    publish,
    receiveFallback: receive,
    replaceCheckpoints(nextCheckpoints) {
      checkpoints.clear();
      Object.entries(nextCheckpoints).forEach(([blockId, checkpoint]) => {
        checkpoints.set(blockId, checkpoint);
      });
    },
  };
}

