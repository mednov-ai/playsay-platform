import { describe, expect, it } from "vitest";
import { matchingRightOptionsForMode } from "./matchingPairs";
import type { MaterialMatchingPair } from "./types";

const pairs: MaterialMatchingPair[] = [
  { id: "pair-a", left: "cat", right: "cat picture", targetKind: "TEXT" },
  { id: "pair-b", left: "dog", right: "dog picture", targetKind: "TEXT" },
  { id: "pair-c", left: "owl", right: "owl picture", targetKind: "TEXT" },
];

describe("matching pairs render order", () => {
  it("keeps author order for teacher preview", () => {
    expect(matchingRightOptionsForMode(pairs, "teacherPreview").map((pair) => pair.id)).toEqual([
      "pair-a",
      "pair-b",
      "pair-c",
    ]);
  });

  it("deranges the right column in classroom mode", () => {
    const options = matchingRightOptionsForMode(pairs, "classroom");

    expect(options).toHaveLength(pairs.length);
    expect(options.map((pair) => pair.id).sort()).toEqual(pairs.map((pair) => pair.id).sort());
    expect(options.every((pair, index) => pair.id !== pairs[index].id)).toBe(true);
  });

  it("swaps two matching pairs instead of leaving them solved", () => {
    const twoPairs = pairs.slice(0, 2);

    expect(matchingRightOptionsForMode(twoPairs, "classroom").map((pair) => pair.id)).toEqual([
      "pair-b",
      "pair-a",
    ]);
  });

  it("keeps the classroom order stable for the same pairs", () => {
    const firstOrder = matchingRightOptionsForMode(pairs, "classroom").map((pair) => pair.id);
    const secondOrder = matchingRightOptionsForMode(pairs, "classroom").map((pair) => pair.id);

    expect(secondOrder).toEqual(firstOrder);
  });
});
