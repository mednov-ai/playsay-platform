export const GAME_SYNC_PROTOCOL = "playsay-game-sync/v1" as const;

export const GAME_SYNC_LIMITS = {
  actionBytes: 16 * 1024,
  checkpointBytes: 512 * 1024,
  checkpointIntervalMs: 2_000,
  checkpointIntervalRevisions: 20,
  effectBytes: 8 * 1024,
  recentActions: 200,
} as const;

export type GameSyncCapability =
  | "actions"
  | "effects"
  | "score"
  | "completion";

export type GameManifest = {
  buildHash: string;
  capabilities?: GameSyncCapability[];
  gameId: string;
  protocol: typeof GAME_SYNC_PROTOCOL;
  reducerVersion: string;
  stateVersion: string;
};

export type GameActionRequest<TPayload = unknown> = {
  actorId: string;
  actorSequence: number;
  eventId: string;
  gameId: string;
  payload: TPayload;
  runId: string;
  stateVersion: string;
  type: string;
};

export type OrderedGameAction<TPayload = unknown> = GameActionRequest<TPayload> & {
  authorityRevision: number;
  logicalTime: number;
};

export type GameEffect<TPayload = unknown> = {
  effectId: string;
  gameId: string;
  kind: string;
  payload: TPayload;
  revision: number;
  runId: string;
};

export type GameCheckpoint<TState = unknown> = {
  checksum: string;
  gameId: string;
  logicalTime: number;
  revision: number;
  runId: string;
  seed: number;
  state: TState;
  stateVersion: string;
};

export type GameReducerContext = {
  logicalTime: number;
  random: () => number;
  revision: number;
  seed: number;
};

export type GameReducer<TState> = (
  state: Readonly<TState>,
  action: Readonly<OrderedGameAction>,
  context: GameReducerContext,
) => TState;

export type GameLifecycleEvent = "ready" | "pause" | "resume" | "dispose";

export type GameSyncOutboundMessage =
  | { kind: "hello"; manifest: GameManifest }
  | { kind: "action-request"; action: GameActionRequest }
  | { kind: "effect"; effect: GameEffect }
  | { kind: "checkpoint"; checkpoint: GameCheckpoint }
  | { kind: "lifecycle"; event: GameLifecycleEvent }
  | { kind: "score"; score: number; details?: Record<string, unknown> }
  | { kind: "complete"; details?: Record<string, unknown> };

export type GameSyncInboundMessage =
  | {
      actorId: string;
      checkpoint?: GameCheckpoint;
      kind: "context";
      runId: string;
      seed: number;
    }
  | { action: OrderedGameAction; kind: "ordered-action" }
  | { checkpoint: GameCheckpoint; kind: "checkpoint" }
  | { kind: "effect"; effect: GameEffect }
  | { code: string; eventId?: string; kind: "rejected"; message?: string };

export interface GameSyncTransport {
  close?(): void;
  send(message: GameSyncOutboundMessage): void;
  subscribe(listener: (message: GameSyncInboundMessage) => void): () => void;
}

export type DefineGameOptions<TState> = {
  initialState: TState | ((seed: number) => TState);
  manifest: GameManifest;
  onEffect?: (effect: GameEffect) => void;
  onError?: (error: Error) => void;
  onState: (state: Readonly<TState>) => void;
  reduce: GameReducer<TState>;
  transport?: GameSyncTransport;
};

export interface GameController<TState> {
  complete(details?: Record<string, unknown>): void;
  dispatch<TPayload = unknown>(type: string, payload: TPayload): string;
  dispose(): void;
  emitEffect<TPayload = unknown>(kind: string, payload: TPayload): string;
  getState(): Readonly<TState>;
  pause(): void;
  ready(): void;
  reportScore(score: number, details?: Record<string, unknown>): void;
  resume(): void;
}

declare global {
  interface Window {
    __PLAY_SAY_GAME_SYNC_TRANSPORT__?: GameSyncTransport;
  }
}
