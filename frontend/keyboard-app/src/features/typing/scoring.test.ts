import { describe, expect, it } from "vitest";
import { computeCadence, computeScore, gradeForScore, scoreGradeBands, scoreWeights } from "./scoring";

describe("typing scoring", () => {
  it("scores steady rhythm higher than uneven rhythm", () => {
    expect(computeCadence([100, 102, 98, 101])).toBeGreaterThan(computeCadence([50, 300, 40, 280]));
  });

  it("blends speed, accuracy, and cadence into a grade", () => {
    const score = computeScore(300, 0.96, 0.9);

    expect(score.grade).toBe("S");
    expect(score.total).toBeGreaterThanOrEqual(90);
    expect(score.speedScore).toBe(1);
  });

  it("exposes stable score weights for the result explanation UI", () => {
    expect(scoreWeights).toEqual({
      accuracy: 0.45,
      speed: 0.3,
      cadence: 0.25,
    });
  });

  it("maps score totals to visible grade bands", () => {
    expect(scoreGradeBands).toEqual([
      { grade: "S", min: 90, label: "90-100" },
      { grade: "A", min: 80, label: "80-89" },
      { grade: "B", min: 70, label: "70-79" },
      { grade: "C", min: 55, label: "55-69" },
      { grade: "D", min: 0, label: "0-54" },
    ]);

    expect(gradeForScore(83)).toBe("A");
  });
});
