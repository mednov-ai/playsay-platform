// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { annotationPalette } from "../model/annotationPalette";
import { AnnotationColorSelect } from "./AnnotationColorSelect";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { resources } from "../../../shared/i18n/resources";

vi.mock("../../../shared/i18n", () => ({
  i18n: { t: (key: string) => key },
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);

describe("annotation color dropdown", () => {
  it("offers ten localized choices and applies each only on confirmation", () => {
    const change = vi.fn();
    function Picker() {
      const [color, setColor] = useState("#ff5c00");
      return <AnnotationColorSelect color={color} onSelectColor={(value) => { change(value); setColor(value); }} />;
    }
    render(<Picker />);
    const trigger = screen.getByTestId("annotation-color-select");
    expect(screen.queryByRole("listbox")).toBeNull();
    for (const entry of annotationPalette) {
      fireEvent.click(trigger);
      expect(screen.getAllByRole("option")).toHaveLength(10);
      fireEvent.click(screen.getByRole("option", { name: `classroom.annotation.colors.${entry.name}` }));
      expect(change.mock.lastCall).toEqual([entry.value]);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger);
    }
    expect(change).toHaveBeenCalledTimes(10);
    for (const resource of Object.values(resources)) {
      expect(Object.keys(resource.translation.classroom.annotation.colors)).toHaveLength(10);
      for (const entry of annotationPalette) expect(resource.translation.classroom.annotation.colors[entry.name]).toBeTruthy();
    }
  });

  it("navigates without changing data, cancels with Escape, and contains canvas events", () => {
    const change = vi.fn();
    const canvas = vi.fn();
    render(<div onPointerDown={canvas} onKeyDown={canvas} onClick={canvas}>
      <AnnotationColorSelect color="#ff5c00" onSelectColor={change} />
    </div>);
    const trigger = screen.getByTestId("annotation-color-select");
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    const list = screen.getByRole("listbox");
    expect(list.parentElement).toBe(document.body);
    fireEvent.keyDown(list, { key: "End" });
    expect(list.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[9].id);
    fireEvent.keyDown(list, { key: "Home" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(change).not.toHaveBeenCalled();
    expect(canvas).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" });
    expect(change).toHaveBeenCalledExactlyOnceWith("#00a878");
    expect(canvas).not.toHaveBeenCalled();
  });

  it("preserves unknown colors and closes on outside focus, scroll and unmount", () => {
    const change = vi.fn();
    const { unmount } = render(<><AnnotationColorSelect color="#123456" onSelectColor={change} /><button>Outside</button></>);
    const trigger = screen.getByTestId("annotation-color-select");
    fireEvent.click(trigger);
    expect(screen.getAllByRole("option").every((option) => option.getAttribute("aria-selected") === "false")).toBe(true);
    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.scroll(screen.getByRole("listbox"));
    expect(screen.queryByRole("listbox")).not.toBeNull();
    fireEvent.scroll(window);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    act(() => screen.getByText("Outside").focus());
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    unmount();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it("skips duplicate color history while preserving recolor of a differently styled selection", () => {
    const change = vi.fn();
    const props = {
      annotationColor: "#ff5c00", annotationFontSize: 18 as const, annotationStrokeWidth: 4 as const,
      annotationTool: "pen" as const, canRedo: false, canUndo: false,
      onClearSelection: vi.fn(), onRedo: vi.fn(), onSelectColor: change,
      onSelectFontSize: vi.fn(), onSelectStrokeWidth: vi.fn(), onSelectTool: vi.fn(), onUndo: vi.fn(),
      selectedElement: null,
    };
    const { rerender } = render(<AnnotationToolbar {...props} />);
    const selectOrange = () => {
      fireEvent.click(screen.getByTestId("annotation-color-select"));
      fireEvent.click(screen.getByRole("option", { name: "classroom.annotation.colors.orange" }));
    };
    selectOrange();
    expect(change).not.toHaveBeenCalled();
    rerender(<AnnotationToolbar {...props} selectedElement={{
      id: "existing", kind: "text", pageId: "page", x: 0, y: 0, width: 100, height: 50,
      createdAt: 1, text: "Keep me", color: "#123456", fontSize: 18, fill: "transparent",
    }} />);
    selectOrange();
    expect(change).toHaveBeenCalledExactlyOnceWith("#ff5c00");
    expect(props.onSelectTool).not.toHaveBeenCalled();
    expect(props.onClearSelection).not.toHaveBeenCalled();
  });
});
