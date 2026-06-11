const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export interface AverageTempoInput {
  correctCount: number;
  durationMs: number;
}

export interface SessionMasteryInput {
  previousMasteryCpm?: number | null;
  averageCpm: number;
  accuracy: number;
  cadence: number;
}

export interface SessionMastery {
  masteryCpm: number;
  masteryDelta: number;
}

export function computeAverageTempo({ correctCount, durationMs }: AverageTempoInput): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  return Math.round((Math.max(0, correctCount) / (durationMs / 60_000)) * 10) / 10;
}

export function computeCadence(intervals: number[]): number {
  if (intervals.length < 3) {
    return 1;
  }

  const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  if (mean <= 0) {
    return 1;
  }

  const variance = intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return clamp(1 - coefficientOfVariation, 0, 1);
}

export function estimateSessionMastery({
  previousMasteryCpm,
  averageCpm,
  accuracy,
  cadence,
}: SessionMasteryInput): SessionMastery {
  const cleanAverage = Math.max(0, Number.isFinite(averageCpm) ? averageCpm : 0);
  const cleanAccuracy = clamp(Number.isFinite(accuracy) ? accuracy : 0, 0, 1);
  const cleanCadence = clamp(Number.isFinite(cadence) ? cadence : 0, 0, 1);
  const effectiveTempo = cleanAverage * cadenceTempoFactor(cleanCadence) * accuracyTempoFactor(cleanAccuracy);
  const previous = previousMasteryCpm != null && previousMasteryCpm > 0 ? previousMasteryCpm : null;
  const alpha =
    previous == null
      ? 1
      : effectiveTempo < previous && (cleanCadence < 0.55 || cleanAccuracy < 0.93)
        ? 0.34
        : cleanCadence >= 0.7 && cleanAccuracy >= 0.96
          ? 0.5
          : cleanCadence >= 0.55 && cleanAccuracy >= 0.93
            ? 0.28
            : 0.18;
  const masteryCpm = roundOne(previous == null ? effectiveTempo : previous + (effectiveTempo - previous) * alpha);
  const masteryDelta = roundOne(previous == null ? 0 : masteryCpm - previous);
  return { masteryCpm, masteryDelta };
}

export function masteryDeltaLabel(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function cadenceTempoFactor(cadence: number): number {
  if (cadence >= 0.7) {
    return 0.98 + Math.min(0.02, (cadence - 0.7) * 0.067);
  }
  if (cadence >= 0.55) {
    return 0.86 + ((cadence - 0.55) / 0.15) * 0.12;
  }
  return 0.62 + (cadence / 0.55) * 0.24;
}

function accuracyTempoFactor(accuracy: number): number {
  if (accuracy >= 0.96) {
    return 1;
  }
  if (accuracy >= 0.9) {
    return 0.88 + ((accuracy - 0.9) / 0.06) * 0.12;
  }
  return 0.7 + (accuracy / 0.9) * 0.18;
}
