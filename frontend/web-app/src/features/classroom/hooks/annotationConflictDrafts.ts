import type { AnnotationContent } from "../model/annotation";

type Draft = { baseline: AnnotationContent; content: AnnotationContent };

const drafts = new Map<string, Draft>();
const listeners = new Set<() => void>();
let session = 0;

export function draftSession() { return session; }

export function readConflictDraft(key: string) { return drafts.get(key); }

export function subscribeConflictDrafts(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function retainConflictDraft(key: string, expectedSession: number, draft: Draft) {
  if (expectedSession !== session) return;
  drafts.set(key, draft);
  listeners.forEach((listener) => listener());
}

export function forgetConflictDraft(key: string, expected: Draft) {
  if (drafts.get(key) !== expected) return;
  drafts.delete(key);
  listeners.forEach((listener) => listener());
}

export function clearConflictDrafts() {
  session++;
  drafts.clear();
  listeners.forEach((listener) => listener());
}
