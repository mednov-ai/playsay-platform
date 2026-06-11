import { describe, expect, it } from "vitest";
import { chooseTechniqueAdvice } from "./techniqueAdvice";

describe("keyboard technique advice", () => {
  it("prioritizes the worst repeated chord over generic accuracy advice", () => {
    expect(
      chooseTechniqueAdvice({
        accuracy: 0.88,
        averageCpm: 210,
        cadence: 0.8,
        errors: 6,
        perChar: { t: 2 },
        perChord: { tion: 4, ent: 2 },
        recent: [],
      }),
    ).toEqual({ kind: "problemChord", value: "tion", tone: "ACCURACY" });
  });

  it("points to rhythm before speed when cadence is unstable", () => {
    expect(
      chooseTechniqueAdvice({
        accuracy: 0.99,
        averageCpm: 120,
        cadence: 0.52,
        errors: 0,
        perChar: {},
        perChord: {},
        recent: [],
      }),
    ).toEqual({ kind: "rhythm", tone: "RHYTHM" });
  });

  it("uses recent history when mastery rises but accuracy trends down", () => {
    expect(
      chooseTechniqueAdvice({
        accuracy: 0.94,
        averageCpm: 230,
        cadence: 0.82,
        errors: 3,
        perChar: {},
        perChord: {},
        recent: [
          { accuracy: 0.99, masteryCpm: 180 },
          { accuracy: 0.98, masteryCpm: 170 },
        ],
      }),
    ).toEqual({ kind: "accuracyTrend", tone: "ACCURACY" });
  });
});
