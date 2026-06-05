import { describe, expect, it } from "vitest";
import type { ChordSet } from "../../shared/types";
import { buildStream } from "./typingStore";

describe("typing stream", () => {
  it("repeats short chord sets so the two-line practice window is filled", () => {
    const chordSet: ChordSet = {
      id: 1,
      layout: "EN",
      title: "Short",
      difficulty: 1,
      tier: "beginner",
      chords: ["th", "er"],
    };

    const stream = buildStream("EN", chordSet, 24);

    expect(stream.length).toBeGreaterThanOrEqual(24);
    expect(stream[0]?.char).toBe("t");
    expect(stream.some((item) => item.isSpace)).toBe(true);
  });

  it("uses the measured visible capacity instead of a fixed maximum", () => {
    const chordSet: ChordSet = {
      id: 1,
      layout: "EN",
      title: "Short",
      difficulty: 1,
      tier: "beginner",
      chords: ["th", "er"],
    };

    const stream = buildStream("EN", chordSet, 12);

    expect(stream.length).toBe(17);
  });
});
