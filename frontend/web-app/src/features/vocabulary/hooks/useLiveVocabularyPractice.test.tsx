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

it("ignores a completed command captured before switching lesson context", async () => {
  fetchActive.mockResolvedValue({ id: "new", sessions: [], updatedAt: "2026-09-19T01:00:00Z" });
  const { result, rerender } = renderHook(({ lessonId }) => useLiveVocabularyPractice({ lessonId }), { initialProps: { lessonId: "old" } });
  const oldCommandCompleted = result.current.setPractice;
  rerender({ lessonId: "new" });
  await waitFor(() => expect(result.current.practice?.id).toBe("new"));
  act(() => oldCommandCompleted({ id: "old", sessions: [], updatedAt: "2026-09-19T02:00:00Z" } as never));
  expect(result.current.practice?.id).toBe("new");
});

it("accepts newer learner revisions even when practice metadata is older", async () => {
  const newest = { id: "practice", status: "PAUSED", sessions: [{ id: "session", revision: 3 }], updatedAt: "2026-09-19T02:00:00Z" };
  fetchActive.mockResolvedValue(newest);
  const { result } = renderHook(() => useLiveVocabularyPractice({ lessonId: "lesson" }));
  await waitFor(() => expect(result.current.practice?.sessions[0].revision).toBe(3));
  act(() => result.current.setPractice({ ...newest, status: "ACTIVE", updatedAt: "2026-09-19T01:00:00Z", sessions: [{ id: "session", revision: 4, teacherHint: "hint" }] } as never));
  expect(result.current.practice?.status).toBe("PAUSED");
  expect(result.current.practice?.sessions[0].revision).toBe(4);
  expect(result.current.practice?.sessions[0].teacherHint).toBe("hint");
});
