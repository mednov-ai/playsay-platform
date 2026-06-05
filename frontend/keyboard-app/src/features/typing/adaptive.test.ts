import { describe, expect, it } from "vitest";
import type { ChordSet } from "../../shared/types";
import { decideNext, remedialId } from "./adaptive";

const sets: ChordSet[] = [
  { id: 1, layout: "EN", title: "Level 1", difficulty: 1, chords: ["th"] },
  { id: 2, layout: "EN", title: "Level 2", difficulty: 2, chords: ["er"] },
  { id: 3, layout: "EN", title: "Level 3", difficulty: 3, chords: ["ing"] },
  { id: 4, layout: "EN", title: "Level 4", difficulty: 4, chords: ["tion"] },
];

const baseParams = {
  layoutId: "EN" as const,
  accuracy: 0.9,
  speedCpm: 0,
  cadence: 1,
  perChar: {},
  currentSet: sets[0],
  sets,
  remedialTitle: "Focus",
};

describe("keyboard adaptive level selection", () => {
  it("promotes one level when speed is fast and cadence is stable", () => {
    const decision = decideNext({
      ...baseParams,
      speedCpm: 200,
      cadence: 0.66,
    });

    expect(decision.kind).toBe("up");
    expect(decision.set.id).toBe(2);
  });

  it("suggests the hardest level when speed is above 250 and cadence is stable", () => {
    const decision = decideNext({
      ...baseParams,
      speedCpm: 251,
      cadence: 0.8,
    });

    expect(decision.kind).toBe("up");
    expect(decision.set.id).toBe(4);
  });

  it("does not speed-promote when cadence is unstable", () => {
    const decision = decideNext({
      ...baseParams,
      speedCpm: 251,
      cadence: 0.65,
    });

    expect(decision.kind).toBe("repeat");
    expect(decision.set.id).toBe(1);
  });

  it("keeps focus remediation ahead of speed promotion when accuracy is low", () => {
    const decision = decideNext({
      ...baseParams,
      accuracy: 0.8,
      speedCpm: 251,
      cadence: 0.8,
      perChar: { t: 3 },
    });

    expect(decision.kind).toBe("down");
    expect(decision.set.id).toBe(remedialId);
  });
});
