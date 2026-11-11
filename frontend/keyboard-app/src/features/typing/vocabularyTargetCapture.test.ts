import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChordSet } from "../../shared/types";
import { useTypingStore } from "./typingStore";
import { readVocabularyTargetJournal } from "./vocabularyResultJournal";

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

const chordSet: ChordSet = {
  id: -900, layout: "EN", title: "Vocabulary", difficulty: 1, tier: "beginner",
  practiceKind: "VOCABULARY", chords: ["ab"],
  vocabularyContext: {
    sessionId: "session-1", mode: "WHOLE_WORDS", typedTargets: true, durableResultsSupported: true,
    startPosition: 0, totalTargets: 1, delivery: "SELF", completionPolicy: "COMPLETE_SESSION",
    targets: [{ targetId: "target-1", position: 0, type: "WHOLE_WORD", text: "ab", sourceEntryIds: ["entry-1"], sourceItemIds: ["item-1"], offsets: [] }],
  },
};

afterEach(() => {
  useTypingStore.getState().discardPendingVocabularyTarget("session-1", "target-1");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("vocabulary target capture", () => {
  it("journals a completed target synchronously with its actual errors and active duration", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    vi.useFakeTimers();
    useTypingStore.getState().loadSet("EN", chordSet);
    vi.setSystemTime(1_000); useTypingStore.getState().handleKey("KeyX");
    vi.setSystemTime(1_100); useTypingStore.getState().handleKey("KeyA");
    vi.setSystemTime(1_400); useTypingStore.getState().handleKey("KeyB");
    expect(readVocabularyTargetJournal("session-1", storage)).toEqual([{ targetId: "target-1", position: 0, errors: 1, durationMs: 400 }]);
    expect(useTypingStore.getState().pendingVocabularyTargets[0]).toMatchObject({ sessionId: "session-1", persisted: true });
  });

  it("keeps a target in memory when browser storage is unavailable", () => {
    const storage = memoryStorage();
    storage.setItem = () => { throw new Error("storage unavailable"); };
    vi.stubGlobal("window", { localStorage: storage });
    useTypingStore.getState().loadSet("EN", chordSet);
    useTypingStore.getState().handleKey("KeyA");
    useTypingStore.getState().handleKey("KeyB");
    expect(useTypingStore.getState().pendingVocabularyTargets[0]).toMatchObject({ targetId: "target-1", persisted: false });
  });

  it("does not journal a target against a server without durable target support", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    useTypingStore.getState().loadSet("EN", { ...chordSet, vocabularyContext: { ...chordSet.vocabularyContext!, durableResultsSupported: false } });
    useTypingStore.getState().handleKey("KeyA");
    useTypingStore.getState().handleKey("KeyB");
    expect(readVocabularyTargetJournal("session-1", storage)).toEqual([]);
  });
});
