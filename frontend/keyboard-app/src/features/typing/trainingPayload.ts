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
  };
}

function localTrainingDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
