// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLiveVocabularyPractice } from "./useLiveVocabularyPractice";
const fetchActive = vi.fn();
const openSocket = vi.fn();
vi.mock("../../../shared/api/playsay", () => ({
  fetchActiveVocabularyPractice: (...args: unknown[]) => fetchActive(...args),
  openVocabularySocket: () => openSocket(),
}));
beforeEach(() => { fetchActive.mockReset(); openSocket.mockReset(); openSocket.mockResolvedValue(null); });
afterEach(cleanup);
it("ignores a response from the previous lesson", async () => {
  let resolveOld!: (value: unknown) => void;
  fetchActive.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValue({ id: "new", sessions: [], updatedAt: "2026-09-19T01:00:00Z" });
  const { result, rerender } = renderHook(({ lessonId }) => useLiveVocabularyPractice({ lessonId }), { initialProps: { lessonId: "old" } });
  rerender({ lessonId: "new" });
  await waitFor(() => expect(result.current.practice?.id).toBe("new"));
  await act(async () => { resolveOld({ id: "old", sessions: [], updatedAt: "2026-09-19T00:00:00Z" }); });
  expect(result.current.practice?.id).toBe("new");
});
it("exposes refresh errors and supports recovery without rejecting", async () => {
  fetchActive.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(null);
  const { result } = renderHook(() => useLiveVocabularyPractice({ lessonId: "lesson" }));
  await waitFor(() => expect(result.current.error).toBe(true));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.error).toBe(false);
});

it("ignores an older failed refresh after a newer successful refresh", async () => {
  let rejectOld!: (reason: Error) => void;
  fetchActive.mockResolvedValueOnce(null)
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }))
    .mockResolvedValue(null);
  openSocket.mockResolvedValue({ readyState: 0, close: vi.fn() });
  const { result } = renderHook(() => useLiveVocabularyPractice({ lessonId: "lesson" }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  let stale!: Promise<unknown>;
  await act(async () => { stale = result.current.refresh(); await result.current.refresh(); });
  await act(async () => { rejectOld(new Error("stale failure")); await stale; });
  expect(result.current.error).toBe(false);
});
