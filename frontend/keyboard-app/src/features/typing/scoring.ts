const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const speedReferenceCpm = 300;

export type Grade = "S" | "A" | "B" | "C" | "D";

export const scoreWeights = {
  accuracy: 0.45,
  speed: 0.3,
  cadence: 0.25,
} as const;

export const scoreGradeBands: Array<{ grade: Grade; min: number; label: string }> = [
  { grade: "S", min: 90, label: "90-100" },
  { grade: "A", min: 80, label: "80-89" },
  { grade: "B", min: 70, label: "70-79" },
  { grade: "C", min: 55, label: "55-69" },
  { grade: "D", min: 0, label: "0-54" },
];

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

export function gradeForScore(total: number): Grade {
  return scoreGradeBands.find((band) => total >= band.min)?.grade ?? "D";
}

export function computeScore(speedCpm: number, accuracy: number, cadence: number): Score {
  const speedScore = clamp(speedCpm / speedReferenceCpm, 0, 1);
  const accuracyScore = clamp(accuracy, 0, 1);
  const cadenceScore = clamp(cadence, 0, 1);
  const total = Math.round(
    100 * (scoreWeights.accuracy * accuracyScore + scoreWeights.speed * speedScore + scoreWeights.cadence * cadenceScore),
  );
  const grade = gradeForScore(total);

  return {
    total,
    grade,
    speedScore,
    accuracyScore,
    cadenceScore,
  };
}
