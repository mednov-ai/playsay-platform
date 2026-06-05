import { LAYOUTS } from "../../entities/layouts";
import type { ChordSet, LayoutId } from "../../shared/types";

export const upThreshold = 0.95;
export const downThreshold = 0.85;
export const remedialId = -1;

export interface AdaptiveDecision {
  kind: "up" | "down" | "repeat";
  set: ChordSet;
}

export function buildRemedialSet(layoutId: LayoutId, problemChars: string[], title: string): ChordSet {
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

  const unique = Array.from(new Set(combos));
  const repeated: string[] = [];
  while (repeated.length < 18 && unique.length > 0) {
    repeated.push(...unique);
  }

  return {
    id: remedialId,
    layout: layoutId,
    title,
    difficulty: 0,
    chords: shuffle(repeated).slice(0, 18),
  };
}

export function decideNext(params: {
  layoutId: LayoutId;
  accuracy: number;
  perChar: Record<string, number>;
  currentSet: ChordSet;
  sets: ChordSet[];
  remedialTitle: string;
}): AdaptiveDecision {
  const { layoutId, accuracy, perChar, currentSet, sets, remedialTitle } = params;

  if (accuracy < downThreshold) {
    const problems = topProblemChars(perChar);
    if (problems.length > 0) {
      return {
        kind: "down",
        set: buildRemedialSet(layoutId, problems, remedialTitle),
      };
    }
  }

  if (accuracy >= upThreshold) {
    const harder = sets
      .filter((set) => set.difficulty > currentSet.difficulty)
      .sort((left, right) => left.difficulty - right.difficulty)[0];
    if (harder) {
      return { kind: "up", set: harder };
    }
  }

  return {
    kind: "repeat",
    set: sets.find((set) => set.id === currentSet.id) ?? currentSet,
  };
}

function topProblemChars(perChar: Record<string, number>): string[] {
  return Object.entries(perChar)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([char]) => char);
}

function shuffle<T>(values: T[]): T[] {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
