// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyExternalInput } from "./main-world-input";

describe("main-world external input", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: window.MouseEvent,
    });
    delete (window as Window & { __honeySchoolExternalInputState?: unknown }).__honeySchoolExternalInputState;
  });

  it("maps normalized coordinates to the provider viewport", () => {
    const button = document.createElement("button");
    document.body.append(button);
    const elementFromPoint = vi.fn(() => button);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });

    applyExternalInput({
      type: "pointer",
      action: "move",
      x: 10,
      y: 20,
      normalizedX: 0.5,
      normalizedY: 0.25,
    });

    expect(elementFromPoint).toHaveBeenCalledWith(window.innerWidth * 0.5, window.innerHeight * 0.25);
  });

  it("does not turn pointer movement into a click", () => {
    const button = document.createElement("button");
    const click = vi.fn();
    button.addEventListener("click", click);
    document.body.append(button);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => button,
    });

    applyExternalInput({ type: "pointer", action: "move", x: 20, y: 20 });

    expect(click).not.toHaveBeenCalled();
  });

  it("keeps down and up on the same interactive parent and clicks once", () => {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    button.append(icon);
    document.body.append(button);
    const events: string[] = [];
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      button.addEventListener(type, () => events.push(type));
    }
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => icon,
    });

    applyExternalInput({ type: "pointer", action: "down", x: 20, y: 20, button: "left" });
    applyExternalInput({ type: "pointer", action: "up", x: 20, y: 20, button: "left" });

    expect(events).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
  });
});
