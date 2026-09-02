import type { GameRealtimeMode } from "./gameProtocol.js";

export interface CollaborationServiceConfig {
  port: number;
  keycloakJwksUrl: string;
  playsayApiBaseUrl: string;
  collaborationServiceToken: string;
  collaborationTokenSecret: string;
  snapshotIntervalMs: number;
  websocketHardLimitBytes: number;
  websocketMaxPayloadBytes: number;
  websocketSoftLimitBytes: number;
  websocketHeartbeatIntervalMs: number;
  websocketHeartbeatMissedPongs: number;
  gameRealtimeMode: GameRealtimeMode;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollaborationServiceConfig {
  const config = {
    port: numberEnv(env.PORT, 8081),
    keycloakJwksUrl: env.KEYCLOAK_JWKS_URL?.trim() ?? "",
    playsayApiBaseUrl: requiredEnv(env, "PLAYSAY_API_BASE_URL"),
    collaborationServiceToken: requiredEnv(env, "COLLABORATION_SERVICE_TOKEN"),
    collaborationTokenSecret: requiredEnv(env, "COLLABORATION_TOKEN_SECRET"),
    snapshotIntervalMs: numberEnv(env.SNAPSHOT_INTERVAL_MS, 10_000),
    websocketHardLimitBytes: numberEnv(env.WEBSOCKET_HARD_LIMIT_BYTES, 4 * 1024 * 1024),
    websocketMaxPayloadBytes: numberEnv(env.WEBSOCKET_MAX_PAYLOAD_BYTES, 4 * 1024 * 1024),
    websocketSoftLimitBytes: numberEnv(env.WEBSOCKET_SOFT_LIMIT_BYTES, 1024 * 1024),
    websocketHeartbeatIntervalMs: numberEnv(env.WEBSOCKET_HEARTBEAT_INTERVAL_MS, 20_000),
    websocketHeartbeatMissedPongs: integerEnv(env.WEBSOCKET_HEARTBEAT_MISSED_PONGS, 2),
    gameRealtimeMode: gameRealtimeModeEnv(env.GAME_REALTIME_MODE),
  };
  if (config.websocketHardLimitBytes <= config.websocketSoftLimitBytes) {
    throw new Error("websocket hard limit must exceed the soft limit");
  }
  if (config.websocketHeartbeatIntervalMs * (config.websocketHeartbeatMissedPongs + 1) > 60_000) {
    throw new Error("websocket heartbeat must terminate stale connections within 60 seconds");
  }
  if (config.websocketHeartbeatMissedPongs < 2) {
    throw new Error("websocket heartbeat requires more than one missed pong");
  }
  return config;
}

function integerEnv(value: string | undefined, fallback: number): number {
  const parsed = numberEnv(value, fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(`invalid integer env value: ${value}`);
  }
  return parsed;
}

function gameRealtimeModeEnv(value: string | undefined): GameRealtimeMode {
  const normalized = value?.trim().toLowerCase() || "off";
  if (normalized === "off" || normalized === "shadow" || normalized === "primary") {
    return normalized;
  }
  throw new Error(`invalid GAME_REALTIME_MODE: ${value}`);
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function numberEnv(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid numeric env value: ${value}`);
  }
  return parsed;
}
