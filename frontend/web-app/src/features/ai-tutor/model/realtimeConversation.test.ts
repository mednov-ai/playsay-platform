import { describe, expect, it } from "vitest";
import { isTurnEvaluation, type RealtimeTurnEvaluation } from "./realtimeConversation";

const accepted: RealtimeTurnEvaluation = {
  verdict: "ACCEPTED",
  goalResult: "MET",
  original: "I'd like a tea, please.",
  improved: "",
  explanation: "",
  category: "CLARITY",
  encouragement: "Clear and polite.",
};

describe("Realtime turn evaluation", () => {
  it("accepts a semantically correct answer without forcing an alternative phrase", () => {
    expect(isTurnEvaluation(accepted)).toBe(true);
  });

  it("requires an improved phrase and explanation for IMPROVE", () => {
    expect(isTurnEvaluation({ ...accepted, verdict: "IMPROVE" })).toBe(false);
    expect(isTurnEvaluation({ ...accepted, verdict: "IMPROVE", improved: "I'd like some tea, please.", explanation: "Use some with an uncountable drink." })).toBe(true);
  });

  it("rejects pronunciation as an evaluation category", () => {
    expect(isTurnEvaluation({ ...accepted, category: "PRONUNCIATION" as RealtimeTurnEvaluation["category"] })).toBe(false);
  });
});
