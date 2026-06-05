import { describe, expect, it } from "vitest";
import { computeCadence, computeScore } from "./scoring";

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
});
