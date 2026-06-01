export interface CollaborationServiceConfig {
  port: number;
  keycloakJwksUrl: string;
  playsayApiBaseUrl: string;
  collaborationServiceToken: string;
  collaborationTokenSecret: string;
  snapshotIntervalMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollaborationServiceConfig {
  return {
    port: numberEnv(env.PORT, 8081),
    keycloakJwksUrl: env.KEYCLOAK_JWKS_URL?.trim() ?? "",
    playsayApiBaseUrl: requiredEnv(env, "PLAYSAY_API_BASE_URL"),
    collaborationServiceToken: requiredEnv(env, "COLLABORATION_SERVICE_TOKEN"),
    collaborationTokenSecret: requiredEnv(env, "COLLABORATION_TOKEN_SECRET"),
    snapshotIntervalMs: numberEnv(env.SNAPSHOT_INTERVAL_MS, 10_000),
  };
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
