import { describe, expect, it } from "vitest";
import { getLocalChordSets, localChordSets } from "./index";

describe("local keyboard chord sets", () => {
  it("mirrors the Liquibase seed ids for anonymous training", () => {
    expect(localChordSets.map((set) => set.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("returns layout-specific sets in difficulty order", () => {
    expect(getLocalChordSets("EN").map((set) => set.id)).toEqual([1, 2, 3, 4, 9, 10]);
    expect(getLocalChordSets("RU").map((set) => set.id)).toEqual([5, 6, 7, 8, 11, 12]);
  });

  it("keeps chord order stable for saved result ids", () => {
    expect(getLocalChordSets("EN")[0].chords.slice(0, 5)).toEqual(["th", "er", "re", "nd", "st"]);
    expect(getLocalChordSets("RU")[0].chords.slice(0, 5)).toEqual(["ст", "ен", "ни", "ра", "ко"]);
  });
});
