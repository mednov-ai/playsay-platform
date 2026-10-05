import * as Y from "yjs";
import * as encoding from "lib0/encoding";

export const messageHtmlGameLifecycle = 3;
export const stoppedRunsMap = "htmlGameStoppedRuns";
export type GameStopResult = "stopped" | "stale" | "incompatible";

export function encodeGameLifecycle(payload: Record<string, unknown>): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageHtmlGameLifecycle);
  encoding.writeVarString(encoder, JSON.stringify(payload));
  return encoding.toUint8Array(encoder);
}

export function stopHtmlGameRun(
  doc: Y.Doc,
  states: Iterable<Record<string, unknown>>,
  command: unknown,
): { blockId: string; runId: string; result: GameStopResult } {
  const value = command as Record<string, unknown> | null;
  if (!value || value.type !== "stop" || !validId(value.blockId) || !validId(value.runId) || !validId(value.launchId)) {
    throw new Error("invalid game stop");
  }
  const { blockId, runId, launchId } = value as { blockId: string; runId: string; launchId: string };
  const stopped = doc.getMap<string>(stoppedRunsMap);
  if (stopped.get(runId) === blockId) return { blockId, runId, result: "stopped" };
  const peers = Array.from(states);
  // Capability is required for every participant: older renderers keep hidden iframes alive.
  if (peers.some((state) => state.htmlGameStopVersion !== 1)) {
    return { blockId, runId, result: "incompatible" };
  }
  const currentRuns = peers.flatMap((state) => {
    const runs = state.htmlGameAuthorities;
    return runs && typeof runs === "object" ? [(runs as Record<string, unknown>)[blockId]] : [];
  }).filter((id): id is string => typeof id === "string" && Boolean(id));
  const savedSnapshot = doc.getMap<Record<string, unknown>>("htmlGameSnapshots").get(blockId);
  const savedCheckpoint = doc.getMap<Record<string, unknown>>("htmlGameSdkCheckpoints").get(blockId);
  const snapshot = savedSnapshot && !stopped.has(String(savedSnapshot.runId)) ? savedSnapshot : undefined;
  const checkpoint = savedCheckpoint && !stopped.has(String(savedCheckpoint.runId)) ? savedCheckpoint : undefined;
  const presentation = doc.getMap("htmlGamePresentation");
  if (presentation.get("launchId") !== launchId || presentation.get("activeBlockId") !== blockId) return { blockId, runId, result: "stale" };
  const current = runId === launchId || (currentRuns.length ? currentRuns.includes(runId) : snapshot?.runId === runId || checkpoint?.runId === runId || (!snapshot && !checkpoint));
  if (!current) return { blockId, runId, result: "stale" };
  doc.transact(() => {
    stopped.set(runId, blockId);
    if (runId === launchId) currentRuns.forEach((currentRun) => stopped.set(currentRun, blockId));
    stopped.set(launchId, blockId);
    if (presentation.get("activeBlockId") === blockId) presentation.delete("activeBlockId");
    if (snapshot?.runId === runId || runId === launchId) doc.getMap("htmlGameSnapshots").delete(blockId);
    if (checkpoint?.runId === runId || runId === launchId) doc.getMap("htmlGameSdkCheckpoints").delete(blockId);
  });
  return { blockId, runId, result: "stopped" };
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/.test(value);
}

// Clients cannot forge or erase the server-owned terminal state through ordinary Yjs sync.
export function assertGameLifecycleUpdate(doc: Y.Doc, update: Uint8Array): void {
  const decoded = Y.decodeUpdate(update);
  const pending = new Map(decoded.structs.map((struct) => [`${struct.id.client}:${struct.id.clock}`, struct]));
  const lookup = (id: Y.ID): Y.AbstractStruct | undefined => {
    if (id.clock < Y.getState(doc.store, id.client)) return Y.getItem(doc.store, id);
    return pending.get(`${id.client}:${id.clock}`);
  };
  const rootOf = (item: Y.Item, visited = new Set<Y.Item>()): string | undefined => {
    if (visited.has(item)) return undefined;
    visited.add(item);
    if (typeof item.parent === "string") return item.parent;
    if (item.parent instanceof Y.AbstractType) {
      let type = item.parent;
      while (type._item?.parent instanceof Y.AbstractType) type = type._item.parent;
      return Y.findRootTypeKey(type);
    }
    const parentId = item.parent instanceof Y.ID ? item.parent : item.origin ?? item.rightOrigin;
    const parent = parentId ? lookup(parentId) : undefined;
    return parent instanceof Y.Item ? rootOf(parent, visited) : undefined;
  };
  for (const struct of decoded.structs) {
    if (!(struct instanceof Y.Item) || struct.id.clock + struct.length <= Y.getState(doc.store, struct.id.client)) continue;
    const root = rootOf(struct);
    // Unresolved parents could otherwise queue a future write into the protected map.
    if (!root || root === stoppedRunsMap) throw new Error("game lifecycle state is server-owned");
  }
  for (const [client, ranges] of decoded.ds.clients) {
    const structs = doc.store.clients.get(client) ?? [];
    const incomingEnd = decoded.structs.filter((struct) => struct.id.client === client)
      .reduce((end, struct) => Math.max(end, struct.id.clock + struct.length), Y.getState(doc.store, client));
    for (const range of ranges) {
      const end = range.clock + range.len;
      if (end > incomingEnd) throw new Error("unresolved game lifecycle deletion");
      const start = range.clock < Y.getState(doc.store, client) ? Y.findIndexSS(structs, range.clock) : structs.length;
      for (let index = start; index < structs.length; index += 1) {
        const struct = structs[index];
        if (struct.id.clock >= end) break;
        if (struct.id.clock + struct.length <= range.clock || !(struct instanceof Y.Item) || struct.deleted) continue;
        if (rootOf(struct) === stoppedRunsMap) throw new Error("game lifecycle state is server-owned");
      }
    }
  }
}
