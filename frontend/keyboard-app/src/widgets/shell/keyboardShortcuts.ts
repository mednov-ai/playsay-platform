import type { SessionPhase } from "../../features/typing/sessionFlow";

export type EscapeAction =
  | "closeNamePrompt"
  | "closeProfileModal"
  | "closeRegistrationPrompt"
  | "cancelCountdown"
  | "closePausedOverlay"
  | "dismissFinishedOverlay"
  | "none";

interface EscapeState {
  showNamePrompt: boolean;
  showProfileModal: boolean;
  showRegistrationPrompt: boolean;
  sessionPhase: SessionPhase;
  finishOverlayVisible: boolean;
}

export function escapeActionForTrainerState({
  showNamePrompt,
  showProfileModal,
  showRegistrationPrompt,
  sessionPhase,
  finishOverlayVisible,
}: EscapeState): EscapeAction {
  if (showNamePrompt) {
    return "closeNamePrompt";
  }
  if (showProfileModal) {
    return "closeProfileModal";
  }
  if (showRegistrationPrompt) {
    return "closeRegistrationPrompt";
  }
  if (sessionPhase === "countdown") {
    return "cancelCountdown";
  }
  if (sessionPhase === "paused") {
    return "closePausedOverlay";
  }
  if (sessionPhase === "finished" && finishOverlayVisible) {
    return "dismissFinishedOverlay";
  }
  return "none";
}
