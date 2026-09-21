import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

const materialViewportMapName = "materialViewport";

export function assertSyncMessageDoesNotModifyMaterialViewport(
  doc: Y.Doc,
  encodedMessage: Uint8Array,
): void {
  const decoder = decoding.createDecoder(encodedMessage);
  decoding.readVarUint(decoder);
  const syncMessageType = decoding.readVarUint(decoder);
  if (
    syncMessageType !== syncProtocol.messageYjsSyncStep2
    && syncMessageType !== syncProtocol.messageYjsUpdate
  ) {
    return;
  }

  const before = serializedViewport(doc);
  const shadow = new Y.Doc();
  Y.applyUpdate(shadow, Y.encodeStateAsUpdate(doc));
  const shadowDecoder = decoding.createDecoder(encodedMessage);
  decoding.readVarUint(shadowDecoder);
  syncProtocol.readSyncMessage(shadowDecoder, encoding.createEncoder(), shadow, null);
  const after = serializedViewport(shadow);
  shadow.destroy();
  if (after !== before) {
    throw new Error("material viewport requires an authorized command");
  }
}

export function applyMaterialViewportCommand(
  doc: Y.Doc,
  payload: Uint8Array,
  expectedMaterialId: string,
  controlledClientIds: Set<number>,
  now: number = Date.now(),
): Record<string, unknown> {
  if (payload.byteLength > 16 * 1024) {
    throw new Error("material viewport command is too large");
  }
  const command = JSON.parse(new TextDecoder().decode(payload)) as unknown;
  if (!isRecord(command) || !isRecord(command.viewport)) {
    throw new Error("invalid material viewport command");
  }
  const viewport = command.viewport;
  const sourceClientId = requiredFiniteNumber(viewport, "sourceClientId");
  if (!controlledClientIds.has(sourceClientId)) {
    throw new Error("material viewport client id is not controlled by this connection");
  }
  if (requiredString(viewport, "materialId") !== expectedMaterialId) {
    throw new Error("material viewport material does not match token");
  }
  requiredString(viewport, "pageId");
  requiredString(viewport, "presentationMode");
  requiredString(viewport, "scrollContainer");
  requiredFiniteNumber(viewport, "x");
  requiredFiniteNumber(viewport, "y");

  const map = doc.getMap(materialViewportMapName);
  const current = isRecord(map.get("state")) ? map.get("state") as Record<string, unknown> : null;
  const currentRevision = finiteNumber(current?.revision) ?? 0;
  const revision = Math.max(now, currentRevision + 1);
  const presentationRevision = command.presentationChanged === true
    ? revision
    : finiteNumber(current?.presentationRevision) ?? revision;
  const canonical = {
    ...viewport,
    presentationRevision,
    revision,
    sourceClientId,
  };
  map.set("state", canonical);
  return canonical;
}

function serializedViewport(doc: Y.Doc): string {
  return JSON.stringify(doc.getMap(materialViewportMapName).get("state") ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== "string" || result.trim() === "") throw new Error(`invalid ${key}`);
  return result;
}

function requiredFiniteNumber(value: Record<string, unknown>, key: string): number {
  const result = finiteNumber(value[key]);
  if (result == null) throw new Error(`invalid ${key}`);
  return result;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
