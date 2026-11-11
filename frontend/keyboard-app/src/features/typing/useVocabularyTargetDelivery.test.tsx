// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueVocabularyTarget, readVocabularyTargetJournal } from "./vocabularyResultJournal";
import { useTypingStore } from "./typingStore";
import { useVocabularyTargetDelivery } from "./useVocabularyTargetDelivery";

const api = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("../../shared/api/keyboardApi", () => ({ recordVocabularyTarget: api.record }));
const first = { targetId: "target-1", position: 0, errors: 1, durationMs: 400 };

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

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
  api.record.mockReset();
});
afterEach(() => {
  cleanup();
  useTypingStore.getState().discardPendingVocabularyTarget("session-1", "target-1");
  window.localStorage.clear();
});

describe("vocabulary target delivery", () => {
  it("keeps an offline result and retries it without touching another session", async () => {
    queueVocabularyTarget("session-1", first);
    queueVocabularyTarget("session-2", { ...first, targetId: "target-other" });
    api.record.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ targetId: "target-1" });
    const { result } = renderHook(() => useVocabularyTargetDelivery("session-1", true, 0));
    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(readVocabularyTargetJournal("session-1")).toEqual([first]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.hasPending).toBe(false));
    expect(api.record).toHaveBeenCalledTimes(2);
    expect(readVocabularyTargetJournal("session-2")).toHaveLength(1);
  });

  it("does not discard a target when the receipt does not match", async () => {
    queueVocabularyTarget("session-1", first);
    api.record.mockResolvedValue({ targetId: "different" });
    const { result } = renderHook(() => useVocabularyTargetDelivery("session-1", true, 0));
    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(readVocabularyTargetJournal("session-1")).toEqual([first]);
  });

  it("reports unsaved when neither browser storage nor delivery is available", async () => {
    useTypingStore.setState({ pendingVocabularyTargets: [{ ...first, sessionId: "session-1", persisted: false }] });
    api.record.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useVocabularyTargetDelivery("session-1", true, 1));
    await waitFor(() => expect(result.current.status).toBe("unsaved"));
    expect(result.current.hasPending).toBe(true);
  });
});
