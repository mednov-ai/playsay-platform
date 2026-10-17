import * as decoding from "lib0/decoding";
import * as Y from "yjs";
import type { CollaborationClaims } from "./rooms.js";

export const messageWhiteboard = 5;
export const messageWhiteboardPersistence = 6;
export interface WhiteboardPolicy { canManage: boolean; canDraw: boolean; contentEpoch: number; controlRevision: number }

export async function loadWhiteboardPolicy(config: { playsayApiBaseUrl: string; collaborationServiceToken: string }, claims: CollaborationClaims): Promise<WhiteboardPolicy> {
  const response = await fetch(new URL(`/internal/whiteboards/${claims.documentId}/policy`, config.playsayApiBaseUrl), {
    method: "POST", signal: AbortSignal.timeout(5000),
    headers: { "content-type": "application/json", "x-playsay-collaboration-service-token": config.collaborationServiceToken },
    body: JSON.stringify({ subject: claims.subject, contentEpoch: claims.contentEpoch }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error("whiteboard access unavailable"); }
  const policy = await response.json() as WhiteboardPolicy;
  if (policy.contentEpoch !== claims.contentEpoch || typeof policy.canManage !== "boolean" || typeof policy.canDraw !== "boolean" || !Number.isSafeInteger(policy.controlRevision) || policy.controlRevision < 0) throw new Error("invalid whiteboard policy");
  return policy;
}

/** Validate the candidate before accepting any visible or deferred Yjs mutation. */
export function assertWhiteboardSync(doc: Y.Doc, bytes: Uint8Array, claims: CollaborationClaims, policy: WhiteboardPolicy): void {
  const decoder = decoding.createDecoder(bytes);
  if (decoding.readVarUint(decoder) !== 0) return;
  const type = decoding.readVarUint(decoder);
  if (type === 0) return;
  if (type !== 1 && type !== 2) throw new Error("invalid whiteboard sync");
  const update = decoding.readVarUint8Array(decoder);
  if (decoding.hasContent(decoder)) throw new Error("invalid whiteboard payload");
  const shadow = new Y.Doc();
  try {
    Y.applyUpdate(shadow, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(shadow, update);
    if (shadow.store.pendingStructs || shadow.store.pendingDs) throw new Error("deferred whiteboard update");
    const before = doc.getMap<Y.Map<unknown>>("annotations").toJSON() as Record<string, Record<string, unknown>>;
    const after = shadow.getMap<Y.Map<unknown>>("annotations").toJSON() as Record<string, Record<string, unknown>>;
    for (const key of new Set([...doc.share.keys(), ...shadow.share.keys()])) {
      if (key !== "annotations" && key !== "whiteboardCamera") throw new Error("unknown whiteboard root");
      if (key === "whiteboardCamera" && JSON.stringify(doc.getMap(key).toJSON()) !== JSON.stringify(shadow.getMap(key).toJSON())) throw new Error("reserved whiteboard field");
    }
    if (Object.keys(after).length > 10_000) throw new Error("whiteboard element limit");
    let points = 0;
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const old = before[id], next = after[id];
      if (JSON.stringify(old) !== JSON.stringify(next)) {
        if (!policy.canDraw) throw new Error("whiteboard drawing disabled");
        if (!policy.canManage && ((old && old.ownerSubject !== claims.subject) || (next && next.ownerSubject !== claims.subject))) throw new Error("whiteboard ownership");
        if (old && next && old.ownerSubject !== next.ownerSubject) throw new Error("immutable whiteboard owner");
      }
      if (next) {
        if (next.id !== id || typeof next.ownerSubject !== "string" || next.ownerSubject.length > 255) throw new Error("invalid whiteboard element");
        if (!["stroke", "line", "arrow", "rectangle", "ellipse", "text"].includes(String(next.kind))) throw new Error("invalid whiteboard kind");
        if (typeof next.color !== "string" || !/^#[0-9a-f]{6}$/i.test(next.color)) throw new Error("invalid whiteboard color");
        validateGeometry(next);
        validateElement(next);
        if (Array.isArray(next.points)) points += next.points.length;
        if (typeof next.text === "string" && next.text.length > 20_000) throw new Error("whiteboard text limit");
      }
    }
    if (points > 200_000) throw new Error("whiteboard point limit");
  } finally { shadow.destroy(); }
}

function validateElement(element: Record<string, unknown>): void {
  const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  const point = (value: unknown) => { const p = value as Record<string, unknown> | undefined; return !!p && number(p.x, -100000, 100000) && number(p.y, -100000, 100000) && p.pageId === "whiteboard"; };
  if (element.pageId !== "whiteboard" || !element.ownerSubject || !number(element.createdAt, 0, 10 ** 15) || element.anchorId !== undefined) throw new Error("invalid whiteboard identity");
  if (element.kind === "stroke") {
    if (!Array.isArray(element.points) || !element.points.length || !element.points.every(point)) throw new Error("invalid whiteboard stroke");
  } else if (element.kind === "line" || element.kind === "arrow") {
    if (!point(element.start) || !point(element.end)) throw new Error("invalid whiteboard line");
  } else {
    if (!number(element.x, -100000, 100000) || !number(element.y, -100000, 100000) || !number(element.width, 1, 200000) || !number(element.height, 1, 200000)) throw new Error("invalid whiteboard box");
    if (element.fill !== "transparent" && (typeof element.fill !== "string" || !/^#[0-9a-f]{6}$/i.test(element.fill))) throw new Error("invalid whiteboard fill");
  }
  if (element.kind === "text") {
    if (typeof element.text !== "string" || !number(element.fontSize, 8, 128)) throw new Error("invalid whiteboard text");
    if ([element.autoWidth, element.autoHeight].some(value => value !== undefined && typeof value !== "boolean")) throw new Error("invalid whiteboard sizing");
  } else if (!number(element.strokeWidth, 1, 64)) throw new Error("invalid whiteboard width");
}

function validateGeometry(value: unknown, key = ""): void {
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > (key === "createdAt" ? 10 ** 15 : 200_000))) throw new Error("whiteboard coordinate limit");
  if (Array.isArray(value)) value.forEach(item => validateGeometry(item, key));
  else if (value && typeof value === "object") Object.entries(value).forEach(([name, item]) => validateGeometry(item, name));
}

export function applyWhiteboardCamera(doc: Y.Doc, value: unknown, canManage: boolean, controlledIds: Set<number>): void {
  const command = value as Record<string, unknown>;
  if (!canManage || !command || command.type !== "camera" || command.version !== 1 || (!Number.isSafeInteger(command.sourceClientId) || !controlledIds.has(command.sourceClientId as number))) throw new Error("whiteboard camera forbidden");
  if (Object.keys(command).sort().join(",") !== "region,sourceClientId,type,version") throw new Error("invalid whiteboard command");
  const region = command.region as Record<string, number>;
  if (!region || Object.keys(region).sort().join(",") !== "height,width,x,y" || !["x", "y", "width", "height"].every(key => typeof region[key] === "number" && Number.isFinite(region[key]) && Math.abs(region[key]) <= 200_000) || region.width <= 0 || region.height <= 0) throw new Error("invalid whiteboard camera");
  const map = doc.getMap("whiteboardCamera");
  const previous = map.get("state") as { revision?: number } | undefined;
  map.set("state", { ...region, revision: Math.max(Date.now(), (previous?.revision ?? 0) + 1) });
}
