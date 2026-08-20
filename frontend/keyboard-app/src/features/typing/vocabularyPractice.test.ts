import { describe, expect, it } from "vitest";
import type { SubmitResult, VocabularySessionPracticeResponse } from "../../shared/types";
import {
  buildVocabularyChordSet,
  clearPendingVocabularyResult,
  readPendingVocabularyResult,
  readVocabularyAcknowledgement,
  writePendingVocabularyResult,
  writeVocabularyAcknowledgement,
} from "./vocabularyPractice";
import { buildStream } from "./typingStore";

const response: VocabularySessionPracticeResponse = {
  sessionId: "11111111-1111-4111-a111-111111111111",
  title: "Unit 4 · Weather",
  entries: [],
  items: [
    { itemId: "21111111-1111-4111-a111-111111111111", entryId: "31111111-1111-4111-a111-111111111111", sourceText: "heavy rain" },
  ],
  mode: "MIXED",
  layout: "EN",
  targets: [
    { targetId: "41111111-1111-4111-a111-111111111111", position: 0, type: "WHOLE_WORD", text: "heavy rain", sourceEntryIds: ["31111111-1111-4111-a111-111111111111"], sourceItemIds: ["21111111-1111-4111-a111-111111111111"], offsets: [] },
    { targetId: "51111111-1111-4111-a111-111111111111", position: 1, type: "CHARACTER_NGRAM", text: "rain", sourceEntryIds: ["31111111-1111-4111-a111-111111111111"], sourceItemIds: ["21111111-1111-4111-a111-111111111111"], offsets: [] },
  ],
  completionContext: { delivery: "HOMEWORK", completionPolicy: "MEANINGFUL_ACTIVITY", completionPolicyVersion: "v1", lastAcknowledgedPosition: 0 },
  returnContext: { target: "HONEY_SCHOOL_HOMEWORK", path: "/" },
};

describe("typed vocabulary practice", () => {
  it("keeps words, phrases and n-grams as ordered atomic targets without generic repetition", () => {
    const set = buildVocabularyChordSet(response, "Vocabulary", memoryStorage());
    expect(set.chords).toEqual(["heavy rain", "rain"]);
    expect(set.vocabularyContext).toMatchObject({ mode: "MIXED", typedTargets: true, totalTargets: 2 });
    expect(buildStream("EN", set, 500).filter((item) => item.isChordStart).map((item) => item.chord)).toEqual(["heavy rain", "rain"]);
  });

  it("preserves the server-selected mode for every supported Key vocabulary mode", () => {
    for (const mode of ["WHOLE_WORDS", "CHARACTER_NGRAMS", "MIXED"] as const) {
      expect(buildVocabularyChordSet({ ...response, mode }, "Vocabulary", memoryStorage()).vocabularyContext?.mode).toBe(mode);
    }
  });

  it("resumes from the furthest monotonic local or server acknowledgement", () => {
    const storage = memoryStorage();
    writeVocabularyAcknowledgement(response.sessionId, 1, storage);
    writeVocabularyAcknowledgement(response.sessionId, 0, storage);
    expect(readVocabularyAcknowledgement(response.sessionId, storage)).toBe(1);
    expect(buildVocabularyChordSet(response, "Vocabulary", storage).chords).toEqual(["rain"]);
    expect(buildVocabularyChordSet({ ...response, completionContext: { ...response.completionContext!, lastAcknowledgedPosition: 2 } }, "Vocabulary", storage).chords).toEqual([]);
  });

  it("persists one idempotent callback while offline and clears only the matching result", () => {
    const storage = memoryStorage();
    const pending = { clientResultId: "result-1", chordSetId: 1, speedCpm: 1, averageCpm: 1, cadence: 1, accuracy: 1, errors: 0, characterCount: 4, correctCount: 4, durationMs: 1000, perFinger: {}, practiceContext: { practiceKind: "VOCABULARY", title: "Homework", vocabularySessionId: response.sessionId }, vocabularyResults: [{ resultId: response.targets![0].targetId, targetId: response.targets![0].targetId, targetType: "WHOLE_WORD", errors: 0, durationMs: 1000, position: 0, sourceEntryIds: [], sourceItemIds: [] }] } satisfies SubmitResult;
    writePendingVocabularyResult(pending, storage);
    expect(readPendingVocabularyResult(storage)?.clientResultId).toBe("result-1");
    clearPendingVocabularyResult("different", storage);
    expect(readPendingVocabularyResult(storage)?.clientResultId).toBe("result-1");
    clearPendingVocabularyResult("result-1", storage);
    expect(readPendingVocabularyResult(storage)).toBeNull();
  });
});

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}
