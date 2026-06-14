import { describe, expect, it } from "vitest";
import { escapeActionForTrainerState } from "./keyboardShortcuts";

describe("keyboard trainer Escape policy", () => {
  it("closes overlays by product priority", () => {
    expect(
      escapeActionForTrainerState({
        showNamePrompt: true,
        showProfileModal: true,
        showRegistrationPrompt: true,
        sessionPhase: "countdown",
        finishOverlayVisible: true,
      }),
    ).toBe("closeNamePrompt");

    expect(
      escapeActionForTrainerState({
        showNamePrompt: false,
        showProfileModal: true,
        showRegistrationPrompt: true,
        sessionPhase: "countdown",
        finishOverlayVisible: true,
      }),
    ).toBe("closeProfileModal");

    expect(
      escapeActionForTrainerState({
        showNamePrompt: false,
        showProfileModal: false,
        showRegistrationPrompt: true,
        sessionPhase: "countdown",
        finishOverlayVisible: true,
      }),
    ).toBe("closeRegistrationPrompt");

    expect(
      escapeActionForTrainerState({
        showNamePrompt: false,
        showProfileModal: false,
        showRegistrationPrompt: false,
        sessionPhase: "countdown",
        finishOverlayVisible: true,
      }),
    ).toBe("cancelCountdown");

    expect(
      escapeActionForTrainerState({
        showNamePrompt: false,
        showProfileModal: false,
        showRegistrationPrompt: false,
        sessionPhase: "paused",
        finishOverlayVisible: false,
      }),
    ).toBe("closePausedOverlay");

    expect(
      escapeActionForTrainerState({
        showNamePrompt: false,
        showProfileModal: false,
        showRegistrationPrompt: false,
        sessionPhase: "finished",
        finishOverlayVisible: true,
      }),
    ).toBe("dismissFinishedOverlay");
  });

  it("returns no app action when Escape has nothing to close", () => {
    expect(
      escapeActionForTrainerState({
        showNamePrompt: false,
        showProfileModal: false,
        showRegistrationPrompt: false,
        sessionPhase: "idle",
        finishOverlayVisible: false,
      }),
    ).toBe("none");
  });
});
