// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnotationLayer } from "./AnnotationLayer";

vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function props(): ComponentProps<typeof AnnotationLayer> {
  return {
    elements: [{ id: "text-1", kind: "text", pageId: "page-1", anchorId: "jpeg", text: "Привет JPEG", color: "#ff5c00", createdAt: 1, fontSize: 18, width: 200, height: 80, x: 100, y: 200, fill: "transparent" }],
    anchorId: "jpeg", anchorBounds: { left: 20, top: 30, width: 500, height: 250 },
    tool: "pointer", selectedElementId: "text-1", editingElementId: null,
    onBegin: vi.fn(), onAddMindMapNode: vi.fn(), onDeleteSelected: vi.fn(), onDeselect: vi.fn(),
    onEditText: vi.fn(), onEnd: vi.fn(), onElementSizeChange: vi.fn(), onFinishTextEditing: vi.fn(),
    onMove: vi.fn(), onMoveElement: vi.fn(), onMindMapKey: vi.fn(), onRedo: vi.fn(),
    onResizeElement: vi.fn(), onSelectElement: vi.fn(), onTextChange: vi.fn(), onUndo: vi.fn(),
  };
}
function dimensions() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 20, y: 30, left: 20, top: 30, right: 520, bottom: 280, width: 500, height: 250, toJSON: () => ({}) });
}
describe("HTML annotation rendering", () => {
  it("paints beside SVG in the same clipped coordinate space and preserves SVG event ownership", () => {
    dimensions();
    const input = props();
    const { container } = render(<div><AnnotationLayer {...input} /></div>);
    const box = container.querySelector<HTMLElement>(".playsay-annotation-html-element")!;
    expect(box.closest("svg")).toBeNull();
    expect(box.style.left).toBe("50px");
    expect(box.style.top).toBe("50px");
    expect(box.style.transform).toBe("scale(0.5, 0.25)");
    const layer = box.parentElement!;
    expect(layer.style.left).toBe("20px");
    expect(layer.style.top).toBe("30px");
    expect(layer.style.overflow).toBe("hidden");
    fireEvent.doubleClick(box);
    expect(input.onEditText).toHaveBeenCalledExactlyOnceWith("text-1");
    let owner: Element | null = null;
    input.onMoveElement = (event) => { owner = event.currentTarget; };
    cleanup();
    const next = render(<div><AnnotationLayer {...input} /></div>);
    fireEvent.pointerDown(next.container.querySelector(".playsay-annotation-html-element")!);
    expect(owner).toBe(next.container.querySelector("foreignObject"));
  });

  it("preserves composition and final input on blur through the portal", () => {
    dimensions();
    const input = { ...props(), editingElementId: "text-1" };
    const { container } = render(<div><AnnotationLayer {...input} /></div>);
    const editor = container.querySelector("textarea")!;
    fireEvent.compositionStart(editor);
    fireEvent.change(editor, { target: { value: "日本語\nПривет " } });
    fireEvent.compositionEnd(editor, { data: "語" });
    fireEvent.blur(editor);
    expect(input.onTextChange).toHaveBeenLastCalledWith("text-1", "日本語\nПривет ");
    expect(input.onFinishTextEditing).toHaveBeenCalledOnce();
    expect(input.onDeleteSelected).not.toHaveBeenCalled();
  });

  it("keeps read-only HTML inert and hides it with missing image geometry", () => {
    dimensions();
    const input = props();
    const { container, rerender, unmount } = render(<div><AnnotationLayer {...input} readOnly /></div>);
    const box = container.querySelector<HTMLElement>(".playsay-annotation-html-element")!;
    expect(box.style.pointerEvents).toBe("none");
    expect(box.getAttribute("role")).toBe("img");
    rerender(<div><AnnotationLayer {...input} anchorBounds={null} /></div>);
    expect(container.querySelector(".playsay-annotation-html-element")).toBeNull();
    expect(container.querySelector<HTMLElement>(".playsay-annotation-html-layer")?.style.visibility).toBe("hidden");
    unmount();
    expect(container.querySelector(".playsay-annotation-html-layer")).toBeNull();
  });
});
