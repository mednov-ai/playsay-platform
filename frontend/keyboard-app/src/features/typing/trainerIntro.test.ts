import { describe, expect, it } from "vitest";
import {
  initialTrainerIntroPhase,
  isTrainerChromeVisible,
  isTrainerIntroBlocking,
  trainerIntroReducer,
} from "./trainerIntro";

describe("keyboard trainer intro", () => {
  it("starts with the trainer hidden behind the explanation", () => {
    const phase = initialTrainerIntroPhase();

    expect(phase).toBe("visible");
    expect(isTrainerIntroBlocking(phase)).toBe(true);
    expect(isTrainerChromeVisible(phase)).toBe(false);
  });

  it("reveals the trainer chrome while the game-style opening animation runs", () => {
    const phase = trainerIntroReducer(initialTrainerIntroPhase(), { type: "startReveal" });

    expect(phase).toBe("revealing");
    expect(isTrainerIntroBlocking(phase)).toBe(true);
    expect(isTrainerChromeVisible(phase)).toBe(true);
  });

  it("dismisses the intro after the reveal completes", () => {
    const revealing = trainerIntroReducer(initialTrainerIntroPhase(), { type: "startReveal" });
    const dismissed = trainerIntroReducer(revealing, { type: "completeReveal" });

    expect(dismissed).toBe("dismissed");
    expect(isTrainerIntroBlocking(dismissed)).toBe(false);
    expect(isTrainerChromeVisible(dismissed)).toBe(true);
  });

  it("does not show the intro again after normal trainer resets", () => {
    const dismissed = trainerIntroReducer(
      trainerIntroReducer(initialTrainerIntroPhase(), { type: "startReveal" }),
      { type: "completeReveal" },
    );

    expect(trainerIntroReducer(dismissed, { type: "resetTrainer" })).toBe("dismissed");
    expect(trainerIntroReducer(dismissed, { type: "startReveal" })).toBe("dismissed");
  });
});
