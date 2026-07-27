import { GAME_SYNC_PROTOCOL, type GameManifest } from "./types";

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

export function readGameManifest(html: string): GameManifest | null {
  const match = html.match(
    /<script[^>]+type=["']application\/playsay-game\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) {
    return null;
  }
  try {
    const manifest = JSON.parse(match[1]) as Partial<GameManifest>;
    return manifest.protocol === GAME_SYNC_PROTOCOL &&
      typeof manifest.gameId === "string" &&
      typeof manifest.reducerVersion === "string" &&
      typeof manifest.stateVersion === "string" &&
      typeof manifest.buildHash === "string"
      ? manifest as GameManifest
      : null;
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
