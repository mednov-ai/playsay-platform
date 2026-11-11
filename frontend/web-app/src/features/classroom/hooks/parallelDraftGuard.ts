import type { LessonMaterialJson } from "../../../shared/api/playsay";

const pending = new Set<string>();
const retained = new Map<string, LessonMaterialJson>();
const listeners = new Set<() => void>();
let epoch = 0;
let registered = false;

function beforeUnload(event: BeforeUnloadEvent) {
  if (!pending.size) return;
  event.preventDefault();
  event.returnValue = "";
}

function updateListener() {
  if (typeof window === "undefined") return;
  if (pending.size && !registered) {
    window.addEventListener("beforeunload", beforeUnload);
    registered = true;
  } else if (!pending.size && registered) {
    window.removeEventListener("beforeunload", beforeUnload);
    registered = false;
  }
}

export function markParallelDraftPending(key: string): void {
  const changed = !pending.has(key);
  pending.add(key);
  updateListener();
  if (changed) listeners.forEach((listener) => listener());
}

export function confirmParallelDraftPersisted(key: string): void {
  const changed = pending.delete(key);
  updateListener();
  if (changed) listeners.forEach((listener) => listener());
}

export function isParallelDraftPending(key: string): boolean {
  return pending.has(key);
}

export function hasUnconfirmedParallelDrafts(): boolean {
  return pending.size > 0;
}

export function subscribeParallelDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function parallelDraftEpoch(): number {
  return epoch;
}

export function retainParallelDraft(key: string, snapshot: LessonMaterialJson, expectedEpoch: number): void {
  if (epoch === expectedEpoch) retained.set(key, snapshot);
}

export function readRetainedParallelDraft(key: string): LessonMaterialJson | undefined {
  return retained.get(key);
}

export function clearParallelDrafts(): void {
  epoch += 1;
  const changed = pending.size > 0;
  pending.clear();
  retained.clear();
  updateListener();
  if (changed) listeners.forEach((listener) => listener());
}
