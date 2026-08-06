export const PAGE_CHANNEL = "playsay.external-activity.page.v1";
export const EXTENSION_CHANNEL = "playsay.external-activity.extension.v1";
export const TRUSTED_PLAY_SAY_HTTPS_HOSTNAMES = [
  "dev.online.honey.school",
  "online.honey.school",
  "online.honeyschool.ru",
] as const;
export const TRUSTED_PLAY_SAY_HTTP_HOSTNAMES = ["localhost", "127.0.0.1"] as const;
export const TRUSTED_PLAY_SAY_MATCH_PATTERNS = [
  ...TRUSTED_PLAY_SAY_HTTPS_HOSTNAMES.map((hostname) => `https://${hostname}/*`),
  ...TRUSTED_PLAY_SAY_HTTP_HOSTNAMES.map((hostname) => `http://${hostname}/*`),
] as const;

export type ExternalInput =
  | { type: "pointer"; action: "move" | "down" | "up"; x: number; y: number; normalizedX?: number; normalizedY?: number; button?: "left" | "middle" | "right"; clickCount?: number }
  | { type: "scroll"; x: number; y: number; normalizedX?: number; normalizedY?: number; deltaX: number; deltaY: number }
  | { type: "key"; action: "down" | "up"; key: string; code?: string; text?: string; modifiers?: number };

export type PageCommand = {
  version: 1;
  type: "PREPARE" | "INPUT" | "STOP" | "RELOAD" | "BACK";
  sessionId: string;
  nonce: string;
  url?: string;
  input?: ExternalInput;
};

export function isTrustedPlaySayOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" && TRUSTED_PLAY_SAY_HTTPS_HOSTNAMES.some((hostname) => hostname === url.hostname))
      || (url.protocol === "http:" && TRUSTED_PLAY_SAY_HTTP_HOSTNAMES.some((hostname) => hostname === url.hostname));
  } catch {
    return false;
  }
}

export function parsePageCommand(value: unknown): PageCommand | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PageCommand>;
  if (candidate.version !== 1 || !["PREPARE", "INPUT", "STOP", "RELOAD", "BACK"].includes(candidate.type ?? "")) return null;
  if (!safeToken(candidate.sessionId) || !safeToken(candidate.nonce)) return null;
  if (candidate.type === "PREPARE") {
    if (typeof candidate.url !== "string" || candidate.url.length > 2048) return null;
    try {
      if (new URL(candidate.url).protocol !== "https:") return null;
    } catch {
      return null;
    }
  }
  if (candidate.type === "INPUT" && !validInput(candidate.input)) return null;
  return candidate as PageCommand;
}

export function sessionsToReplace<T extends { consumerTabId: number; sessionId: string }>(
  sessions: Iterable<T>,
  consumerTabId: number,
  nextSessionId: string,
): T[] {
  return [...sessions].filter((session) => (
    session.consumerTabId === consumerTabId || session.sessionId === nextSessionId
  ));
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function validInput(input: ExternalInput | undefined): input is ExternalInput {
  if (!input || typeof input !== "object") return false;
  if (input.type === "pointer" || input.type === "scroll") {
    if (!coordinate(input.x) || !coordinate(input.y)) return false;
    if (input.normalizedX !== undefined && !normalizedCoordinate(input.normalizedX)) return false;
    if (input.normalizedY !== undefined && !normalizedCoordinate(input.normalizedY)) return false;
  }
  if (input.type === "pointer") {
    return ["move", "down", "up"].includes(input.action);
  }
  if (input.type === "scroll") {
    return finite(input.deltaX) && finite(input.deltaY);
  }
  return input.type === "key"
    && ["down", "up"].includes(input.action)
    && typeof input.key === "string"
    && input.key.length <= 64;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function coordinate(value: unknown): value is number {
  return finite(value) && value >= 0;
}

function normalizedCoordinate(value: unknown): value is number {
  return coordinate(value) && value <= 1;
}
