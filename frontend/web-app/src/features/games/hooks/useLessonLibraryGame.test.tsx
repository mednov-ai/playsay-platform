// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLessonLibraryGame } from "./useLessonLibraryGame";
import { currentLessonGame, startLessonGame, stopLessonGame, type LibraryGame } from "../../../shared/api/games";
vi.mock("../../../shared/api/games", () => ({ currentLessonGame: vi.fn(), startLessonGame: vi.fn(), stopLessonGame: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const launch = { id: "run-1", lessonId: "lesson-1", gameId: "game", revisionId: "revision", status: "ACTIVE", documentId: "doc", createdAt: "", presentationRevision: 1 };
const game = { id: "game", revisionId: "revision" } as LibraryGame;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
it("ignores an old GET after confirmed stop and does not resurrect its iframe", async () => {
  vi.mocked(currentLessonGame).mockResolvedValueOnce({ launch, revision: 1, canControl: true, protocolReady: true });
  const { result } = renderHook(() => useLessonLibraryGame("lesson-1", true));
  await waitFor(() => expect(result.current.launch?.id).toBe(launch.id));
  const old = deferred<Awaited<ReturnType<typeof currentLessonGame>>>();
  vi.mocked(currentLessonGame).mockReturnValueOnce(old.promise).mockResolvedValue({ launch: null, revision: 2, canControl: true, protocolReady: true });
  let oldRefresh!: Promise<void>;
  act(() => { oldRefresh = result.current.refresh(); });
  vi.mocked(stopLessonGame).mockResolvedValue({ ...launch, status: "STOPPED", presentationRevision: 2 });
  await act(async () => result.current.stop(launch.id));
  await act(async () => { old.resolve({ launch, revision: 1, canControl: true, protocolReady: true }); await oldRefresh; });
  expect(result.current.launch).toBeNull();
});
it("keeps the same command when start loses its response and ignores prior lesson responses", async () => {
  vi.mocked(currentLessonGame).mockResolvedValue({ launch: null, revision: 0, canControl: true, protocolReady: true });
  const { result, rerender } = renderHook(({ lesson }) => useLessonLibraryGame(lesson, true), { initialProps: { lesson: "lesson-1" } });
  await waitFor(() => expect(result.current.canControl).toBe(true));
  vi.mocked(startLessonGame).mockRejectedValueOnce(new Error("lost response")).mockResolvedValue(launch);
  await expect(result.current.start(game)).rejects.toThrow("lost response");
  await act(async () => result.current.start(game));
  expect(vi.mocked(startLessonGame).mock.calls[0][2]).toBe(vi.mocked(startLessonGame).mock.calls[1][2]);
  const old = deferred<Awaited<ReturnType<typeof currentLessonGame>>>();
  vi.mocked(currentLessonGame).mockReturnValueOnce(old.promise).mockResolvedValue({ launch: null, revision: 0, canControl: false, protocolReady: true });
  let oldRefresh!: Promise<void>;
  act(() => { oldRefresh = result.current.refresh(); });
  rerender({ lesson: "lesson-2" });
  await act(async () => { old.resolve({ launch, revision: 100, canControl: true, protocolReady: true }); await oldRefresh; });
  expect(result.current.launch).toBeNull();
  expect(result.current.canControl).toBe(false);
});
