import type { ChordSet, SubmitResult, VocabularyTargetResult } from "../../shared/types";
import type { SessionResult } from "./typingStore";
import { readVocabularyTargetJournal } from "./vocabularyResultJournal";

export function buildTrainingSubmitPayload(result: SessionResult, activeSet: ChordSet | null): SubmitResult | null {
  const sourceChordSetId = activeSet && activeSet.id < 0 ? activeSet.sourceChordSetId : undefined;
  const chordSetId = sourceChordSetId ?? result.chordSetId;
  if (chordSetId <= 0) {
    return null;
  }

  const lessonKind = activeSet?.id === -1 ? "FOCUS" : "STANDARD";
  return {
    clientResultId: activeSet?.vocabularyContext
      ? `keyboard-vocabulary-${activeSet.vocabularyContext.sessionId}`
      : result.clientResultId,
    chordSetId,
    lessonKind,
    speedCpm: result.speedCpm,
    averageCpm: result.averageCpm,
    cadence: result.cadence,
    accuracy: result.accuracy,
    errors: result.errors,
    characterCount: result.characterCount,
    correctCount: result.correctCount,
    durationMs: result.durationMs,
    perFinger: result.perFinger,
    perChar: result.perChar,
    perChord: result.perChord,
    focusProblemKeys: lessonKind === "FOCUS" ? activeSet?.focusProblemKeys ?? [] : [],
    windowMetrics: {},
    clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    localTrainingDate: localTrainingDate(),
    practiceContext: activeSet?.practiceContext,
    vocabularyResults: buildVocabularyResults(result, activeSet),
  };
}

export function buildVocabularyResults(result: SessionResult, activeSet: ChordSet | null, storage?: Storage | null): VocabularyTargetResult[] | undefined {
  const context = activeSet?.vocabularyContext;
  if (!context?.typedTargets || context.targets.length === 0) return undefined;
  const queued = new Map(readVocabularyTargetJournal(context.sessionId, storage).map((entry) => [entry.targetId, entry]));
  const queuedPrefix = (context.allTargets ?? []).slice(0, context.startPosition).flatMap((target) => {
    const entry = queued.get(target.targetId);
    if (!entry || entry.position !== target.position) return [];
    return [{
      resultId: target.targetId, targetId: target.targetId, targetType: target.type,
      errors: entry.errors, durationMs: entry.durationMs, position: target.position,
      typedText: target.text, sourceEntryIds: target.sourceEntryIds, sourceItemIds: target.sourceItemIds,
    }];
  });
  const remainingErrors = { ...result.perChord };
  const durationPerTarget = Math.max(0, Math.round(result.durationMs / context.targets.length));
  const currentResults = context.targets.map((target) => {
    const pending = queued.get(target.targetId);
    const errors = pending?.position === target.position ? pending.errors : remainingErrors[target.text] ?? 0;
    remainingErrors[target.text] = 0;
    return {
      resultId: target.targetId,
      targetId: target.targetId,
      targetType: target.type,
      errors,
      durationMs: pending?.position === target.position ? pending.durationMs : durationPerTarget,
      position: target.position,
      typedText: target.text,
      sourceEntryIds: target.sourceEntryIds,
      sourceItemIds: target.sourceItemIds,
    };
  });
  return [...queuedPrefix, ...currentResults];
}

function localTrainingDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
