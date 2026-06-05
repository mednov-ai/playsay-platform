import type { AdaptiveDecision } from "./adaptive";

export type ResultAdviceKind = "problemChord" | "problemChar" | "accuracy" | "cadence" | "speed" | "levelUp" | "steady";

export interface ResultAdvice {
  kind: ResultAdviceKind;
  value?: string;
}

export const resultAdviceProblemChordThreshold = 2;
export const resultAdviceProblemCharThreshold = 3;
export const resultAdviceAccuracyThreshold = 0.96;
export const resultAdviceCadenceThreshold = 0.68;
export const resultAdviceSpeedThreshold = 180;

export function chooseResultAdvice(params: {
  accuracy: number;
  speedCpm: number;
  cadence: number;
  errors: number;
  perChar: Record<string, number>;
  perChord: Record<string, number>;
  nextKind?: AdaptiveDecision["kind"];
}): ResultAdvice {
  const problemChord = topProblem(params.perChord, resultAdviceProblemChordThreshold);
  if (problemChord) {
    return { kind: "problemChord", value: problemChord };
  }

  const problemChar = topProblem(params.perChar, resultAdviceProblemCharThreshold);
  if (problemChar) {
    return { kind: "problemChar", value: problemChar };
  }

  if (params.errors > 0 || params.accuracy < resultAdviceAccuracyThreshold) {
    return { kind: "accuracy" };
  }

  if (params.cadence < resultAdviceCadenceThreshold) {
    return { kind: "cadence" };
  }

  if (params.speedCpm < resultAdviceSpeedThreshold) {
    return { kind: "speed" };
  }

  if (params.nextKind === "up") {
    return { kind: "levelUp" };
  }

  return { kind: "steady" };
}

function topProblem(values: Record<string, number>, threshold: number): string | null {
  return (
    Object.entries(values)
      .filter(([, count]) => count >= threshold)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
  );
}
