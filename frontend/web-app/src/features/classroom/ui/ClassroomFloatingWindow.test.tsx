// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomFloatingWindow } from "./ClassroomFloatingWindow";
import { clampFloatingPosition, cornerPosition, floatingWidth, nearestFloatingCorner } from "./classroomFloatingGeometry";

vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));

const bounds = { left: 0, top: 0, width: 600, height: 600 };

describe("classroom floating window geometry", () => {
  it.each([
    ["top-left", { left: 12, top: 12 }],
    ["top-right", { left: 364, top: 12 }],
    ["bottom-left", { left: 12, top: 462 }],
    ["bottom-right", { left: 364, top: 462 }],
  ] as const)("docks to %s with inset and selects that corner", (corner, expected) => {
    expect(cornerPosition(corner, 224, bounds)).toEqual(expected);
    expect(nearestFloatingCorner(expected, 224, bounds)).toBe(corner);
  });

  it("keeps size and position within a smaller available area", () => {
    const smaller = { left: 10, top: 20, width: 250, height: 120 };
    const width = floatingWidth(360, smaller);
    expect(width).toBeCloseTo((120 - 24) * 16 / 9);
    expect(clampFloatingPosition({ left: -100, top: 500 }, width, smaller)).toEqual({ left: 22, top: 32 });
  });

  it("leaves enough video height for both rows of the 44px action controls at the normal minimum", () => {
    const width = floatingWidth(1, bounds);
    expect(width).toBe(160);
    expect(width / (16 / 9) - 2).toBeGreaterThanOrEqual(88);
  });
});

