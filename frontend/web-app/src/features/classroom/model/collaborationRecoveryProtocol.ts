import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
export type RecoveryControl = { type: "hello"; version: 1; liveness: true } | { type: "ack"; version: 1; nonce: string };
export function decodeRecoveryControl(data: unknown): RecoveryControl | null {
  if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) return null;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes[0] !== 4) return null;
  if (bytes.byteLength > 256) throw new Error("invalid recovery control");
  const decoder = decoding.createDecoder(bytes);
  decoding.readVarUint(decoder);
  const value = JSON.parse(decoding.readVarString(decoder)) as Record<string, unknown>;
  if (decoding.hasContent(decoder) || value.version !== 1) throw new Error("invalid recovery control");
  if (value.type === "hello" && value.liveness === true) return { type: "hello", version: 1, liveness: true };
  if (value.type === "ack" && typeof value.nonce === "string" && /^[a-f0-9]{16}$/.test(value.nonce)) return { type: "ack", version: 1, nonce: value.nonce };
  throw new Error("invalid recovery control");
}
export function encodeRecoveryProbe(nonce: string): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 4);
  encoding.writeVarString(encoder, JSON.stringify({ type: "probe", version: 1, nonce }));
  return encoding.toUint8Array(encoder);
}
