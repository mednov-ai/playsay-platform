import { describe, expect, it } from "vitest";
import { initialSessionFlow, sessionFlowReducer } from "./sessionFlow";

describe("keyboard session flow", () => {
  it("starts with a blocked countdown before typing runs", () => {
    const state = sessionFlowReducer(initialSessionFlow(), { type: "start" });

    expect(state.phase).toBe("countdown");
    expect(state.countdownValue).toBe(3);
    expect(state.acceptsTyping).toBe(false);
  });

  it("enters running only after the 3-2-1 countdown completes", () => {
    let state = sessionFlowReducer(initialSessionFlow(), { type: "start" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    expect(state.countdownValue).toBe(2);
    state = sessionFlowReducer(state, { type: "countdownTick" });
    expect(state.countdownValue).toBe(1);
    state = sessionFlowReducer(state, { type: "countdownTick" });

    expect(state.phase).toBe("running");
    expect(state.countdownValue).toBeNull();
    expect(state.acceptsTyping).toBe(true);
  });

  it("cancels countdown with escape without accepting typing", () => {
    const countdown = sessionFlowReducer(initialSessionFlow(), { type: "start" });
    const cancelled = sessionFlowReducer(countdown, { type: "cancel" });

    expect(cancelled.phase).toBe("idle");
    expect(cancelled.countdownValue).toBeNull();
    expect(cancelled.acceptsTyping).toBe(false);
  });

  it("finishes into a result-first state and waits for the next explicit start", () => {
    let state = sessionFlowReducer(initialSessionFlow(), { type: "start" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "finish" });

    expect(state.phase).toBe("finished");
    expect(state.acceptsTyping).toBe(false);
    expect(state.countdownValue).toBeNull();

    const next = sessionFlowReducer(state, { type: "start" });
    expect(next.phase).toBe("countdown");
    expect(next.countdownValue).toBe(3);
    expect(next.finishOverlayVisible).toBe(false);
  });

  it("shows a blocking play overlay when a running session finishes", () => {
    let state = sessionFlowReducer(initialSessionFlow(), { type: "start" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "countdownTick" });

    const finished = sessionFlowReducer(state, { type: "finish" });

    expect(finished.phase).toBe("finished");
    expect(finished.acceptsTyping).toBe(false);
    expect(finished.finishOverlayVisible).toBe(true);
  });

  it("dismisses only the finished play overlay without resetting the result state", () => {
    let state = sessionFlowReducer(initialSessionFlow(), { type: "start" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "finish" });

    const dismissed = sessionFlowReducer(state, { type: "dismissFinishOverlay" });

    expect(dismissed.phase).toBe("finished");
    expect(dismissed.acceptsTyping).toBe(false);
    expect(dismissed.countdownValue).toBeNull();
    expect(dismissed.finishOverlayVisible).toBe(false);
  });

  it("pauses a running session and resumes without a new countdown", () => {
    let state = sessionFlowReducer(initialSessionFlow(), { type: "start" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "countdownTick" });
    state = sessionFlowReducer(state, { type: "countdownTick" });

    const paused = sessionFlowReducer(state, { type: "pause" });
    expect(paused.phase).toBe("paused");
    expect(paused.acceptsTyping).toBe(false);

    const resumed = sessionFlowReducer(paused, { type: "resume" });
    expect(resumed.phase).toBe("running");
    expect(resumed.countdownValue).toBeNull();
    expect(resumed.acceptsTyping).toBe(true);
  });
});
