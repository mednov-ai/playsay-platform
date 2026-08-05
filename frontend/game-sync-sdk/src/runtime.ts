import {
  GAME_SYNC_LIMITS,
  type DefineGameOptions,
  type GameActionRequest,
  type GameCheckpoint,
  type GameController,
  type GameEffect,
  type GameReducerContext,
  type GameSessionContext,
  type GameSyncDiagnosticStage,
  type OrderedGameAction,
} from "./types";
import { validateGameManifest } from "./compatibility";
import { resolveDefaultTransport } from "./transport";

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertSize(value: unknown, maximum: number, label: string): void {
  const bytes = serializedBytes(value);
  if (bytes > maximum) {
    throw new Error(`${label} exceeds ${maximum} bytes (${bytes})`);
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function checksumState(value: unknown): string {
  const input = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function reducerContext(seed: number, revision: number, logicalTime: number): GameReducerContext {
  let randomState = (seed ^ Math.imul(revision + 1, 0x9e3779b1)) >>> 0;
  return {
    logicalTime,
    revision,
    seed,
    random() {
      randomState += 0x6d2b79f5;
      let result = randomState;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function defineGame<TState>(options: DefineGameOptions<TState>): GameController<TState> {
  validateGameManifest(options.manifest);
  const transport = options.transport ?? resolveDefaultTransport();
  let actorId = `pending-${randomId()}`;
  let runId = `pending-${randomId()}`;
  let seed = 1;
  let actorSequence = 0;
  let authorityRevision = 0;
  let logicalTime = 0;
  let disposed = false;
  let connected = false;
  let session: GameSessionContext | null = null;
  let checkpointRevision = 0;
  let lastCheckpointAt = Date.now();
  let canonicalState = resolveInitialState(options.initialState, seed);
  let renderedState = canonicalState;
  let canonicalActions: OrderedGameAction[] = [];
  let pendingActions: GameActionRequest[] = [];
  let baseCheckpoint: GameCheckpoint<TState> = makeCheckpoint(canonicalState);
  const handledEffects = new Set<string>();
  const dispatchedAt: number[] = [];
  let diagnosticsEnabled = false;

  function diagnostic(
    stage: GameSyncDiagnosticStage,
    eventId?: string,
    revision?: number,
  ): void {
    if (!diagnosticsEnabled) {
      return;
    }
    transport.send({
      diagnostic: {
        at: performance.now(),
        eventId,
        revision,
        stage,
      },
      kind: "diagnostic",
    });
  }

  function diagnosticAfterPaint(eventId?: string, revision?: number): void {
    if (!diagnosticsEnabled || typeof requestAnimationFrame !== "function") {
      return;
    }
    requestAnimationFrame(() => diagnostic("painted", eventId, revision));
  }

  function assertActionRate(): void {
    const now = Date.now();
    while (dispatchedAt.length > 0 && now - (dispatchedAt[0] ?? now) >= 3_000) {
      dispatchedAt.shift();
    }
    const oneSecondCount = dispatchedAt.filter((at) => now - at < 1_000).length;
    if (
      oneSecondCount >= GAME_SYNC_LIMITS.actionBurstPerSecond ||
      dispatchedAt.length >= GAME_SYNC_LIMITS.actionSustainedPerThreeSeconds
    ) {
      throw new Error("ACTION_RATE_EXCEEDED");
    }
    dispatchedAt.push(now);
  }

  function resolveInitialState(
    initialState: DefineGameOptions<TState>["initialState"],
    nextSeed: number,
  ): TState {
    return typeof initialState === "function"
      ? (initialState as (seed: number) => TState)(nextSeed)
      : structuredClone(initialState);
  }

  function makeCheckpoint(state: TState): GameCheckpoint<TState> {
    return {
      checksum: checksumState(state),
      gameId: options.manifest.gameId,
      logicalTime,
      revision: authorityRevision,
      runId,
      seed,
      state: structuredClone(state),
      stateVersion: options.manifest.stateVersion,
    };
  }

  function publishState(state: TState): void {
    renderedState = state;
    options.onState(state);
  }

  function reduceOne(state: TState, action: OrderedGameAction): TState {
    return options.reduce(
      state,
      action,
      reducerContext(seed, action.authorityRevision, action.logicalTime),
    );
  }

  function rebuildRenderedState(): void {
    let next = canonicalState;
    let optimisticRevision = authorityRevision;
    let optimisticTime = logicalTime;
    for (const action of pendingActions) {
      optimisticRevision += 1;
      optimisticTime += 1;
      next = reduceOne(next, {
        ...action,
        authorityRevision: optimisticRevision,
        logicalTime: optimisticTime,
      });
    }
    publishState(next);
  }

  function report(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    if (options.onError) {
      options.onError(normalized);
    } else {
      console.error("[PlaySayGameSync]", normalized);
    }
  }

  function maybePublishCheckpoint(force = false): void {
    if (
      !force &&
      authorityRevision - checkpointRevision < GAME_SYNC_LIMITS.checkpointIntervalRevisions &&
      Date.now() - lastCheckpointAt < GAME_SYNC_LIMITS.checkpointIntervalMs
    ) {
      return;
    }
    const checkpoint = makeCheckpoint(canonicalState);
    assertSize(checkpoint, GAME_SYNC_LIMITS.checkpointBytes, "Checkpoint");
    checkpointRevision = authorityRevision;
    lastCheckpointAt = Date.now();
    baseCheckpoint = checkpoint;
    canonicalActions = [];
    transport.send({ checkpoint, kind: "checkpoint" });
  }

  function acceptAction(action: OrderedGameAction): void {
    if (
      action.gameId !== options.manifest.gameId ||
      action.runId !== runId ||
      action.stateVersion !== options.manifest.stateVersion ||
      action.authorityRevision <= authorityRevision
    ) {
      return;
    }
    if (action.authorityRevision !== authorityRevision + 1) {
      report(new Error(`Missing ordered action before revision ${action.authorityRevision}`));
      return;
    }
    canonicalState = reduceOne(canonicalState, action);
    canonicalActions.push(action);
    if (canonicalActions.length > GAME_SYNC_LIMITS.recentActions) {
      canonicalActions = canonicalActions.slice(-GAME_SYNC_LIMITS.recentActions);
    }
    authorityRevision = action.authorityRevision;
    logicalTime = action.logicalTime;
    pendingActions = pendingActions.filter((candidate) => candidate.eventId !== action.eventId);
    rebuildRenderedState();
    diagnostic("ordered-applied", action.eventId, action.authorityRevision);
    diagnostic("ordered-confirmed", action.eventId, action.authorityRevision);
    diagnosticAfterPaint(action.eventId, action.authorityRevision);
    maybePublishCheckpoint();
  }

  function acceptCheckpoint(checkpoint: GameCheckpoint): void {
    if (
      checkpoint.gameId !== options.manifest.gameId ||
      checkpoint.runId !== runId ||
      checkpoint.stateVersion !== options.manifest.stateVersion ||
      checkpoint.revision < authorityRevision ||
      checksumState(checkpoint.state) !== checkpoint.checksum
    ) {
      return;
    }
    seed = checkpoint.seed;
    authorityRevision = checkpoint.revision;
    logicalTime = checkpoint.logicalTime;
    canonicalState = structuredClone(checkpoint.state) as TState;
    baseCheckpoint = structuredClone(checkpoint) as GameCheckpoint<TState>;
    checkpointRevision = checkpoint.revision;
    canonicalActions = [];
    rebuildRenderedState();
  }

  const unsubscribe = transport.subscribe((message) => {
    try {
      if (message.kind === "context") {
        actorId = message.actorId;
        runId = message.runId;
        seed = message.seed;
        session = {
          actorId,
          diagnostics: message.diagnostics,
          isAuthority: message.isAuthority,
          runId,
          seed,
        };
        diagnosticsEnabled = message.diagnostics === true;
        connected = true;
        pendingActions = pendingActions.map((action) => ({
          ...action,
          actorId,
          runId,
        }));
        if (message.checkpoint) {
          authorityRevision = 0;
          acceptCheckpoint(message.checkpoint);
        } else if (authorityRevision === 0) {
          canonicalState = resolveInitialState(options.initialState, seed);
          baseCheckpoint = makeCheckpoint(canonicalState);
          rebuildRenderedState();
        }
        pendingActions.forEach((action) => {
          transport.send({ action, kind: "action-request" });
        });
        options.onSession?.(Object.freeze({ ...session }));
      } else if (message.kind === "ordered-action") {
        acceptAction(message.action);
      } else if (message.kind === "checkpoint") {
        acceptCheckpoint(message.checkpoint);
      } else if (message.kind === "effect") {
        if (!handledEffects.has(message.effect.effectId)) {
          handledEffects.add(message.effect.effectId);
          if (handledEffects.size > GAME_SYNC_LIMITS.recentActions) {
            handledEffects.delete(handledEffects.values().next().value as string);
          }
          options.onEffect?.(message.effect);
        }
      } else if (message.kind === "rejected") {
        pendingActions = message.eventId
          ? pendingActions.filter((action) => action.eventId !== message.eventId)
          : [];
        rebuildRenderedState();
        report(new Error(message.message ?? message.code));
      }
    } catch (error) {
      report(error);
    }
  });

  publishState(renderedState);
  transport.send({ kind: "hello", manifest: options.manifest });

  function lifecycle(event: "ready" | "pause" | "resume" | "dispose"): void {
    if (!disposed || event === "dispose") {
      if (event === "pause" || event === "dispose") {
        maybePublishCheckpoint(true);
      }
      transport.send({ event, kind: "lifecycle" });
    }
  }

  return {
    complete(details) {
      transport.send({ details, kind: "complete" });
    },
    dispatch(type, payload) {
      if (disposed) {
        throw new Error("Game controller is disposed");
      }
      if (typeof type !== "string" || !type.trim() || type.length > 120) {
        throw new Error("Action type must be a non-empty string up to 120 characters");
      }
      assertActionRate();
      const action: GameActionRequest = {
        actorId,
        actorSequence: ++actorSequence,
        eventId: randomId(),
        gameId: options.manifest.gameId,
        payload,
        runId,
        stateVersion: options.manifest.stateVersion,
        type: type.trim(),
      };
      diagnostic("action-created", action.eventId);
      assertSize(action, GAME_SYNC_LIMITS.actionBytes, "Action");
      pendingActions.push(action);
      rebuildRenderedState();
      diagnostic("optimistic-applied", action.eventId);
      diagnosticAfterPaint(action.eventId);
      if (connected) {
        transport.send({ action, kind: "action-request" });
      }
      return action.eventId;
    },
    dispose() {
      if (disposed) {
        return;
      }
      lifecycle("dispose");
      disposed = true;
      unsubscribe();
      transport.close?.();
    },
    emitEffect(kind, payload) {
      const effect: GameEffect = {
        effectId: randomId(),
        gameId: options.manifest.gameId,
        kind,
        payload,
        revision: authorityRevision,
        runId,
      };
      assertSize(effect, GAME_SYNC_LIMITS.effectBytes, "Effect");
      handledEffects.add(effect.effectId);
      transport.send({ effect, kind: "effect" });
      return effect.effectId;
    },
    getSession() {
      return session ? Object.freeze({ ...session }) : null;
    },
    getState() {
      return renderedState;
    },
    pause() {
      lifecycle("pause");
    },
    ready() {
      lifecycle("ready");
    },
    reportScore(score, details) {
      if (!Number.isFinite(score)) {
        throw new Error("Score must be finite");
      }
      transport.send({ details, kind: "score", score });
    },
    resume() {
      lifecycle("resume");
    },
  };
}
