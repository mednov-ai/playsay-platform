import type {
  ChordSet,
  SubmitResult,
  VocabularyKeyTarget,
  VocabularySessionPracticeResponse,
} from "../../shared/types";
import { readVocabularyTargetJournal } from "./vocabularyResultJournal";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const acknowledgementPrefix = "honey.key.vocabulary.ack.";
const pendingResultKey = "honey.key.vocabulary.pending-result";

export function buildVocabularyChordSet(
  response: VocabularySessionPracticeResponse,
  fallbackTitle: string,
  storage: Storage | null = browserStorage(),
): ChordSet {
  const typedTargets = Boolean(response.targets?.length);
  const targets = typedTargets ? response.targets! : legacyTargets(response);
  const recordedPosition = response.completionContext?.lastRecordedPosition;
  const durableResultsSupported = typedTargets && Number.isSafeInteger(recordedPosition) && recordedPosition != null && recordedPosition >= 0;
  let startPosition = durableResultsSupported ? Math.min(targets.length, recordedPosition) : 0;
  if (durableResultsSupported) {
    const queued = new Map(readVocabularyTargetJournal(response.sessionId, storage).map((entry) => [entry.targetId, entry.position]));
    while (startPosition < targets.length && queued.get(targets[startPosition].targetId) === targets[startPosition].position) {
      startPosition += 1;
    }
  }
  const remainingTargets = targets.slice(startPosition);
  const title = response.title || fallbackTitle;
  return {
    id: -900,
    layout: response.layout ?? "EN",
    title,
    difficulty: 1,
    tier: "beginner",
    chords: remainingTargets.map((target) => target.text),
    practiceKind: "VOCABULARY",
    practiceContext: {
      practiceKind: "VOCABULARY",
      title,
      vocabularyEntryIds: response.items.map((item) => item.entryId),
      vocabularyItemIds: response.items.map((item) => item.itemId),
      vocabularyWords: response.items.map((item) => item.sourceText),
      vocabularySessionId: response.sessionId,
      vocabularyMode: response.mode ?? "WHOLE_WORDS",
      vocabularyMaterializerVersion: response.materializerVersion,
      vocabularyMaterializerSeed: response.materializerSeed,
      vocabularyCompletionPolicy: response.completionContext?.completionPolicy,
      vocabularyReturnTarget: response.returnContext?.target,
    },
    vocabularyContext: {
      sessionId: response.sessionId,
      mode: response.mode ?? "WHOLE_WORDS",
      targets: remainingTargets,
      allTargets: targets,
      typedTargets,
      durableResultsSupported,
      allTargetsRecorded: Boolean(durableResultsSupported && targets.length > 0 && recordedPosition >= targets.length),
      startPosition,
      totalTargets: targets.length,
      delivery: response.completionContext?.delivery ?? "SELF",
      completionPolicy: response.completionContext?.completionPolicy ?? "COMPLETE_SESSION",
      assignmentId: response.completionContext?.assignmentId,
      lessonId: response.completionContext?.lessonId,
      returnTarget: response.returnContext?.target,
    },
  };
}

export function readVocabularyAcknowledgement(sessionId: string, storage: StorageLike | null = browserStorage()): number {
  const value = Number(storage?.getItem(`${acknowledgementPrefix}${sessionId}`));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function writeVocabularyAcknowledgement(
  sessionId: string,
  position: number,
  storage: StorageLike | null = browserStorage(),
): number {
  const next = Math.max(readVocabularyAcknowledgement(sessionId, storage), Math.max(0, Math.floor(position)));
  storage?.setItem(`${acknowledgementPrefix}${sessionId}`, String(next));
  return next;
}

function parsePendingVocabularyResult(raw: string | null): SubmitResult | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SubmitResult;
    return typeof value.clientResultId === "string" && value.clientResultId &&
      value.practiceContext?.practiceKind === "VOCABULARY" && value.vocabularyResults?.length ? value : null;
  } catch {
    return null;
  }
}

export function readPendingVocabularyResults(storage: Storage | null = browserStorage()): SubmitResult[] {
  if (!storage) return [];
  try {
    const results: SubmitResult[] = [];
    const seen = new Set<string>();
    const legacy = parsePendingVocabularyResult(storage.getItem(pendingResultKey));
    if (legacy) { results.push(legacy); seen.add(legacy.clientResultId); }
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(`${pendingResultKey}.`)) continue;
      const result = parsePendingVocabularyResult(storage.getItem(key));
      if (result && !seen.has(result.clientResultId)) { results.push(result); seen.add(result.clientResultId); }
    }
    return results;
  } catch {
    return [];
  }
}

export function readPendingVocabularyResult(storage: Storage | null = browserStorage()): SubmitResult | null {
  return readPendingVocabularyResults(storage)[0] ?? null;
}

export function writePendingVocabularyResult(result: SubmitResult, storage: Storage | null = browserStorage()): boolean {
  const sessionId = result.practiceContext?.vocabularySessionId;
  if (!storage || result.practiceContext?.practiceKind !== "VOCABULARY" || !result.vocabularyResults?.length || !sessionId) return false;
  try {
    storage.setItem(`${pendingResultKey}.${encodeURIComponent(sessionId)}.${encodeURIComponent(result.clientResultId)}`, JSON.stringify(result));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingVocabularyResult(clientResultId: string, storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key));
    for (const key of keys) {
      if (key !== pendingResultKey && !key.startsWith(`${pendingResultKey}.`)) continue;
      if (parsePendingVocabularyResult(storage.getItem(key))?.clientResultId === clientResultId) storage.removeItem(key);
    }
  } catch {
    // Retrying an already accepted client result is safe.
  }
}

function legacyTargets(response: VocabularySessionPracticeResponse): VocabularyKeyTarget[] {
  return response.items.map((item, position) => ({
    targetId: stableUuid(`${response.sessionId}:${item.itemId}`),
    position,
    type: "WHOLE_WORD",
    text: item.sourceText,
    sourceEntryIds: [item.entryId],
    sourceItemIds: [item.itemId],
    offsets: [{ entryId: item.entryId, itemId: item.itemId, start: 0, endExclusive: item.sourceText.length }],
  }));
}

function stableUuid(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const hex = Array.from({ length: 32 }, (_, index) => ((hash >>> ((index % 8) * 4)) & 0xf).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
