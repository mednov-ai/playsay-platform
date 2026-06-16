import { describe, expect, it } from "vitest";
import {
  buildCombinedCodeChordSet,
  codeLanguageOptions,
  getLocalChordSets,
  levelTierForDifficulty,
  localChordSets,
  orderChordSetChords,
} from "./index";

describe("local keyboard chord sets", () => {
  it("mirrors the Liquibase seed ids for anonymous training", () => {
    expect(localChordSets.map((set) => set.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      13, 14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29, 30,
      31, 32, 33, 34, 35, 36, 37, 38, 39,
      40, 41, 42,
    ]);
  });

  it("returns layout-specific sets in difficulty order", () => {
    expect(getLocalChordSets("EN").map((set) => set.id)).toEqual([
      1, 2, 3, 4, 9, 10,
      13, 14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29, 30,
      31, 32, 33, 34, 35, 36, 37, 38, 39,
      40, 41, 42,
    ]);
    expect(getLocalChordSets("RU").map((set) => set.id)).toEqual([5, 6, 7, 8, 11, 12]);
  });

  it("adds programming language ngram lessons that start from trigrams", () => {
    const codeSets = getLocalChordSets("EN").filter((set) => set.title.startsWith("CODE · "));

    expect(codeLanguageOptions.map((language) => language.label)).toEqual([
      "Python",
      "JavaScript",
      "TypeScript",
      "Java",
      "Kotlin",
      "C#",
      "C++",
      "Swift",
      "Go",
    ]);
    expect(codeSets.map((set) => set.title)).toEqual([
      "CODE · Python · Trigrams",
      "CODE · JavaScript · Trigrams",
      "CODE · TypeScript · Trigrams",
      "CODE · Java · Trigrams",
      "CODE · Kotlin · Trigrams",
      "CODE · C# · Trigrams",
      "CODE · C++ · Trigrams",
      "CODE · Swift · Trigrams",
      "CODE · Go · Trigrams",
      "CODE · Python · Quadgrams",
      "CODE · JavaScript · Quadgrams",
      "CODE · TypeScript · Quadgrams",
      "CODE · Java · Quadgrams",
      "CODE · Kotlin · Quadgrams",
      "CODE · C# · Quadgrams",
      "CODE · C++ · Quadgrams",
      "CODE · Swift · Quadgrams",
      "CODE · Go · Quadgrams",
      "CODE · Python · Long",
      "CODE · JavaScript · Long",
      "CODE · TypeScript · Long",
      "CODE · Java · Long",
      "CODE · Kotlin · Long",
      "CODE · C# · Long",
      "CODE · C++ · Long",
      "CODE · Swift · Long",
      "CODE · Go · Long",
      "CODE · Mixed · Trigrams",
      "CODE · Mixed · Quadgrams",
      "CODE · Mixed · Long",
    ]);
    expect(codeSets.every((set) => set.chords.length >= 48)).toBe(true);
    expect(codeSets.every((set) => set.chords.every((chord) => chord.length >= 3 && chord.length <= 8))).toBe(true);
    expect(codeSets.some((set) => set.chords.some((chord) => /[{}()[\]#:?+*=><]/.test(chord)))).toBe(true);
  });

  it("builds deterministic combined programming sets from selected languages", () => {
    const first = buildCombinedCodeChordSet(["typescript", "kotlin"], "trigrams");
    const second = buildCombinedCodeChordSet(["kotlin", "typescript"], "trigrams");
    const typescriptOnly = buildCombinedCodeChordSet(["typescript"], "trigrams");

    expect(first).toMatchObject({
      id: -2,
      sourceChordSetId: 40,
      layout: "EN",
      title: "CODE · TypeScript + Kotlin · Trigrams",
      practiceKind: "CODE_COMBO",
      codeLanguages: ["typescript", "kotlin"],
    });
    expect(first.chords).toEqual(second.chords);
    expect(first.chords).not.toEqual(typescriptOnly.chords);
    expect(first.chords.some((chord) => /[{}()[\]#:?+*=><]/.test(chord))).toBe(true);
  });

  it("keeps number-row digits out of code practice until the number row is enabled", () => {
    const defaultSet = buildCombinedCodeChordSet(["javascript", "java", "go"], "trigrams");
    const numberRowSet = buildCombinedCodeChordSet(["javascript", "java", "go"], "trigrams", {
      includeNumberRow: true,
    });

    expect(defaultSet.chords.every((chord) => !/[0-9]/.test(chord))).toBe(true);
    expect(numberRowSet.chords.some((chord) => /[0-9]/.test(chord))).toBe(true);
    expect(numberRowSet.practiceContext).toMatchObject({ numberRowEnabled: true });
  });

  it("maps existing numeric difficulty into four visible level tiers", () => {
    expect(levelTierForDifficulty(1)).toBe("beginner");
    expect(levelTierForDifficulty(2)).toBe("beginner");
    expect(levelTierForDifficulty(3)).toBe("confident");
    expect(levelTierForDifficulty(4)).toBe("middle");
    expect(levelTierForDifficulty(5)).toBe("middle");
    expect(levelTierForDifficulty(6)).toBe("professional");
  });

  it("adds tier metadata to every local set for visible labels", () => {
    expect(new Set(localChordSets.map((set) => set.tier))).toEqual(
      new Set(["beginner", "confident", "middle", "professional"]),
    );
  });

  it("orders chords deterministically from profile seed and session number", () => {
    const set = getLocalChordSets("EN")[0];

    expect(orderChordSetChords(set, "device-a", 2)).toEqual(orderChordSetChords(set, "device-a", 2));
    expect(orderChordSetChords(set, "device-a", 2)).not.toEqual(orderChordSetChords(set, "device-b", 2));
    expect(orderChordSetChords(set, "device-a", 2)).not.toEqual(orderChordSetChords(set, "device-a", 3));
  });

  it("uses restart variants to regenerate a deterministic new order for the same lesson", () => {
    const set = getLocalChordSets("EN").find((chordSet) => chordSet.difficulty === 6)!;

    expect(orderChordSetChords(set, "device-a", 2, 0)).toEqual(orderChordSetChords(set, "device-a", 2, 0));
    expect(orderChordSetChords(set, "device-a", 2, 0)).not.toEqual(orderChordSetChords(set, "device-a", 2, 1));
  });

  it("loads corpus-sized pools for every visible set", () => {
    localChordSets.forEach((set) => {
      expect(set.chords.length).toBeGreaterThanOrEqual(48);
      expect(new Set(set.chords).size).toBe(set.chords.length);
    });
  });

  it("does not pin the same prototype head on advanced lessons", () => {
    const longSet = getLocalChordSets("EN").find((set) => set.difficulty === 5)!;
    const firstOrder = orderChordSetChords(longSet, "device-a", 2, 0).slice(0, 5);
    const secondOrder = orderChordSetChords(longSet, "device-a", 3, 0).slice(0, 5);

    expect(firstOrder).not.toEqual(["atio", "tion", "ther", "ment", "ould"]);
    expect(firstOrder).not.toEqual(secondOrder);
  });
});
