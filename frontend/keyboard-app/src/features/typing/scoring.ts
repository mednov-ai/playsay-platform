const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const speedReferenceCpm = 300;

export type Grade = "S" | "A" | "B" | "C" | "D";

export interface Score {
  total: number;
  grade: Grade;
  speedScore: number;
  accuracyScore: number;
  cadenceScore: number;
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

export function computeScore(speedCpm: number, accuracy: number, cadence: number): Score {
  const speedScore = clamp(speedCpm / speedReferenceCpm, 0, 1);
  const accuracyScore = clamp(accuracy, 0, 1);
  const cadenceScore = clamp(cadence, 0, 1);
  const total = Math.round(100 * (0.45 * accuracyScore + 0.3 * speedScore + 0.25 * cadenceScore));
  const grade: Grade = total >= 90 ? "S" : total >= 80 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : "D";

  return {
    total,
    grade,
    speedScore,
    accuracyScore,
    cadenceScore,
  };
}
