import { describe, expect, it } from "vitest";
import type { ChordSet } from "../../shared/types";
import { buildStream, minimumPracticeStreamLength } from "./typingStore";

describe("typing stream", () => {
  it("repeats short chord sets so the two-line practice window is filled", () => {
    const chordSet: ChordSet = {
      id: 1,
      layout: "EN",
      title: "Short",
      difficulty: 1,
      chords: ["th", "er"],
    };

    const stream = buildStream("EN", chordSet);

    expect(stream.length).toBeGreaterThanOrEqual(minimumPracticeStreamLength);
    expect(stream[0]?.char).toBe("t");
    expect(stream.some((item) => item.isSpace)).toBe(true);
  });
});
