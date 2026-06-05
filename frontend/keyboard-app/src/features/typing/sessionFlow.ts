export type SessionPhase = "idle" | "countdown" | "running" | "paused" | "finished";

export interface SessionFlowState {
  phase: SessionPhase;
  countdownValue: number | null;
  acceptsTyping: boolean;
  finishOverlayVisible: boolean;
}

export type SessionFlowEvent =
  | { type: "start" }
  | { type: "countdownTick" }
  | { type: "cancel" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "finish" }
  | { type: "dismissFinishOverlay" }
  | { type: "reset" };

export function initialSessionFlow(): SessionFlowState {
  return {
    phase: "idle",
    countdownValue: null,
    acceptsTyping: false,
    finishOverlayVisible: false,
  };
}

export function sessionFlowReducer(state: SessionFlowState, event: SessionFlowEvent): SessionFlowState {
  switch (event.type) {
    case "start":
      return {
        phase: "countdown",
        countdownValue: 3,
        acceptsTyping: false,
        finishOverlayVisible: false,
      };
    case "countdownTick":
      if (state.phase !== "countdown" || state.countdownValue == null) {
        return state;
      }
      if (state.countdownValue <= 1) {
        return {
          phase: "running",
          countdownValue: null,
          acceptsTyping: true,
          finishOverlayVisible: false,
        };
      }
      return {
        phase: "countdown",
        countdownValue: state.countdownValue - 1,
        acceptsTyping: false,
        finishOverlayVisible: false,
      };
    case "cancel":
      if (state.phase !== "countdown") {
        return state;
      }
      return initialSessionFlow();
    case "pause":
      if (state.phase !== "running") {
        return state;
      }
      return {
        phase: "paused",
        countdownValue: null,
        acceptsTyping: false,
        finishOverlayVisible: false,
      };
    case "resume":
      if (state.phase !== "paused") {
        return state;
      }
      return {
        phase: "running",
        countdownValue: null,
        acceptsTyping: true,
        finishOverlayVisible: false,
      };
    case "finish":
      if (state.phase !== "running") {
        return state;
      }
      return {
        phase: "finished",
        countdownValue: null,
        acceptsTyping: false,
        finishOverlayVisible: true,
      };
    case "dismissFinishOverlay":
      if (state.phase !== "finished") {
        return state;
      }
      return {
        ...state,
        finishOverlayVisible: false,
      };
    case "reset":
      return initialSessionFlow();
    default:
      return state;
  }
}
