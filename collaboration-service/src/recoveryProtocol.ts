import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
export const messageRecovery = 4;
export function encodeRecovery(value: Record<string, unknown>): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageRecovery);
  encoding.writeVarString(encoder, JSON.stringify(value));
  return encoding.toUint8Array(encoder);
}
export function decodeProbe(bytes: Uint8Array): string {
  if (bytes.byteLength > 256) throw new Error("invalid recovery control");
  const decoder = decoding.createDecoder(bytes);
  if (decoding.readVarUint(decoder) !== messageRecovery) throw new Error("invalid recovery control");
  const value = JSON.parse(decoding.readVarString(decoder)) as Record<string, unknown>;
  if (decoding.hasContent(decoder) || value.type !== "probe" || value.version !== 1 || typeof value.nonce !== "string" || !/^[a-f0-9]{16}$/.test(value.nonce) || Object.keys(value).length !== 3) throw new Error("invalid recovery control");
  return value.nonce;
}
