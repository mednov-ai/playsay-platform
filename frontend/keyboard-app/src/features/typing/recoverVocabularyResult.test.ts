import { describe, expect, it, vi } from "vitest";
import type { SubmitResult } from "../../shared/types";
import { recoverVocabularyResult } from "./recoverVocabularyResult";

const pending = {
  clientResultId: "result-1", chordSetId: 1, speedCpm: 1, averageCpm: 1, cadence: 1, accuracy: 1,
  errors: 0, characterCount: 1, correctCount: 1, durationMs: 1, perFinger: {},
  practiceContext: { practiceKind: "VOCABULARY", title: "Practice", vocabularySessionId: "session-1" },
} satisfies SubmitResult;

describe("pending vocabulary result recovery", () => {
  it("checks the current learner can access the session before submitting", async () => {
    const submit = vi.fn();
    const verify = vi.fn().mockRejectedValue(new Error("forbidden"));
    await expect(recoverVocabularyResult(pending, verify, submit, () => true)).rejects.toThrow("forbidden");
    expect(verify).toHaveBeenCalledWith("session-1");
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not submit after the account or component changes during verification", async () => {
    const submit = vi.fn();
    await expect(recoverVocabularyResult(pending, async () => ({}), submit, () => false)).resolves.toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits the same result after authorized verification", async () => {
    const submit = vi.fn().mockResolvedValue({ id: 1 });
    await expect(recoverVocabularyResult(pending, async () => ({}), submit, () => true)).resolves.toEqual({ id: 1 });
    expect(submit).toHaveBeenCalledWith(pending);
  });
});
