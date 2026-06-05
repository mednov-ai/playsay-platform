import { describe, expect, it } from "vitest";
import { suggestMetronomeBpm } from "./metronomeTempo";

describe("adaptive metronome tempo", () => {
  it("suggests rounded BPM from stable correct-key intervals", () => {
    expect(suggestMetronomeBpm([240, 250, 260, 250], 0.8)).toBe(240);
  });

  it("does not suggest BPM when cadence is not stable enough", () => {
    expect(suggestMetronomeBpm([240, 250, 260, 250], 0.65)).toBeNull();
  });

  it("does not suggest BPM when there are not enough intervals", () => {
    expect(suggestMetronomeBpm([250, 260], 0.8)).toBeNull();
  });

  it("keeps suggested BPM inside the slider range", () => {
    expect(suggestMetronomeBpm([120, 120, 120], 0.9)).toBe(300);
    expect(suggestMetronomeBpm([1_200, 1_200, 1_200], 0.9)).toBe(60);
  });
});
