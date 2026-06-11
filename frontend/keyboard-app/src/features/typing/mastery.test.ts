import { describe, expect, it } from "vitest";
import { computeAverageTempo, computeCadence, estimateSessionMastery, masteryDeltaLabel } from "./mastery";

describe("typing mastery", () => {
  it("computes average tempo from correct characters and active duration", () => {
    expect(computeAverageTempo({ correctCount: 180, durationMs: 60_000 })).toBe(180);
    expect(computeAverageTempo({ correctCount: 90, durationMs: 30_000 })).toBe(180);
  });

  it("keeps steady rhythm higher than uneven rhythm", () => {
    expect(computeCadence([100, 102, 98, 101])).toBeGreaterThan(computeCadence([50, 300, 40, 280]));
  });

  it("pulls mastery toward real tempo when rhythm and accuracy are good", () => {
    const mastery = estimateSessionMastery({
      previousMasteryCpm: 170,
      averageCpm: 220,
      accuracy: 0.98,
      cadence: 0.88,
    });

    expect(mastery.masteryCpm).toBeGreaterThan(185);
    expect(mastery.masteryCpm).toBeLessThanOrEqual(220);
    expect(mastery.masteryDelta).toBeGreaterThan(0);
  });

  it("treats 70 percent rhythm as good enough to keep mastery close to real tempo", () => {
    const mastery = estimateSessionMastery({
      previousMasteryCpm: 180,
      averageCpm: 240,
      accuracy: 0.98,
      cadence: 0.7,
    });

    expect(mastery.masteryCpm).toBeGreaterThan(205);
    expect(mastery.masteryDelta).toBeGreaterThan(20);
  });

  it("penalizes mastery when rhythm is unstable even if raw tempo is high", () => {
    const mastery = estimateSessionMastery({
      previousMasteryCpm: 190,
      averageCpm: 260,
      accuracy: 0.9,
      cadence: 0.42,
    });

    expect(mastery.masteryCpm).toBeLessThan(190);
    expect(mastery.masteryCpm).toBeLessThan(260);
    expect(mastery.masteryDelta).toBeLessThan(0);
  });

  it("formats mastery deltas without score or rank language", () => {
    expect(masteryDeltaLabel(12)).toBe("+12");
    expect(masteryDeltaLabel(-8)).toBe("-8");
    expect(masteryDeltaLabel(0)).toBe("0");
  });
});
