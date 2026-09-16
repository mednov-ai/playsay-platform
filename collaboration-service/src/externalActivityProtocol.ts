export const externalActivityRealtimeSubprotocol = "playsay-external-activity-v1";
export const maxExternalActivityPayloadBytes = 16 * 1024;

const inputResultCodes = new Set([
  "DISPATCHED",
  "BRIDGE_UNAVAILABLE",
  "STALE_SESSION",
  "INPUT_DISABLED",
  "TARGET_UNAVAILABLE",
  "VIEWPORT_STALE",
  "DEBUGGER_FAILED",
  "ACK_TIMEOUT",
]);

export type ExternalActivityFrame =
  | { kind: "external-input"; blockId: string; sessionId: string; eventId: string; input: ExternalInput }
  | { kind: "external-result"; blockId: string; sessionId: string; eventId: string; result: string }
  | { kind: "external-cursor"; blockId: string; sessionId: string; x: number; y: number; color: string; identity: string; name: string };

type ExternalInput =
  | { type: "pointer"; action: "move" | "down" | "up"; x: number; y: number; normalizedX?: number; normalizedY?: number; button?: "left" | "middle" | "right"; clickCount?: number }
  | { type: "scroll"; x: number; y: number; normalizedX?: number; normalizedY?: number; deltaX: number; deltaY: number }
  | { type: "key"; action: "down" | "up"; key: string; code?: string; text?: string; modifiers?: number };

export function parseExternalActivityFrame(bytes: Uint8Array): ExternalActivityFrame {
  if (bytes.byteLength === 0 || bytes.byteLength > maxExternalActivityPayloadBytes) {
    throw new Error("external activity payload size is invalid");
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid external activity frame");
  const frame = parsed as Record<string, unknown>;
  if (!safeToken(frame.blockId) || !safeToken(frame.sessionId)) throw new Error("invalid external activity scope");
  if (frame.kind === "external-input") {
    if (!safeToken(frame.eventId) || !validInput(frame.input) || !onlyKeys(frame, ["kind", "blockId", "sessionId", "eventId", "input"])) {
      throw new Error("invalid external activity input");
    }
  } else if (frame.kind === "external-result") {
    if (!safeToken(frame.eventId) || !inputResultCodes.has(String(frame.result)) || !onlyKeys(frame, ["kind", "blockId", "sessionId", "eventId", "result"])) {
      throw new Error("invalid external activity result");
    }
  } else if (frame.kind === "external-cursor") {
    if (
      !normalized(frame.x)
      || !normalized(frame.y)
      || !boundedString(frame.identity, 160)
      || !boundedString(frame.name, 160)
      || !boundedString(frame.color, 32)
      || !onlyKeys(frame, ["kind", "blockId", "sessionId", "x", "y", "identity", "name", "color"])
    ) throw new Error("invalid external activity cursor");
  } else {
    throw new Error("unsupported external activity frame");
  }
  return frame as ExternalActivityFrame;
}

function validInput(value: unknown): value is ExternalInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (input.type === "pointer") {
    return ["move", "down", "up"].includes(String(input.action))
      && coordinate(input.x) && coordinate(input.y)
      && optionalNormalized(input.normalizedX) && optionalNormalized(input.normalizedY)
      && onlyKeys(input, ["type", "action", "x", "y", "normalizedX", "normalizedY", "button", "clickCount"]);
  }
  if (input.type === "scroll") {
    return coordinate(input.x) && coordinate(input.y)
      && finite(input.deltaX) && finite(input.deltaY)
      && optionalNormalized(input.normalizedX) && optionalNormalized(input.normalizedY)
      && onlyKeys(input, ["type", "x", "y", "normalizedX", "normalizedY", "deltaX", "deltaY"]);
  }
  return input.type === "key"
    && ["down", "up"].includes(String(input.action))
    && boundedString(input.key, 64)
    && (input.code === undefined || boundedString(input.code, 64))
    && (input.text === undefined || boundedString(input.text, 64))
    && (input.modifiers === undefined || finite(input.modifiers))
    && onlyKeys(input, ["type", "action", "key", "code", "text", "modifiers"]);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function safeToken(value: unknown): value is string {
  return boundedString(value, 160) && /^[A-Za-z0-9._:-]+$/.test(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function coordinate(value: unknown): value is number {
  return finite(value) && value >= 0;
}

function normalized(value: unknown): value is number {
  return coordinate(value) && value <= 1;
}

function optionalNormalized(value: unknown): boolean {
  return value === undefined || normalized(value);
}
