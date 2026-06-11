export type TechniqueAdviceKind =
  | "problemChord"
  | "problemChar"
  | "rhythm"
  | "accuracy"
  | "accuracyTrend"
  | "speed"
  | "steady";

export type TechniqueAdviceTone = "ACCURACY" | "RHYTHM" | "STEADY";

export interface TechniqueAdvice {
  kind: TechniqueAdviceKind;
  value?: string;
  tone: TechniqueAdviceTone;
}

export interface RecentTechniquePoint {
  accuracy: number;
  masteryCpm?: number | null;
}

export const techniqueAdviceProblemChordThreshold = 2;
export const techniqueAdviceProblemCharThreshold = 3;
export const techniqueAdviceAccuracyThreshold = 0.96;
export const techniqueAdviceCadenceThreshold = 0.68;
export const techniqueAdviceSpeedThreshold = 180;

export function chooseTechniqueAdvice(params: {
  accuracy: number;
  averageCpm: number;
  cadence: number;
  errors: number;
  perChar: Record<string, number>;
  perChord: Record<string, number>;
  recent: RecentTechniquePoint[];
}): TechniqueAdvice {
  const problemChord = topProblem(params.perChord, techniqueAdviceProblemChordThreshold);
  if (problemChord) {
    return { kind: "problemChord", value: problemChord, tone: "ACCURACY" };
  }

  const problemChar = topProblem(params.perChar, techniqueAdviceProblemCharThreshold);
  if (problemChar) {
    return { kind: "problemChar", value: problemChar, tone: "ACCURACY" };
  }

  if (params.cadence < techniqueAdviceCadenceThreshold) {
    return { kind: "rhythm", tone: "RHYTHM" };
  }

  if (accuracyTrendDropped(params.accuracy, params.recent)) {
    return { kind: "accuracyTrend", tone: "ACCURACY" };
  }

  if (params.errors > 0 || params.accuracy < techniqueAdviceAccuracyThreshold) {
    return { kind: "accuracy", tone: "ACCURACY" };
  }

  if (params.averageCpm < techniqueAdviceSpeedThreshold) {
    return { kind: "speed", tone: "STEADY" };
  }

  return { kind: "steady", tone: "STEADY" };
}

function topProblem(values: Record<string, number>, threshold: number): string | null {
  return (
    Object.entries(values)
      .filter(([, count]) => count >= threshold)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
  );
}

function accuracyTrendDropped(currentAccuracy: number, recent: RecentTechniquePoint[]): boolean {
  const previous = recent
    .slice(0, 2)
    .map((item) => item.accuracy)
    .filter((value) => Number.isFinite(value));
  if (previous.length === 0) {
    return false;
  }
  const average = previous.reduce((sum, value) => sum + value, 0) / previous.length;
  return currentAccuracy + 0.02 < average;
}
