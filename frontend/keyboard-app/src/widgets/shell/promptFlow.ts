import type { SessionPhase } from "../../features/typing/sessionFlow";

export function shouldBlockDeferredPrompts({
  sessionPhase,
  hasNamePrompt,
  hasRegistrationPrompt,
  hasCelebration,
  profileOpen,
}: {
  sessionPhase: SessionPhase;
  hasNamePrompt: boolean;
  hasRegistrationPrompt: boolean;
  hasCelebration: boolean;
  profileOpen: boolean;
}): boolean {
  return (
    sessionPhase === "countdown" ||
    sessionPhase === "running" ||
    sessionPhase === "paused" ||
    hasNamePrompt ||
    hasRegistrationPrompt ||
    hasCelebration ||
    profileOpen
  );
}

export function shouldShowDeferredPrompt({
  sessionPhase,
  finishOverlayVisible,
  hasBlockingOverlay,
}: {
  sessionPhase: SessionPhase;
  finishOverlayVisible: boolean;
  hasBlockingOverlay: boolean;
}): boolean {
  return !hasBlockingOverlay && (sessionPhase === "idle" || (sessionPhase === "finished" && !finishOverlayVisible));
}
