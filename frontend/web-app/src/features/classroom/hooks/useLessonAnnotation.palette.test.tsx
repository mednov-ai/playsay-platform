// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { annotationContentFromElements, annotationContentFromJson, type AnnotationElement } from "../model/annotation";
import { annotationPalette } from "../model/annotationPalette";
import { useLessonAnnotation } from "./useLessonAnnotation";

vi.mock("../../../shared/api/playsay", () => ({
  fetchScheduledLessonMaterialAnnotation: vi.fn(),
  saveScheduledLessonMaterialAnnotation: vi.fn(),
}));
afterEach(cleanup);

describe("palette compatibility with existing annotation behavior", () => {
  const base = {
    pageId: "page", color: "#123456", createdAt: 1, text: "Keep this text", fill: "#fff0a8",
    x: 10, y: 20, width: 100, height: 50, fontSize: 18 as const,
  };
  const initial: AnnotationElement[] = [
    { ...base, id: "text", kind: "text" },
    { ...base, id: "sticky", kind: "stickyNote" },
    { ...base, id: "root", kind: "mindMapNode", mapId: "map", parentId: null, side: "root", order: 0 },
  ];

  it("recolors text with undo/redo, preserves sticky styling and changes mind-map root fill only", () => {
    const { result } = renderHook(() => {
      const [elements, setElements] = useState(initial);
      return useLessonAnnotation({ lessonId: "local", materialId: "local", initialPageId: "page",
        controlledAnnotation: { key: "local", elements, setElements } });
    });
    act(() => result.current.setSelectedElementId("text"));
    act(() => result.current.updateSelectedColor("#8b5cf6"));
    expect(result.current.annotationElements.find((element) => element.id === "text")).toEqual({ ...initial[0], color: "#8b5cf6" });
    act(() => result.current.undo());
    expect(result.current.annotationElements).toEqual(expect.arrayContaining(initial));
    expect(result.current.annotationElements).toHaveLength(initial.length);
    act(() => result.current.redo());
    expect(result.current.annotationElements.find((element) => element.id === "text")?.color).toBe("#8b5cf6");
    act(() => result.current.setSelectedElementId("sticky"));
    act(() => result.current.updateSelectedColor("#ec4899"));
    expect(result.current.annotationElements.find((element) => element.id === "sticky")).toEqual(initial[1]);
    expect(result.current.annotationColor).toBe("#ec4899");
    act(() => result.current.setSelectedElementId("root"));
    act(() => result.current.updateSelectedColor("#ef4444"));
    expect(result.current.annotationElements.find((element) => element.id === "root")).toEqual({ ...initial[2], fill: "#ef4444" });
  });

  it("round-trips all palette colors and legacy colors in the existing schema", () => {
    const elements: AnnotationElement[] = [...annotationPalette.map((entry, index) => ({
      ...base, kind: "text" as const, id: `color-${index}`, color: entry.value,
    })), initial[0]];
    const restored = annotationContentFromJson(JSON.parse(JSON.stringify(annotationContentFromElements(elements, "page"))));
    expect(restored.elements.map((element) => element.color)).toEqual([...annotationPalette.map((entry) => entry.value), "#123456"]);
  });
});
