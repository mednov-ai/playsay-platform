import type { ChordSet, SubmitResult } from "../../shared/types";
import type { SessionResult } from "./typingStore";

export function buildTrainingSubmitPayload(result: SessionResult, activeSet: ChordSet | null): SubmitResult | null {
  const sourceChordSetId = activeSet?.id === -1 ? activeSet.sourceChordSetId : undefined;
  const chordSetId = sourceChordSetId ?? result.chordSetId;
  if (chordSetId <= 0) {
    return null;
  }

  const lessonKind = activeSet?.id === -1 ? "FOCUS" : "STANDARD";
  return {
    chordSetId,
    lessonKind,
    speedCpm: result.speedCpm,
    accuracy: result.accuracy,
    errors: result.errors,
    durationMs: result.durationMs,
    perFinger: result.perFinger,
    perChar: result.perChar,
    perChord: result.perChord,
    focusProblemKeys: lessonKind === "FOCUS" ? activeSet?.focusProblemKeys ?? [] : [],
  };
}
