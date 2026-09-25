// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLessonAnnotation } from "./useLessonAnnotation";
import type { AnnotationElement } from "../model/annotation";
const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock("../../../shared/api/playsay", () => ({
  fetchScheduledLessonMaterialAnnotation: api.fetch,
  saveScheduledLessonMaterialAnnotation: api.save,
}));
const original: AnnotationElement = {
  id: "text-1", kind: "text", text: "Before", pageId: "page-1", anchorId: "jpeg-1",
  x: 10, y: 10, width: 72, height: 56, fontSize: 18, color: "#ff5c00",
  fill: "transparent", autoHeight: true, autoWidth: true, createdAt: 1,
};
const response = (text: string) => ({ content: { schemaVersion: 7, activePageId: "page-1", elements: [{ ...original, text }] } });
beforeEach(() => { vi.useFakeTimers(); api.fetch.mockReset().mockResolvedValue(response("Before")); api.save.mockReset().mockResolvedValue({}); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("lesson Text lifecycle", () => {
  it("keeps the editor active while the same live workspace reconnects", async () => {
    const { result, rerender } = renderHook(({ ready }) => {
      const [elements, setElements] = useState<AnnotationElement[]>([original]);
      return useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1", initialPageId: "page-1", liveAnnotation: { elements, setElements, ready } });
    }, { initialProps: { ready: true } });
    await act(async () => {});
    act(() => result.current.beginTextEditing("text-1"));
    act(() => result.current.updateAnnotationText("text-1", "Новый текст"));
    rerender({ ready: false });
    await act(async () => {});
    expect(result.current.editingElementId).toBe("text-1");
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Новый текст" });
  });
  it("ignores an old polling response after a more recent edit", async () => {
    const { result } = renderHook(() => useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1", initialPageId: "page-1" }));
    await act(async () => {});
    let resolveFetch!: (value: ReturnType<typeof response>) => void;
    api.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; }));
    await act(async () => { vi.advanceTimersByTime(2000); });
    act(() => result.current.updateAnnotationText("text-1", "Новый текст"));
    await act(async () => { resolveFetch(response("Older remote text")); });
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Новый текст" });
  });
});

describe("Text edit boundaries", () => {
  it("keeps final input through geometry updates, blur history and undo/redo", async () => {
    const { result } = renderHook(() => useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1", initialPageId: "page-1" }));
    await act(async () => {});
    act(() => result.current.beginTextEditing("text-1"));
    act(() => {
      result.current.updateAnnotationText("text-1", "Последний символ я");
      result.current.updateAnnotationElementSize("text-1", 200, 100);
      result.current.finishTextEditing();
    });
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Последний символ я", width: 200 });
    act(() => result.current.undo());
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Before" });
    act(() => result.current.redo());
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Последний символ я" });
  });
});

describe("fallback persistence", () => {
  it("persists deletion of the final element on the default page", async () => {
    api.fetch.mockResolvedValue({ content: { activePageId: "material", elements: [{ ...original, pageId: "material" }] } });
    const { result } = renderHook(() => useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1" }));
    await act(async () => {});
    act(() => result.current.setSelectedElementId("text-1"));
    act(() => result.current.deleteSelectedElement());
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.annotationElements).toEqual([]);
    expect(api.save).toHaveBeenCalledWith("lesson-1", expect.objectContaining({
      content: expect.objectContaining({ activePageId: "material", elements: [] }),
    }));
  });
  it("retries the latest text after a save failure without another keystroke", async () => {
    const { result } = renderHook(() => useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1", initialPageId: "page-1" }));
    await act(async () => {});
    api.save.mockRejectedValueOnce(new Error("offline"));
    act(() => result.current.updateAnnotationText("text-1", "Keep me"));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(api.save).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.lastCall?.[1].content.elements[0].text).toBe("Keep me");
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Keep me" });
  });
  it("drains the newest edit after an older save completes, including on unmount", async () => {
    const { result, unmount } = renderHook(() => useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1", initialPageId: "page-1" }));
    await act(async () => {});
    let acknowledge!: () => void;
    api.save.mockImplementationOnce(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    act(() => result.current.updateAnnotationText("text-1", "First"));
    await act(async () => { vi.advanceTimersByTime(500); });
    act(() => result.current.updateAnnotationText("text-1", "Latest"));
    unmount();
    await act(async () => { acknowledge(); });
    expect(api.save.mock.calls.map((call) => call[1].content.elements[0].text)).toEqual(["First", "Latest"]);
  });
  it("does not clear saved text when polling fails", async () => {
    const { result } = renderHook(() => useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1", initialPageId: "page-1" }));
    await act(async () => {});
    api.fetch.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Before" });
  });
  it("flushes to the original lesson and never seeds a new lesson with its text", async () => {
    const { result, rerender } = renderHook(({ lessonId }) => useLessonAnnotation({ lessonId, materialId: "material-1", initialPageId: "page-1" }), { initialProps: { lessonId: "lesson-1" } });
    await act(async () => {});
    act(() => result.current.updateAnnotationText("text-1", "First lesson only"));
    api.fetch.mockResolvedValueOnce(response("Second lesson"));
    rerender({ lessonId: "lesson-2" });
    await act(async () => {});
    expect(api.save).toHaveBeenCalledWith("lesson-1", expect.objectContaining({ content: expect.objectContaining({ elements: [expect.objectContaining({ text: "First lesson only" })] }) }));
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Second lesson" });
    expect(api.save.mock.calls.some((call) => call[0] === "lesson-2")).toBe(false);
  });
});
