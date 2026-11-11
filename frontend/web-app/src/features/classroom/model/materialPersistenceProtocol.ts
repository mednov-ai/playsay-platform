import * as decoding from "lib0/decoding";

type MaterialPersistence = { documentId: string; stateVector: string; deleteSet: string };

export function decodeMaterialPersistence(data: unknown): MaterialPersistence | null {
  if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) return null;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes[0] !== 6 || bytes.byteLength > 2_000_000) return null;
  try {
    const decoder = decoding.createDecoder(bytes);
    decoding.readVarUint(decoder);
    const value = JSON.parse(decoding.readVarString(decoder)) as Record<string, unknown>;
    if (decoding.hasContent(decoder) || value.type !== "material-persisted" || value.version !== 1 ||
        typeof value.documentId !== "string" || typeof value.stateVector !== "string" || typeof value.deleteSet !== "string") return null;
    return { documentId: value.documentId, stateVector: value.stateVector, deleteSet: value.deleteSet };
  } catch { return null; }
}
