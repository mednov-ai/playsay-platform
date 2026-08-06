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
  | { type: "pointer"; action: "move" | "down" | "up"; x: number; y: number; normalizedX?: number; normalizedY?: number; sourceWidth?: number; sourceHeight?: number; button?: "left" | "middle" | "right"; clickCount?: number }
  | { type: "scroll"; x: number; y: number; normalizedX?: number; normalizedY?: number; sourceWidth?: number; sourceHeight?: number; deltaX: number; deltaY: number }
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
  if (candidate.type === "INPUT" && !candidate.input) return null;
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

export function cdpCommandForInput(
  input: ExternalInput,
  viewport?: { height: number; width: number },
): { method: string; params: Record<string, unknown> } | null {
  if (!input || typeof input !== "object") return null;
  if (input.type === "pointer") {
    if (!coordinate(input.x) || !coordinate(input.y) || !["move", "down", "up"].includes(input.action)) return null;
    const eventTypes = { move: "mouseMoved", down: "mousePressed", up: "mouseReleased" } as const;
    const point = targetPoint(input, viewport);
    return {
      method: "Input.dispatchMouseEvent",
      params: {
        type: eventTypes[input.action],
        x: point.x,
        y: point.y,
        ...(input.action === "move" ? {} : { button: input.button ?? "left", clickCount: input.clickCount ?? 1 }),
      },
    };
  }
  if (input.type === "scroll") {
    if (![input.x, input.y, input.deltaX, input.deltaY].every(finite) || !coordinate(input.x) || !coordinate(input.y)) return null;
    const point = targetPoint(input, viewport);
    return {
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseWheel", x: point.x, y: point.y, deltaX: input.deltaX, deltaY: input.deltaY },
    };
  }
  if (input.type === "key") {
    if (!["down", "up"].includes(input.action) || typeof input.key !== "string" || input.key.length > 64) return null;
    return {
      method: "Input.dispatchKeyEvent",
      params: {
        type: input.action === "down" ? "keyDown" : "keyUp",
        key: input.key,
        code: input.code ?? "",
        text: input.action === "down" ? input.text ?? "" : "",
        modifiers: input.modifiers ?? 0,
      },
    };
  }
  return null;
}

function targetPoint(
  input: { x: number; y: number; normalizedX?: number; normalizedY?: number; sourceWidth?: number; sourceHeight?: number },
  viewport?: { height: number; width: number },
): { x: number; y: number } {
  if (
    viewport
    && finite(viewport.width)
    && finite(viewport.height)
    && finite(input.normalizedX ?? -1)
    && finite(input.normalizedY ?? -1)
    && input.normalizedX! >= 0
    && input.normalizedX! <= 1
    && input.normalizedY! >= 0
    && input.normalizedY! <= 1
  ) {
    return {
      x: input.normalizedX! * viewport.width,
      y: input.normalizedY! * viewport.height,
    };
  }
  if (
    !viewport
    || !finite(viewport.width)
    || !finite(viewport.height)
    || !finite(input.sourceWidth ?? 0)
    || !finite(input.sourceHeight ?? 0)
    || (input.sourceWidth ?? 0) <= 0
    || (input.sourceHeight ?? 0) <= 0
  ) return { x: input.x, y: input.y };
  return {
    x: Math.min(viewport.width, Math.max(0, input.x / input.sourceWidth! * viewport.width)),
    y: Math.min(viewport.height, Math.max(0, input.y / input.sourceHeight! * viewport.height)),
  };
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function finite(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function coordinate(value: number): boolean {
  return finite(value) && value >= 0;
}
