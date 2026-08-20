import type { ChordSet, SubmitResult, VocabularyTargetResult } from "../../shared/types";
import type { SessionResult } from "./typingStore";

export function buildTrainingSubmitPayload(result: SessionResult, activeSet: ChordSet | null): SubmitResult | null {
  const sourceChordSetId = activeSet && activeSet.id < 0 ? activeSet.sourceChordSetId : undefined;
  const chordSetId = sourceChordSetId ?? result.chordSetId;
  if (chordSetId <= 0) {
    return null;
  }

  const lessonKind = activeSet?.id === -1 ? "FOCUS" : "STANDARD";
  return {
    clientResultId: result.clientResultId,
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

export function buildVocabularyResults(result: SessionResult, activeSet: ChordSet | null): VocabularyTargetResult[] | undefined {
  const context = activeSet?.vocabularyContext;
  if (!context?.typedTargets || context.targets.length === 0) return undefined;
  const remainingErrors = { ...result.perChord };
  const durationPerTarget = Math.max(0, Math.round(result.durationMs / context.targets.length));
  return context.targets.map((target) => {
    const errors = remainingErrors[target.text] ?? 0;
    remainingErrors[target.text] = 0;
    return {
      resultId: target.targetId,
      targetId: target.targetId,
      targetType: target.type,
      errors,
      durationMs: durationPerTarget,
      position: target.position,
      typedText: target.text,
      sourceEntryIds: target.sourceEntryIds,
      sourceItemIds: target.sourceItemIds,
    };
  });
}

function localTrainingDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
