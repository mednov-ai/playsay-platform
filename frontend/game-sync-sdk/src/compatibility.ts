import { GAME_SYNC_PROTOCOL, type GameManifest } from "./types";
import type { GameSyncCapability } from "./types";

export type GameCompatibility =
  | "SDK_V1"
  | "LEGACY_PREDICTIVE"
  | "LEGACY_MIRROR"
  | "UNSUPPORTED";

const NON_DETERMINISTIC_PATTERNS = [
  /\bWebSocket\b/i,
  /\bEventSource\b/i,
  /\bRTCPeerConnection\b/i,
  /\bgetUserMedia\b/i,
  /\bnavigator\.geolocation\b/i,
  /\bfetch\s*\(/i,
  /\bXMLHttpRequest\b/i,
];

const GAME_SYNC_CAPABILITIES = new Set<GameSyncCapability>([
  "actions",
  "completion",
  "effects",
  "score",
]);

export function validateGameManifest(value: unknown): GameManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GAME_MANIFEST_INVALID: manifest must be an object");
  }
  const manifest = value as Partial<GameManifest>;
  const stringFields = ["gameId", "stateVersion", "reducerVersion", "buildHash"] as const;
  if (manifest.protocol !== GAME_SYNC_PROTOCOL) {
    throw new Error(`GAME_MANIFEST_INVALID: protocol must be ${GAME_SYNC_PROTOCOL}`);
  }
  for (const field of stringFields) {
    if (typeof manifest[field] !== "string" || !manifest[field]?.trim()) {
      throw new Error(`GAME_MANIFEST_INVALID: ${field} must be a non-empty string`);
    }
  }
  if (manifest.capabilities !== undefined) {
    if (
      !Array.isArray(manifest.capabilities) ||
      manifest.capabilities.some((capability) => (
        typeof capability !== "string" ||
        !GAME_SYNC_CAPABILITIES.has(capability as GameSyncCapability)
      )) ||
      new Set(manifest.capabilities).size !== manifest.capabilities.length
    ) {
      throw new Error("GAME_MANIFEST_INVALID: capabilities must be a unique supported string array");
    }
  }
  return manifest as GameManifest;
}

export function readGameManifest(html: string): GameManifest | null {
  const match = html.match(
    /<script[^>]+type=["']application\/playsay-game\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) {
    return null;
  }
  try {
    return validateGameManifest(JSON.parse(match[1]));
  } catch {
    return null;
  }
}

export function classifyGameHtml(html: string): GameCompatibility {
  if (readGameManifest(html)) {
    return "SDK_V1";
  }
  if (NON_DETERMINISTIC_PATTERNS.some((pattern) => pattern.test(html))) {
    return "LEGACY_MIRROR";
  }
  if (/<html[\s>]/i.test(html) && /<(script|canvas|svg|button|input)[\s>]/i.test(html)) {
    return "LEGACY_PREDICTIVE";
  }
  return "UNSUPPORTED";
}
