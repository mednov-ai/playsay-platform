import { describe, expect, it } from "vitest";
import { chooseResultAdvice } from "./resultAdvice";

describe("keyboard result advice", () => {
  it("prioritizes the worst repeated chord over generic accuracy advice", () => {
    expect(
      chooseResultAdvice({
        accuracy: 0.88,
        speedCpm: 210,
        cadence: 0.8,
        errors: 6,
        perChar: { t: 2 },
        perChord: { tion: 4, ent: 2 },
      }),
    ).toEqual({ kind: "problemChord", value: "tion" });
  });

  it("points to accuracy when the user has errors but no repeated chord", () => {
    expect(
      chooseResultAdvice({
        accuracy: 0.91,
        speedCpm: 220,
        cadence: 0.82,
        errors: 3,
        perChar: { e: 1, r: 1 },
        perChord: {},
      }),
    ).toEqual({ kind: "accuracy" });
  });

  it("points to rhythm before speed when cadence is unstable", () => {
    expect(
      chooseResultAdvice({
        accuracy: 0.99,
        speedCpm: 120,
        cadence: 0.52,
        errors: 0,
        perChar: {},
        perChord: {},
      }),
    ).toEqual({ kind: "cadence" });
  });

  it("celebrates level-up sessions when the next decision goes up", () => {
    expect(
      chooseResultAdvice({
        accuracy: 1,
        speedCpm: 280,
        cadence: 0.9,
        errors: 0,
        perChar: {},
        perChord: {},
        nextKind: "up",
      }),
    ).toEqual({ kind: "levelUp" });
  });
});
