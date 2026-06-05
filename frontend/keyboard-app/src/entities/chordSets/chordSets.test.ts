import { describe, expect, it } from "vitest";
import {
  getLocalChordSets,
  levelTierForDifficulty,
  localChordSets,
  orderChordSetChords,
} from "./index";

describe("local keyboard chord sets", () => {
  it("mirrors the Liquibase seed ids for anonymous training", () => {
    expect(localChordSets.map((set) => set.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("returns layout-specific sets in difficulty order", () => {
    expect(getLocalChordSets("EN").map((set) => set.id)).toEqual([1, 2, 3, 4, 9, 10]);
    expect(getLocalChordSets("RU").map((set) => set.id)).toEqual([5, 6, 7, 8, 11, 12]);
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
