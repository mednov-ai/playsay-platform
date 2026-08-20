import type {
  ChordSet,
  SubmitResult,
  VocabularyKeyTarget,
  VocabularySessionPracticeResponse,
} from "../../shared/types";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const acknowledgementPrefix = "honey.key.vocabulary.ack.";
const pendingResultKey = "honey.key.vocabulary.pending-result";

export function buildVocabularyChordSet(
  response: VocabularySessionPracticeResponse,
  fallbackTitle: string,
  storage: StorageLike | null = browserStorage(),
): ChordSet {
  const typedTargets = Boolean(response.targets?.length);
  const targets = typedTargets ? response.targets! : legacyTargets(response);
  const serverPosition = response.completionContext?.lastAcknowledgedPosition ?? 0;
  const localPosition = readVocabularyAcknowledgement(response.sessionId, storage);
  const startPosition = Math.min(targets.length, Math.max(serverPosition, localPosition));
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
      typedTargets,
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

export function readPendingVocabularyResult(storage: StorageLike | null = browserStorage()): SubmitResult | null {
  const raw = storage?.getItem(pendingResultKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SubmitResult;
    return value.practiceContext?.practiceKind === "VOCABULARY" && value.vocabularyResults?.length ? value : null;
  } catch {
    return null;
  }
}

export function writePendingVocabularyResult(result: SubmitResult, storage: StorageLike | null = browserStorage()): void {
  if (result.practiceContext?.practiceKind === "VOCABULARY" && result.vocabularyResults?.length) {
    storage?.setItem(pendingResultKey, JSON.stringify(result));
  }
}

export function clearPendingVocabularyResult(clientResultId: string, storage: StorageLike | null = browserStorage()): void {
  const pending = readPendingVocabularyResult(storage);
  if (!pending || pending.clientResultId === clientResultId) storage?.removeItem(pendingResultKey);
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

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
