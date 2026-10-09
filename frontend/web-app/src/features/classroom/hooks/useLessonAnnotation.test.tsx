// @vitest-environment jsdom
import { useState, type PointerEvent } from "react";
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

function pointer(x: number, y: number): PointerEvent<SVGSVGElement> {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, toJSON: () => ({}) });
  svg.setPointerCapture = vi.fn();
  svg.hasPointerCapture = () => true;
  svg.releasePointerCapture = vi.fn();
  return { button: 0, clientX: x, clientY: y, currentTarget: svg, target: svg, pointerId: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as PointerEvent<SVGSVGElement>;
}

describe("concurrent Text gestures", () => {
  for (const mode of ["move", "resize"] as const) {
    for (const initialText of ["", "Before"]) {
      it(`preserves remote content and style during ${mode} of ${JSON.stringify(initialText)}`, async () => {
        const { result } = renderHook(() => {
          const [elements, remote] = useState<AnnotationElement[]>([{ ...original, text: initialText }]);
          const annotation = useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1", initialPageId: "page-1", liveAnnotation: { elements, setElements: remote, ready: true } });
          return { ...annotation, remote };
        });
        await act(async () => {});
        act(() => mode === "move" ? result.current.beginElementMove(pointer(10, 10), "text-1") : result.current.beginElementResize(pointer(82, 30), "text-1", "e"));
        act(() => result.current.remote((current) => current.map((element) => ({ ...element, text: " Новый текст\nЯ ", color: "#00a878", fontSize: 24 } as AnnotationElement))));
        act(() => result.current.endAnnotation(pointer(150, 80)));
        expect(result.current.annotationElements[0]).toMatchObject({ text: " Новый текст\nЯ ", color: "#00a878", fontSize: 24 });
        expect(result.current.annotationElements[0]).toMatchObject(mode === "move" ? { x: 150, y: 80 } : { width: 140, autoWidth: false });
      });
    }
  }
});

describe("shared annotation gesture ownership", () => {
  for (const kind of ["text", "stickyNote", "mindMapNode"] as const) {
    it(`keeps current ${kind} content during a move and never recreates a deleted target`, async () => {
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      const node = { ...original, kind, ...(kind === "mindMapNode" ? { mapId: "map-1", parentId: null, side: "right", collapsed: false } : {}) } as AnnotationElement;
      const { result } = renderHook(() => {
        const [elements, remote] = useState<AnnotationElement[]>([node]);
        return { ...useLessonAnnotation({ lessonId: "lesson", controlledAnnotation: { key: "student-a", elements, setElements: remote } }), remote };
      });
      act(() => result.current.beginElementMove(pointer(10, 10), node.id));
      act(() => result.current.remote((current) => current.map((element) => ({ ...element, text: "Concurrent label", color: "#123456" } as AnnotationElement))));
      act(() => result.current.endAnnotation(pointer(100, 80)));
      expect(result.current.annotationElements[0]).toMatchObject({ text: "Concurrent label", color: "#123456", x: 100, y: 80 });
      act(() => result.current.beginElementMove(pointer(100, 80), node.id));
      act(() => result.current.remote(() => []));
      act(() => result.current.endAnnotation(pointer(150, 100)));
      expect(result.current.annotationElements).toEqual([]);
      vi.unstubAllGlobals();
    });
  }
});

