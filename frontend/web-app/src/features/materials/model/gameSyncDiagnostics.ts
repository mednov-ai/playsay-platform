export type GameSyncDiagnosticStage =
  | "action-created"
  | "authority-ordered"
  | "client-inbound-start"
  | "client-outbound-complete"
  | "host-received"
  | "iframe-delivered"
  | "message-port-received"
  | "optimistic-applied"
  | "ordered-applied"
  | "ordered-confirmed"
  | "painted"
  | "socket-received"
  | "socket-queued";

export type GameSyncDiagnosticEntry = {
  at: number;
  blockId?: string;
  eventId?: string;
  revision?: number;
  runId?: string;
  stage: GameSyncDiagnosticStage;
};

declare global {
  interface Window {
    __PLAY_SAY_GAME_SYNC_DIAGNOSTICS__?: GameSyncDiagnosticEntry[];
    __PLAY_SAY_GAME_SYNC_COUNTERS__?: Record<string, number>;
  }
}

const maximumEntries = 4_000;
let diagnosticsEnabled: boolean | undefined;
let overwriteCursor = 0;

export function gameSyncDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  diagnosticsEnabled ??= new URLSearchParams(window.location.search).get("gameSyncTrace") === "1";
  return diagnosticsEnabled;
}

export function recordGameSyncDiagnostic(
  entry: Omit<GameSyncDiagnosticEntry, "at"> & { at?: number },
): void {
  if (!gameSyncDiagnosticsEnabled()) {
    return;
  }
  const diagnostics = window.__PLAY_SAY_GAME_SYNC_DIAGNOSTICS__ ?? [];
  const normalized = {
    ...entry,
    at: entry.at ?? performance.timeOrigin + performance.now(),
  };
  if (diagnostics.length < maximumEntries) {
    diagnostics.push(normalized);
  } else {
    diagnostics[overwriteCursor] = normalized;
    overwriteCursor = (overwriteCursor + 1) % maximumEntries;
  }
  window.__PLAY_SAY_GAME_SYNC_DIAGNOSTICS__ = diagnostics;
}

export function recordGameSyncCounter(name: string, amount = 1): void {
  if (!gameSyncDiagnosticsEnabled()) {
    return;
  }
  const counters = window.__PLAY_SAY_GAME_SYNC_COUNTERS__ ?? {};
  counters[name] = (counters[name] ?? 0) + amount;
  window.__PLAY_SAY_GAME_SYNC_COUNTERS__ = counters;
}
