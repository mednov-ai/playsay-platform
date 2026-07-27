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
  };
  if (config.websocketHardLimitBytes <= config.websocketSoftLimitBytes) {
    throw new Error("websocket hard limit must exceed the soft limit");
  }
  return config;
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
