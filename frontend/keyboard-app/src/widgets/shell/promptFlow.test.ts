import { describe, expect, it } from "vitest";
import { shouldBlockDeferredPrompts, shouldShowDeferredPrompt } from "./promptFlow";

describe("keyboard trainer prompt flow", () => {
  it("blocks deferred prompts during pause and lets space resume win", () => {
    expect(shouldBlockDeferredPrompts({
      sessionPhase: "paused",
      hasNamePrompt: true,
      hasRegistrationPrompt: true,
      hasCelebration: true,
      profileOpen: false,
    })).toBe(true);
  });

  it("allows deferred prompts only after active overlays are gone", () => {
    expect(shouldShowDeferredPrompt({
      sessionPhase: "finished",
      finishOverlayVisible: false,
      hasBlockingOverlay: false,
    })).toBe(true);
    expect(shouldShowDeferredPrompt({
      sessionPhase: "finished",
      finishOverlayVisible: true,
      hasBlockingOverlay: false,
    })).toBe(false);
  });
});
