import { parseExternalActivityMessage, type ExternalActivityRealtimeMessage } from "./externalActivityProtocol";

export const externalActivityRealtimeSubprotocol = "playsay-external-activity-v1";
export const maximumExternalActivityRealtimePayloadBytes = 16 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeExternalActivityRealtimeFrame(message: ExternalActivityRealtimeMessage): Uint8Array {
  const bytes = encoder.encode(JSON.stringify(message));
  if (bytes.byteLength > maximumExternalActivityRealtimePayloadBytes) {
    throw new Error("External activity realtime payload is too large");
  }
  return bytes;
}

export function decodeExternalActivityRealtimeFrame(data: ArrayBufferLike): ExternalActivityRealtimeMessage {
  const bytes = new Uint8Array(data);
  if (bytes.byteLength === 0 || bytes.byteLength > maximumExternalActivityRealtimePayloadBytes) {
    throw new Error("Invalid external activity realtime payload size");
  }
  const parsed: unknown = JSON.parse(decoder.decode(bytes));
  const source = asObject(parsed);
  const message = parseExternalActivityMessage({
    version: 1,
    type: realtimeMessageType(parsed),
    ...source,
    ...(source.kind === "external-cursor" ? { cursor: { x: source.x, y: source.y } } : {}),
  });
  if (!message) throw new Error("Invalid external activity realtime frame");
  if (!source.kind || !["external-input", "external-result", "external-cursor"].includes(String(source.kind))) {
    throw new Error("Unsupported external activity realtime frame");
  }
  return source as ExternalActivityRealtimeMessage;
}

function realtimeMessageType(value: unknown): string {
  if (!value || typeof value !== "object" || !("kind" in value)) return "";
  if (value.kind === "external-input") return "INPUT";
  if (value.kind === "external-result") return "INPUT_RESULT";
  if (value.kind === "external-cursor") return "CURSOR";
  return "";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
