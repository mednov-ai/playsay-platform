import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import type { MaterialHtmlGameRealtimeMessage } from "../../materials/model/materialDocument";
import type { ExternalActivityRealtimeMessage } from "./externalActivityProtocol";

export const gameRealtimeSubprotocol = "playsay-game-v1";

const messageGame = 3;
const protocolVersion = 1;
const maximumPayloadBytes = 24 * 1024;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const messageTypes = {
  welcome: 0,
  actionRequest: 1,
  orderedAction: 2,
  effect: 3,
  ack: 4,
  resume: 5,
  recoveryRequired: 6,
  externalInput: 7,
  externalCursor: 8,
} as const;

const typeByKind = {
  "action-request": messageTypes.actionRequest,
  "ordered-action": messageTypes.orderedAction,
  effect: messageTypes.effect,
  ack: messageTypes.ack,
  resume: messageTypes.resume,
  "recovery-required": messageTypes.recoveryRequired,
  "external-input": messageTypes.externalInput,
  "external-cursor": messageTypes.externalCursor,
} satisfies Record<(MaterialHtmlGameRealtimeMessage | ExternalActivityRealtimeMessage)["kind"], number>;

const kindByType = new Map<number, (MaterialHtmlGameRealtimeMessage | ExternalActivityRealtimeMessage)["kind"]>(
  Object.entries(typeByKind).map(([kind, type]) => [
    type,
    kind as (MaterialHtmlGameRealtimeMessage | ExternalActivityRealtimeMessage)["kind"],
  ]),
);

export type GameRealtimeMode = "shadow" | "primary";

export type DecodedGameRealtimeFrame =
  | { kind: "welcome"; mode: GameRealtimeMode }
  | { kind: "message"; message: MaterialHtmlGameRealtimeMessage | ExternalActivityRealtimeMessage };

export function encodeGameRealtimeMessage(
  message: MaterialHtmlGameRealtimeMessage,
): Uint8Array {
  return encodeRealtimeMessage(message);
}

export function encodeExternalActivityRealtimeMessage(
  message: ExternalActivityRealtimeMessage,
): Uint8Array {
  return encodeRealtimeMessage(message);
}

function encodeRealtimeMessage(
  message: MaterialHtmlGameRealtimeMessage | ExternalActivityRealtimeMessage,
): Uint8Array {
  const payload = textEncoder.encode(JSON.stringify(message));
  if (payload.byteLength > maximumPayloadBytes) {
    throw new Error("Game realtime payload is too large");
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageGame);
  encoding.writeVarUint(encoder, protocolVersion);
  encoding.writeVarUint(encoder, typeByKind[message.kind]);
  encoding.writeVarUint8Array(encoder, payload);
  return encoding.toUint8Array(encoder);
}

export function decodeGameRealtimeFrame(data: ArrayBufferLike): DecodedGameRealtimeFrame {
  const decoder = decoding.createDecoder(new Uint8Array(data));
  if (decoding.readVarUint(decoder) !== messageGame) {
    throw new Error("Invalid game realtime message class");
  }
  if (decoding.readVarUint(decoder) !== protocolVersion) {
    throw new Error("Unsupported game realtime protocol version");
  }
  const type = decoding.readVarUint(decoder);
  const payload = decoding.readVarUint8Array(decoder);
  if (payload.byteLength > maximumPayloadBytes || decoding.hasContent(decoder)) {
    throw new Error("Invalid game realtime payload");
  }
  const parsed = JSON.parse(textDecoder.decode(payload)) as unknown;
  if (type === messageTypes.welcome) {
    if (
      !parsed
      || typeof parsed !== "object"
      || !("mode" in parsed)
      || (parsed.mode !== "shadow" && parsed.mode !== "primary")
    ) {
      throw new Error("Invalid game realtime welcome");
    }
    return { kind: "welcome", mode: parsed.mode };
  }
  const expectedKind = kindByType.get(type);
  if (
    !expectedKind
    || !parsed
    || typeof parsed !== "object"
    || !("kind" in parsed)
    || parsed.kind !== expectedKind
  ) {
    throw new Error("Invalid game realtime message");
  }
  return {
    kind: "message",
    message: parsed as MaterialHtmlGameRealtimeMessage,
  };
}
