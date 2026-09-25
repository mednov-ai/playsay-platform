// @vitest-environment jsdom
import * as Y from "yjs";
import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollaborationDocument } from "../../../shared/api/playsay";
import type { AnnotationElement } from "../model/annotation";
import { useYjsWorkspace } from "./useYjsWorkspace";

vi.mock("../../../shared/api/playsay", () => ({
  isApiStatus: () => false,
  createCollaborationDocumentToken: vi.fn(() => new Promise(() => {})),
}));
afterEach(cleanup);
const document: CollaborationDocument = {
  id: "group-1", lessonId: "lesson-1", materialId: "material-1", documentKind: "MATERIAL",
  scope: "GROUP", yjsDocumentId: "group-1", version: 1, createdAt: "", updatedAt: "",
};
const element: AnnotationElement = {
  id: "text-1", kind: "text", text: "", pageId: "page-1", anchorId: "jpeg-1",
  x: 10, y: 10, width: 72, height: 56, fontSize: 18, color: "#ff5c00",
  fill: "transparent", autoHeight: true, autoWidth: true, createdAt: 1,
};
describe("live annotation state", () => {
  it("retains sequential text and size edits in React StrictMode and the persisted snapshot", () => {
    const { result } = renderHook(() => useYjsWorkspace({ document, color: "#123456", participantName: "Teacher" }), { wrapper: StrictMode });
    act(() => result.current.setAnnotationElements(() => [element]));
    for (const text of ["П", "Пр", "Привет ", "Привет\nJPEG\n"]) {
      act(() => {
        result.current.setAnnotationElements((current) => current.map((item) => ({ ...item, text })));
        result.current.setAnnotationElements((current) => current.map((item) => ({ ...item, width: 150 })));
      });
      expect(result.current.annotationElements[0]).toMatchObject({ text, width: 150 });
    }
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Uint8Array.from(atob(String(result.current.snapshot()?.yjsUpdateBase64)), (character) => character.charCodeAt(0)));
    expect(restored.getMap("annotations").toJSON()["text-1"].text).toBe("Привет\nJPEG\n");
    restored.destroy();
  });
  it("isolates student workspaces and restores a text snapshot", () => {
    const { result, rerender } = renderHook(({ active }) => useYjsWorkspace({ document: active, color: "#123456", participantName: "Teacher" }), { initialProps: { active: document } });
    act(() => result.current.setAnnotationElements(() => [{ ...element, text: "Student one" }]));
    const snapshot = result.current.snapshot();
    rerender({ active: { ...document, id: "student-2", yjsDocumentId: "student-2" } });
    expect(result.current.annotationElements).toEqual([]);
    act(() => result.current.setAnnotationElements(() => [{ ...element, text: "Student two" }]));
    rerender({ active: { ...document, snapshot } });
    expect(result.current.annotationElements).toEqual([expect.objectContaining({ text: "Student one", anchorId: "jpeg-1" })]);
  });

  it("does not resurrect deleted text when restoring the latest snapshot", () => {
    const { result, rerender } = renderHook(({ active }) => useYjsWorkspace({ document: active, color: "#123456", participantName: "Teacher" }), { initialProps: { active: document } });
    act(() => result.current.setAnnotationElements(() => [{ ...element, text: "Delete me" }]));
    act(() => result.current.setAnnotationElements(() => []));
    const snapshot = result.current.snapshot();
    rerender({ active: { ...document, id: "restored", snapshot } });
    expect(result.current.annotationElements).toEqual([]);
  });

});
