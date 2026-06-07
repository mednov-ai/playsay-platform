import { describe, expect, it } from "vitest";
import { formatChordSetTitle, selectResultWeakness, trainingSetHintKind } from "./trainerCopy";
import type { ChordSet } from "../../shared/types";

const labels = {
  letterPairs: "Пары букв",
  letterTriples: "Тройки букв",
  letterQuadgrams: "Четырехграммы",
  longFirst: "Длинные сочетания I",
  longSecond: "Длинные сочетания II",
  homeRow: "домашний ряд",
};

function set(input: Partial<ChordSet>): ChordSet {
  return {
    id: 1,
    layout: "EN",
    title: "EN · Bigrams I (home keys)",
    difficulty: 1,
    tier: "beginner",
    chords: [],
    ...input,
  };
}

describe("trainer copy helpers", () => {
  it("formats corpus set titles without technical ngram labels", () => {
    expect(formatChordSetTitle(set({ id: 1, layout: "EN", difficulty: 1 }), labels)).toBe("EN · Пары букв · домашний ряд");
    expect(formatChordSetTitle(set({ id: 2, layout: "EN", difficulty: 2, title: "EN · Bigrams II" }), labels)).toBe("EN · Пары букв II");
    expect(formatChordSetTitle(set({ id: 7, layout: "RU", difficulty: 3, title: "RU · Триграммы" }), labels)).toBe("RU · Тройки букв");
    expect(formatChordSetTitle(set({ id: 10, layout: "EN", difficulty: 6, title: "EN · Длинные II" }), labels)).toBe(
      "EN · Длинные сочетания II",
    );
  });

  it("chooses pair-specific hints only for pair lessons", () => {
    expect(trainingSetHintKind(set({ difficulty: 1 }))).toBe("pairs");
    expect(trainingSetHintKind(set({ difficulty: 2 }))).toBe("pairs");
    expect(trainingSetHintKind(set({ difficulty: 3 }))).toBe("combinations");
  });

  it("selects top problem chords before fallback keys", () => {
    expect(
      selectResultWeakness({
        perChord: { th: 2, re: 5, om: 5, st: 1, ha: 3 },
        perChar: { e: 4 },
      }),
    ).toEqual({ kind: "chords", values: ["om", "re", "ha", "th"] });
  });

  it("falls back to problem keys and then to clean state", () => {
    expect(selectResultWeakness({ perChord: {}, perChar: { e: 2, r: 4, a: 4 } })).toEqual({
      kind: "chars",
      values: ["a", "r", "e"],
    });
    expect(selectResultWeakness({ perChord: {}, perChar: {} })).toEqual({ kind: "clean", values: [] });
  });
});
