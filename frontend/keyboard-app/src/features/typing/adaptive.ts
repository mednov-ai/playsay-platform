import { LAYOUTS } from "../../entities/layouts";
import { seededShuffle } from "../../shared/deterministic";
import type { ChordSet, LayoutId } from "../../shared/types";

export const upThreshold = 0.95;
export const downThreshold = 0.85;
export const stableCadenceThreshold = 0.65;
export const fastSpeedCpm = 200;
export const expertSpeedCpm = 250;
export const remedialId = -1;
export const remedialChordCount = 32;

export interface AdaptiveDecision {
  kind: "up" | "down" | "repeat";
  set: ChordSet;
}

export function buildRemedialSet(layoutId: LayoutId, problemChars: string[], title: string, seed = "focus", sourceChords: string[] = []): ChordSet {
  const layout = LAYOUTS[layoutId];
  const homeAnchors: Record<string, string> = {};
  layout.keys.forEach((key) => {
    if (key.row === 1 && homeAnchors[key.finger] === undefined) {
      homeAnchors[key.finger] = key.char;
    }
  });

  const chars = problemChars.slice(0, 3);
  const combos: string[] = [];
  chars.forEach((char) => {
    combos.push(char, `${char}${char}`);
    const key = layout.byChar[char];
    const anchor = key ? homeAnchors[key.finger] : undefined;
    if (anchor && anchor !== char) {
      combos.push(`${anchor}${char}`, `${char}${anchor}`);
    }
  });

  chars.forEach((left) => {
    chars.forEach((right) => {
      if (left !== right) {
        combos.push(`${left}${right}`);
      }
    });
  });

  const support = sourceChords
    .map((chord) => chord.trim())
    .filter((chord) => chord.length > 0)
    .filter((chord) => chars.some((char) => chord.includes(char)));
  const unique = Array.from(new Set([...combos, ...support, ...sourceChords]));
  const shuffledUnique = seededShuffle(unique, `${layoutId}:${seed}:${chars.join("")}`);
  const repeated: string[] = [];
  while (repeated.length < remedialChordCount && unique.length > 0) {
    repeated.push(...shuffledUnique);
  }

  return {
    id: remedialId,
    layout: layoutId,
    title,
    difficulty: 0,
    tier: "beginner",
    chords: repeated.slice(0, remedialChordCount),
  };
}

export function decideNext(params: {
  layoutId: LayoutId;
  accuracy: number;
  speedCpm: number;
  cadence: number;
  perChar: Record<string, number>;
  currentSet: ChordSet;
  sets: ChordSet[];
  remedialTitle: string;
  remedialSeed?: string;
  calibrationComplete?: boolean;
}): AdaptiveDecision {
  const { layoutId, accuracy, speedCpm, cadence, perChar, currentSet, sets, remedialTitle, remedialSeed } = params;
  const calibrationComplete = params.calibrationComplete ?? true;

  if (accuracy < downThreshold) {
    const problems = topProblemChars(perChar);
    if (problems.length > 0) {
      return {
        kind: "down",
        set: buildRemedialSet(layoutId, problems, remedialTitle, remedialSeed, currentSet.chords),
      };
    }
  }

  const cadenceIsStable = cadence > stableCadenceThreshold;
  const harder = nextHarderSet(currentSet, sets);

  if (calibrationComplete && cadenceIsStable && speedCpm > expertSpeedCpm) {
    const hardest = hardestSet(sets);
    if (hardest && hardest.id !== currentSet.id) {
      return { kind: "up", set: hardest };
    }
  }

  if ((cadenceIsStable && speedCpm >= fastSpeedCpm) || accuracy >= upThreshold) {
    if (harder) {
      return { kind: "up", set: harder };
    }
  }

  return {
    kind: "repeat",
    set: sets.find((set) => set.id === currentSet.id) ?? currentSet,
  };
}

export function candidateSetsForCurrentPractice(currentSet: Pick<ChordSet, "layout" | "practiceKind">, sets: ChordSet[]): ChordSet[] {
  const currentIsCode = currentSet.practiceKind === "CODE" || currentSet.practiceKind === "CODE_COMBO";
  return sets.filter((set) => {
    if (set.layout !== currentSet.layout) {
      return false;
    }
    const candidateIsCode = set.practiceKind === "CODE" || set.practiceKind === "CODE_COMBO";
    return currentIsCode ? candidateIsCode : !candidateIsCode;
  });
}

function nextHarderSet(currentSet: ChordSet, sets: ChordSet[]): ChordSet | undefined {
  return sets
    .filter((set) => set.difficulty > currentSet.difficulty)
    .sort((left, right) => left.difficulty - right.difficulty)[0];
}

function hardestSet(sets: ChordSet[]): ChordSet | undefined {
  return sets.slice().sort((left, right) => right.difficulty - left.difficulty)[0];
}

function topProblemChars(perChar: Record<string, number>): string[] {
  return Object.entries(perChar)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([char]) => char);
}
