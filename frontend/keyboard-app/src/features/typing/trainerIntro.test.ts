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

  it("can start dismissed when this owner has already opened the trainer", () => {
    const phase = initialTrainerIntroPhase(true);

    expect(phase).toBe("dismissed");
    expect(isTrainerIntroBlocking(phase)).toBe(false);
    expect(isTrainerChromeVisible(phase)).toBe(true);
  });

  it("dismisses the intro without showing a visible preparation overlay", () => {
    const phase = trainerIntroReducer(initialTrainerIntroPhase(), { type: "startReveal" });

    expect(phase).toBe("dismissed");
    expect(isTrainerIntroBlocking(phase)).toBe(false);
    expect(isTrainerChromeVisible(phase)).toBe(true);
  });

  it("keeps legacy completeReveal as a no-op after the direct dismiss path", () => {
    const dismissed = trainerIntroReducer(initialTrainerIntroPhase(), { type: "startReveal" });

    expect(trainerIntroReducer(dismissed, { type: "completeReveal" })).toBe("dismissed");
  });

  it("does not show the intro again after normal trainer resets", () => {
    const dismissed = trainerIntroReducer(initialTrainerIntroPhase(), { type: "startReveal" });

    expect(trainerIntroReducer(dismissed, { type: "resetTrainer" })).toBe("dismissed");
    expect(trainerIntroReducer(dismissed, { type: "startReveal" })).toBe("dismissed");
  });
});