describe("accessible video window controls", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("uses the grip as the only menu trigger and returns focus after Escape", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const view = render(<div><ClassroomFloatingWindow><span tabIndex={0}>video</span></ClassroomFloatingWindow></div>);
    const grip = screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ });
    expect(view.container.querySelector(".classroom-floating-window__menu-toggle")).not.toBeInTheDocument();
    expect(grip).toHaveAccessibleName("classroom.floatingVideo.resize. classroom.floatingVideo.options");
    expect(grip).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(grip, { detail: 0 });
    expect(grip).toHaveAttribute("aria-expanded", "true");
    const larger = screen.getByRole("button", { name: "classroom.floatingVideo.larger" });
    larger.focus();
    fireEvent.keyDown(larger, { key: "Escape" });
    expect(grip).toHaveAttribute("aria-expanded", "false");
    expect(grip).toHaveFocus();
    screen.getByText("video").focus();
    fireEvent.click(grip, { detail: 1 });
    expect(grip).toHaveAttribute("aria-expanded", "true");
    expect(grip).toHaveFocus();
    fireEvent.click(grip, { detail: 1 });
    expect(grip).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on a tap with small pointer movement without resizing or moving", () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const view = render(<div><ClassroomFloatingWindow><span>video</span></ClassroomFloatingWindow></div>);
    const floating = view.container.querySelector<HTMLElement>(".classroom-floating-window")!;
    const grip = screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ });
    grip.setPointerCapture = vi.fn();
    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 476, clientY: 462 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 478, clientY: 459 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 478, clientY: 459 });
    fireEvent.click(grip, { detail: 1 });
    expect(floating).toHaveStyle({ width: "224px", left: "364px", top: "462px" });
    expect(grip).toHaveAttribute("aria-expanded", "true");
    expect(grip).toHaveFocus();
    fireEvent.keyDown(grip, { key: "Escape" });
    expect(grip).toHaveAttribute("aria-expanded", "false");
    floating.setPointerCapture = vi.fn();
    fireEvent.pointerDown(floating, { pointerId: 2, button: 0, clientX: 400, clientY: 480 });
    fireEvent.pointerMove(floating, { pointerId: 2, clientX: 402, clientY: 483 });
    expect(floating).toHaveStyle({ width: "224px", left: "364px", top: "462px" });
    fireEvent.pointerUp(floating, { pointerId: 2, clientX: 402, clientY: 483 });
  });

  it("moves and resizes without dragging and keeps child media mounted", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const unmounted = vi.fn();
    const view = render(<div><ClassroomFloatingWindow><video aria-label="video" onEmptied={unmounted} /></ClassroomFloatingWindow></div>);
    const video = screen.getByLabelText("video");
    const floating = view.container.querySelector<HTMLElement>(".classroom-floating-window")!;
    expect(floating).toHaveStyle({ left: "364px", top: "462px", width: "224px" });
    fireEvent.click(screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ }));
    fireEvent.click(screen.getByRole("button", { name: "classroom.floatingVideo.topLeft" }));
    expect(floating).toHaveStyle({ left: "12px", top: "12px" });
    fireEvent.click(screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ }));
    fireEvent.click(screen.getByRole("button", { name: "classroom.floatingVideo.smaller" }));
    expect(floating).toHaveStyle({ width: "184px" });
    expect(screen.getByLabelText("video")).toBe(video);
    expect(unmounted).not.toHaveBeenCalled();
  });

  it("snaps a drag and cancels a resize without changing the video", () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const view = render(<div><ClassroomFloatingWindow><video aria-label="video" /></ClassroomFloatingWindow></div>);
    const floating = view.container.querySelector<HTMLElement>(".classroom-floating-window")!;
    floating.setPointerCapture = vi.fn();
    fireEvent.pointerDown(floating, { pointerId: 1, button: 0, clientX: 400, clientY: 480 });
    fireEvent.pointerMove(floating, { pointerId: 1, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(floating, { pointerId: 1, clientX: 30, clientY: 30 });
    expect(floating).toHaveStyle({ left: "12px", top: "12px" });
    const resize = view.container.querySelector<HTMLElement>(".classroom-floating-window__resize")!;
    resize.setPointerCapture = vi.fn();
    expect(resize).toHaveAttribute("data-edge", "bottom");
    fireEvent.pointerDown(resize, { pointerId: 2, button: 0, clientX: 100, clientY: 130 });
    fireEvent.pointerMove(resize, { pointerId: 2, clientX: 100, clientY: 166 });
    expect(floating).toHaveStyle({ width: "288px" });
    fireEvent.pointerCancel(resize, { pointerId: 2, clientX: 100, clientY: 166 });
    expect(floating).toHaveStyle({ width: "224px" });
    expect(screen.getByLabelText("video")).toBeInTheDocument();
  });

  it("enlarges from the bottom-right corner by dragging inward and leaves summary interactive", () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const view = render(<div><ClassroomFloatingWindow><details><summary>Participants</summary><div className="playsay-tablet-other-list"><span>Member</span></div></details></ClassroomFloatingWindow></div>);
    const floating = view.container.querySelector<HTMLElement>(".classroom-floating-window")!;
    const resize = view.container.querySelector<HTMLElement>(".classroom-floating-window__resize")!;
    resize.setPointerCapture = vi.fn();
    expect(resize).toHaveAttribute("data-edge", "top");
    expect(fireEvent.pointerDown(resize, { pointerId: 1, button: 0, clientX: 476, clientY: 462 })).toBe(true);
    fireEvent.pointerMove(resize, { pointerId: 1, clientX: 476, clientY: 426 });
    fireEvent.pointerUp(resize, { pointerId: 1, clientX: 476, clientY: 426 });
    fireEvent.click(resize, { detail: 1 });
    expect(floating).toHaveStyle({ width: "288px", left: "300px" });
    expect(screen.queryByRole("group", { name: "classroom.floatingVideo.options" })).not.toBeInTheDocument();
    fireEvent.click(resize, { detail: 0 });
    expect(screen.getByRole("group", { name: "classroom.floatingVideo.options" })).toBeInTheDocument();
    fireEvent.keyDown(resize, { key: "Escape" });
    fireEvent.click(resize, { detail: 1 });
    expect(screen.getByRole("group", { name: "classroom.floatingVideo.options" })).toBeInTheDocument();
    fireEvent.pointerDown(resize, { pointerId: 4, button: 0, clientX: 476, clientY: 426 });
    fireEvent.pointerUp(resize, { pointerId: 4, clientX: 476, clientY: 426 });
    fireEvent.click(resize, { detail: 1 });
    expect(screen.queryByRole("group", { name: "classroom.floatingVideo.options" })).not.toBeInTheDocument();
    fireEvent.pointerDown(resize, { pointerId: 5, button: 0, clientX: 476, clientY: 426 });
    fireEvent.pointerUp(resize, { pointerId: 5, clientX: 476, clientY: 426 });
    fireEvent.click(resize, { detail: 1 });
    expect(screen.getByRole("group", { name: "classroom.floatingVideo.options" })).toBeInTheDocument();
    fireEvent.pointerDown(resize, { pointerId: 6, button: 0, clientX: 476, clientY: 426 });
    fireEvent.pointerMove(resize, { pointerId: 6, clientX: 476, clientY: 416 });
    fireEvent.pointerUp(resize, { pointerId: 6, clientX: 476, clientY: 416 });
    fireEvent.click(resize, { detail: 1 });
    expect(screen.queryByRole("group", { name: "classroom.floatingVideo.options" })).not.toBeInTheDocument();
    const summary = screen.getByText("Participants");
    expect(fireEvent.pointerDown(summary, { pointerId: 2, button: 0 })).toBe(true);
    fireEvent.click(summary);
    expect(summary.parentElement).toHaveAttribute("open");
    expect(fireEvent.pointerDown(screen.getByText("Member"), { pointerId: 3, button: 0 })).toBe(true);
  });

  it.each([
    ["topLeft", "bottom", 36, "12px", "12px"],
    ["topRight", "bottom", 36, "300px", "12px"],
    ["bottomLeft", "top", -36, "12px", "426px"],
    ["bottomRight", "top", -36, "300px", "426px"],
  ] as const)("resizes inward from the %s grip while keeping its corner", (corner, edge, growthY, left, top) => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const view = render(<div><ClassroomFloatingWindow><video aria-label="video" /></ClassroomFloatingWindow></div>);
    const floating = view.container.querySelector<HTMLElement>(".classroom-floating-window")!;
    fireEvent.click(screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ }));
    fireEvent.click(screen.getByRole("button", { name: `classroom.floatingVideo.${corner}` }));
    const resize = screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ });
    resize.setPointerCapture = vi.fn();
    expect(resize).toHaveAttribute("data-edge", edge);
    expect(floating).toHaveAttribute("data-resize-edge", edge);
    fireEvent.pointerDown(resize, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(resize, { pointerId: 7, clientX: 100, clientY: 100 + growthY });
    fireEvent.pointerUp(resize, { pointerId: 7, clientX: 100, clientY: 100 + growthY });
    expect(floating).toHaveStyle({ width: "288px", left, top });
    fireEvent.pointerDown(resize, { pointerId: 8, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(resize, { pointerId: 8, clientX: 100, clientY: 100 - growthY / 2 });
    fireEvent.pointerUp(resize, { pointerId: 8, clientX: 100, clientY: 100 - growthY / 2 });
    expect(floating).toHaveStyle({ width: "256px" });
    fireEvent.pointerDown(resize, { pointerId: 9, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(resize, { pointerId: 9, clientX: 100, clientY: 100 + growthY * 100 });
    fireEvent.pointerUp(resize, { pointerId: 9, clientX: 100, clientY: 100 + growthY * 100 });
    expect(floating).toHaveStyle({ width: "360px" });
    fireEvent.pointerDown(resize, { pointerId: 10, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(resize, { pointerId: 10, clientX: 100, clientY: 100 - growthY * 100 });
    fireEvent.pointerUp(resize, { pointerId: 10, clientX: 100, clientY: 100 - growthY * 100 });
    expect(floating).toHaveStyle({ width: "160px" });
  });

  it("uses the inward direction for keyboard resizing at either edge", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const view = render(<div><ClassroomFloatingWindow><span>video</span></ClassroomFloatingWindow></div>);
    const floating = view.container.querySelector<HTMLElement>(".classroom-floating-window")!;
    const resize = screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ });
    fireEvent.keyDown(resize, { key: "ArrowUp" });
    expect(floating).toHaveStyle({ width: "264px" });
    fireEvent.click(screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ }));
    fireEvent.click(screen.getByRole("button", { name: "classroom.floatingVideo.topLeft" }));
    fireEvent.keyDown(resize, { key: "ArrowDown" });
    expect(floating).toHaveStyle({ width: "304px" });
    fireEvent.keyDown(resize, { key: "ArrowUp" });
    expect(floating).toHaveStyle({ width: "264px" });
  });

  it("keeps the action menu in the parent when the video is shorter than its controls", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 240, bottom: 112, width: 240, height: 112, x: 0, y: 0, toJSON: () => ({}) });
    const view = render(<div><ClassroomFloatingWindow><span>video</span></ClassroomFloatingWindow></div>);
    fireEvent.click(screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ }));
    const menu = view.container.querySelector<HTMLElement>(".classroom-floating-window__menu")!;
    expect(menu.querySelectorAll("button")).toHaveLength(6);
    expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(0);
    expect(menu).toHaveStyle({ top: "0px" });
    fireEvent.keyDown(screen.getByRole("button", { name: "classroom.floatingVideo.larger" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "classroom.floatingVideo.larger" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /classroom\.floatingVideo\.resize/ })).toHaveFocus();
  });
});
