export const PAGE_CHANNEL = "playsay.external-activity.page.v1";
export const EXTENSION_CHANNEL = "playsay.external-activity.extension.v1";

export type ExternalInput =
  | { type: "pointer"; action: "move" | "down" | "up"; x: number; y: number; button?: "left" | "middle" | "right"; clickCount?: number }
  | { type: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
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
    return (url.protocol === "https:" && (url.hostname === "online.play-and-say.ru" || url.hostname === "play-and-say.ru"))
      || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
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

export function cdpCommandForInput(input: ExternalInput): { method: string; params: Record<string, unknown> } | null {
  if (!input || typeof input !== "object") return null;
  if (input.type === "pointer") {
    if (!coordinate(input.x) || !coordinate(input.y) || !["move", "down", "up"].includes(input.action)) return null;
    const eventTypes = { move: "mouseMoved", down: "mousePressed", up: "mouseReleased" } as const;
    return {
      method: "Input.dispatchMouseEvent",
      params: {
        type: eventTypes[input.action],
        x: input.x,
        y: input.y,
        ...(input.action === "move" ? {} : { button: input.button ?? "left", clickCount: input.clickCount ?? 1 }),
      },
    };
  }
  if (input.type === "scroll") {
    if (![input.x, input.y, input.deltaX, input.deltaY].every(finite) || !coordinate(input.x) || !coordinate(input.y)) return null;
    return {
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseWheel", x: input.x, y: input.y, deltaX: input.deltaX, deltaY: input.deltaY },
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

function safeToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function finite(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function coordinate(value: number): boolean {
  return finite(value) && value >= 0;
}
