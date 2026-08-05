export type GameSyncDiagnosticStage =
  | "action-created"
  | "host-received"
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
  }
}

const maximumEntries = 4_000;

export function gameSyncDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("gameSyncTrace") === "1";
}

export function recordGameSyncDiagnostic(
  entry: Omit<GameSyncDiagnosticEntry, "at"> & { at?: number },
): void {
  if (!gameSyncDiagnosticsEnabled()) {
    return;
  }
  const diagnostics = window.__PLAY_SAY_GAME_SYNC_DIAGNOSTICS__ ?? [];
  diagnostics.push({
    ...entry,
    at: entry.at ?? performance.now(),
  });
  if (diagnostics.length > maximumEntries) {
    diagnostics.splice(0, diagnostics.length - maximumEntries);
  }
  window.__PLAY_SAY_GAME_SYNC_DIAGNOSTICS__ = diagnostics;
}
