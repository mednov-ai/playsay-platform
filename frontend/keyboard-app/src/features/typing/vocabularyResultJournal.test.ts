import { describe, expect, it, vi } from "vitest";
import { flushVocabularyTargetJournal, queueVocabularyTarget, readVocabularyTargetJournal } from "./vocabularyResultJournal";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
  };
}

const first = { targetId: "target-1", position: 0, errors: 1, durationMs: 400 };
const second = { targetId: "target-2", position: 1, errors: 0, durationMs: 500 };

describe("vocabulary target journal", () => {
  it("keeps independent sessions and preserves the first result for a target", () => {
    const storage = memoryStorage();
    expect(queueVocabularyTarget("session-1", first, storage)).toBe(true);
    queueVocabularyTarget("session-1", { ...first, errors: 0 }, storage);
    queueVocabularyTarget("session-2", second, storage);
    expect(readVocabularyTargetJournal("session-1", storage)).toEqual([first]);
    expect(readVocabularyTargetJournal("session-2", storage)).toEqual([second]);
  });

  it("retains unsent results through an offline failure and removes only confirmed receipts", async () => {
    const storage = memoryStorage();
    queueVocabularyTarget("session-1", first, storage);
    queueVocabularyTarget("session-1", second, storage);
    const send = vi.fn().mockResolvedValueOnce({ targetId: first.targetId }).mockRejectedValueOnce(new Error("offline"));
    await expect(flushVocabularyTargetJournal("session-1", send, storage)).rejects.toThrow("offline");
    expect(readVocabularyTargetJournal("session-1", storage)).toEqual([second]);
    await flushVocabularyTargetJournal("session-1", async (entry) => ({ targetId: entry.targetId }), storage);
    expect(readVocabularyTargetJournal("session-1", storage)).toEqual([]);
  });

  it("does not discard a result for a mismatched receipt or unavailable storage", async () => {
    const storage = memoryStorage();
    queueVocabularyTarget("session-1", first, storage);
    await expect(flushVocabularyTargetJournal("session-1", async () => ({ targetId: "other" }), storage)).rejects.toThrow("receipt mismatch");
    expect(readVocabularyTargetJournal("session-1", storage)).toEqual([first]);
    expect(queueVocabularyTarget("session-1", second, null)).toBe(false);
  });
});
