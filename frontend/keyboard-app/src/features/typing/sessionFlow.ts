export type SessionPhase = "idle" | "countdown" | "running" | "paused" | "finished";

export interface SessionFlowState {
  phase: SessionPhase;
  countdownValue: number | null;
  acceptsTyping: boolean;
}

export type SessionFlowEvent =
  | { type: "start" }
  | { type: "countdownTick" }
  | { type: "cancel" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "finish" }
  | { type: "reset" };

export function initialSessionFlow(): SessionFlowState {
  return {
    phase: "idle",
    countdownValue: null,
    acceptsTyping: false,
  };
}

export function sessionFlowReducer(state: SessionFlowState, event: SessionFlowEvent): SessionFlowState {
  switch (event.type) {
    case "start":
      return {
        phase: "countdown",
        countdownValue: 3,
        acceptsTyping: false,
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
        };
      }
      return {
        phase: "countdown",
        countdownValue: state.countdownValue - 1,
        acceptsTyping: false,
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
      };
    case "resume":
      if (state.phase !== "paused") {
        return state;
      }
      return {
        phase: "running",
        countdownValue: null,
        acceptsTyping: true,
      };
    case "finish":
      if (state.phase !== "running") {
        return state;
      }
      return {
        phase: "finished",
        countdownValue: null,
        acceptsTyping: false,
      };
    case "reset":
      return initialSessionFlow();
    default:
      return state;
  }
}
