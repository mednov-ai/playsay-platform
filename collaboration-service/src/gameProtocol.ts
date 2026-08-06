import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

export const gameRealtimeSubprotocol = "playsay-game-v1";
export const messageGame = 3;
export const gameProtocolVersion = 1;
export const maxGamePayloadBytes = 24 * 1024;

export type GameRealtimeMode = "off" | "shadow" | "primary";

export const gameMessageTypes = {
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

const clientMessageTypes = new Set<number>([
  gameMessageTypes.actionRequest,
  gameMessageTypes.orderedAction,
  gameMessageTypes.effect,
  gameMessageTypes.ack,
  gameMessageTypes.resume,
  gameMessageTypes.recoveryRequired,
  gameMessageTypes.externalInput,
  gameMessageTypes.externalCursor,
]);

export function validateGameFrame(bytes: Uint8Array): {
  payloadBytes: number;
  type: number;
} {
  const decoder = decoding.createDecoder(bytes);
  if (decoding.readVarUint(decoder) !== messageGame) {
    throw new Error("invalid game message class");
  }
  if (decoding.readVarUint(decoder) !== gameProtocolVersion) {
    throw new Error("unsupported game protocol version");
  }
  const type = decoding.readVarUint(decoder);
  if (!clientMessageTypes.has(type)) {
    throw new Error("unsupported game message type");
  }
  const payload = decoding.readVarUint8Array(decoder);
  if (payload.byteLength > maxGamePayloadBytes) {
    throw new Error("game payload is too large");
  }
  if (decoding.hasContent(decoder)) {
    throw new Error("unexpected game frame data");
  }
  return { payloadBytes: payload.byteLength, type };
}

export function encodeGameWelcome(mode: Exclude<GameRealtimeMode, "off">): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageGame);
  encoding.writeVarUint(encoder, gameProtocolVersion);
  encoding.writeVarUint(encoder, gameMessageTypes.welcome);
  encoding.writeVarUint8Array(
    encoder,
    new TextEncoder().encode(JSON.stringify({ mode })),
  );
  return encoding.toUint8Array(encoder);
}