describe("local to live handoff", () => {
  it("transfers newly created Text into a nonempty document and ignores an older read", async () => {
    let resolveRead!: (value: ReturnType<typeof response>) => void;
    api.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const { result, rerender } = renderHook(({ live }) => {
      const [elements, setElements] = useState<AnnotationElement[]>([{ ...original, id: "other", text: "Student note" }]);
      return useLessonAnnotation({ lessonId: "lesson", materialId: "material", initialPageId: "page-1", liveAnnotation: live ? { elements, setElements, ready: true } : null });
    }, { initialProps: { live: false } });
    act(() => result.current.setAnnotationTool("text"));
    act(() => result.current.beginAnnotation(pointer(100, 150), "jpeg-1"));
    const id = result.current.editingElementId!;
    expect(id).toBeTruthy();
    act(() => result.current.updateAnnotationText(id, " New text\nЯ "));
    rerender({ live: true });
    await act(async () => { resolveRead(response("Old REST snapshot")); });
    expect(result.current.editingElementId).toBe(id);
    expect(result.current.annotationElements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, text: " New text\nЯ ", anchorId: "jpeg-1" }),
      expect.objectContaining({ id: "other", text: "Student note" }),
    ]));
    expect(result.current.annotationElements).toHaveLength(2);
    expect(api.save).not.toHaveBeenCalled();
  });

  it("keeps the editor and latest text while an older REST save is in flight", async () => {
    let acknowledge!: () => void;
    api.save.mockImplementationOnce(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    const { result, rerender } = renderHook(({ live }) => {
      const [elements, setElements] = useState<AnnotationElement[]>([{ ...original, id: "other", text: "Student note" }]);
      return useLessonAnnotation({ lessonId: "lesson-1", materialId: "material-1", initialPageId: "page-1", liveAnnotation: live ? { elements, setElements, ready: true } : null });
    }, { initialProps: { live: false } });
    await act(async () => {});
    act(() => result.current.beginTextEditing("text-1"));
    act(() => result.current.updateAnnotationText("text-1", "First"));
    await act(async () => { vi.advanceTimersByTime(500); });
    act(() => result.current.updateAnnotationText("text-1", " Latest\nЯ "));
    rerender({ live: true });
    await act(async () => {});
    expect(result.current.editingElementId).toBe("text-1");
    expect(result.current.annotationElements).toEqual(expect.arrayContaining([expect.objectContaining({ id: "text-1", text: " Latest\nЯ " }), expect.objectContaining({ id: "other", text: "Student note" })]));
    await act(async () => { acknowledge(); });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(result.current.annotationElements.find((element) => element.id === "text-1")).toMatchObject({ text: " Latest\nЯ " });
  });
});
describe("handoff field and context isolation", () => {
  it("merges only edited fields into the current live element once", async () => {
    const { result, rerender } = renderHook(({ live, ready }) => {
      const [elements, setElements] = useState<AnnotationElement[]>([{ ...original, x: 400, color: "#123456" }]);
      return { ...useLessonAnnotation({ lessonId: "lesson", materialId: "material", initialPageId: "page-1", liveAnnotation: live ? { elements, setElements, ready } : null }), remote: setElements };
    }, { initialProps: { live: false, ready: false } });
    await act(async () => {});
    act(() => result.current.beginTextEditing(original.id));
    act(() => result.current.updateAnnotationText(original.id, "Unsaved text"));
    rerender({ live: true, ready: false });
    expect(result.current.editingElementId).toBe(original.id);
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Unsaved text" });
    act(() => result.current.updateAnnotationText(original.id, "Continued while connecting"));
    rerender({ live: true, ready: true });
    await act(async () => {});
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Continued while connecting", x: 400, color: "#123456" });
    act(() => result.current.remote((current) => current.map((element) => ({ ...element, text: "Later live edit" } as AnnotationElement))));
    rerender({ live: true, ready: false });
    rerender({ live: true, ready: true });
    await act(async () => {});
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Later live edit" });
    expect(api.save).not.toHaveBeenCalled();
  });

  it("does not restore a live element observed deleted before handoff readiness", async () => {
    const { result, rerender } = renderHook(({ live, ready }) => {
      const [elements, setElements] = useState<AnnotationElement[]>([original]);
      return { ...useLessonAnnotation({ lessonId: "lesson", materialId: "material", initialPageId: "page-1", liveAnnotation: live ? { elements, setElements, ready } : null }), remote: setElements };
    }, { initialProps: { live: false, ready: false } });
    await act(async () => {});
    act(() => result.current.updateAnnotationText(original.id, "Pending local edit"));
    rerender({ live: true, ready: false });
    act(() => result.current.remote(() => []));
    rerender({ live: true, ready: true });
    await act(async () => {});
    expect(result.current.annotationElements).toEqual([]);
  });

  it("ignores old editor and gesture callbacks after switching a controlled student context", async () => {
    const { result, rerender } = renderHook(({ student }) => {
      const [first, setFirst] = useState<AnnotationElement[]>([original]);
      const [second, setSecond] = useState<AnnotationElement[]>([{ ...original, text: "Second student's work" }]);
      return useLessonAnnotation({ lessonId: "lesson", controlledAnnotation: { key: student, elements: student === "first" ? first : second, setElements: student === "first" ? setFirst : setSecond } });
    }, { initialProps: { student: "first" } });
    act(() => result.current.beginElementMove(pointer(10, 10), original.id));
    const oldTextCallback = result.current.updateAnnotationText;
    const oldPointerCallback = result.current.endAnnotation;
    rerender({ student: "second" });
    act(() => { oldTextCallback(original.id, "Wrong student's text"); oldPointerCallback(pointer(150, 80)); });
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Second student's work", x: 10, y: 10 });
  });

  it("drops queued REST writes when another material replaces the canvas in the same lesson", async () => {
    const { result, rerender } = renderHook(({ materialId }) => useLessonAnnotation({ lessonId: "lesson", materialId, initialPageId: "page-1" }), { initialProps: { materialId: "first" } });
    await act(async () => {});
    act(() => result.current.updateAnnotationText(original.id, "First material only"));
    api.fetch.mockResolvedValueOnce(response("Second material"));
    rerender({ materialId: "second" });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(api.save).not.toHaveBeenCalled();
    expect(result.current.annotationElements[0]).toMatchObject({ text: "Second material" });
  });
});

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
