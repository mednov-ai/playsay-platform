import type { ChordSet } from "../../shared/types";

export interface ChordSetTitleLabels {
  letterPairs: string;
  letterTriples: string;
  letterQuadgrams: string;
  longFirst: string;
  longSecond: string;
  homeRow: string;
  codeTrigrams: string;
  codeQuadgrams: string;
  codeLong: string;
}

export type TrainingSetHintKind = "pairs" | "combinations";

export type ResultWeakness =
  | { kind: "chords"; values: string[] }
  | { kind: "chars"; values: string[] }
  | { kind: "clean"; values: [] };

export function formatChordSetTitle(set: Pick<ChordSet, "id" | "layout" | "title" | "difficulty">, labels: ChordSetTitleLabels): string {
  const layout = set.layout;

  if (set.title.startsWith("CODE · ")) {
    const [, language = "", band = ""] = set.title.split(" · ");
    const bandLabel =
      band === "Trigrams"
        ? labels.codeTrigrams
        : band === "Quadgrams"
          ? labels.codeQuadgrams
          : labels.codeLong;
    return `Code · ${language} · ${bandLabel}`;
  }

  if (set.id === 1 || set.id === 5) {
    return `${layout} · ${labels.letterPairs} · ${labels.homeRow}`;
  }
  if (set.id === 2 || set.id === 6 || set.difficulty === 2) {
    return `${layout} · ${labels.letterPairs} II`;
  }
  if (set.id === 3 || set.id === 7 || set.difficulty === 3) {
    return `${layout} · ${labels.letterTriples}`;
  }
  if (set.id === 4 || set.id === 8 || set.difficulty === 4) {
    return `${layout} · ${labels.letterQuadgrams}`;
  }
  if (set.id === 9 || set.id === 11 || set.difficulty === 5) {
    return `${layout} · ${labels.longFirst}`;
  }
  if (set.id === 10 || set.id === 12 || set.difficulty >= 6) {
    return `${layout} · ${labels.longSecond}`;
  }

  return set.title;
}

export function trainingSetHintKind(set: Pick<ChordSet, "difficulty">): TrainingSetHintKind {
  return set.difficulty <= 2 ? "pairs" : "combinations";
}

export function selectResultWeakness(input: {
  perChord?: Record<string, number>;
  perChar?: Record<string, number>;
  limit?: number;
}): ResultWeakness {
  const limit = input.limit ?? 4;
  const chords = topProblems(input.perChord ?? {}, limit);
  if (chords.length > 0) {
    return { kind: "chords", values: chords };
  }

  const chars = topProblems(input.perChar ?? {}, limit);
  if (chars.length > 0) {
    return { kind: "chars", values: chars };
  }

  return { kind: "clean", values: [] };
}

function topProblems(values: Record<string, number>, limit: number): string[] {
  return Object.entries(values)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value);
}
