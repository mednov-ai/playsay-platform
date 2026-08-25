import { describe, expect, it } from "vitest";
import { pointerButtonMask, trustedInputCommand } from "./trusted-input";

const viewport = { height: 800, width: 1200 };

describe("trusted input commands", () => {
  it("maps normalized clicks to native CDP mouse events", () => {
    const down = { type: "pointer", action: "down", x: 0, y: 0, normalizedX: 0.25, normalizedY: 0.5, button: "left", clickCount: 1 } as const;
    expect(pointerButtonMask(down)).toBe(1);
    expect(trustedInputCommand(down, viewport, 1)).toEqual({
      method: "Input.dispatchMouseEvent",
      params: {
        type: "mousePressed",
        x: 300,
        y: 400,
        button: "left",
        buttons: 1,
        clickCount: 1,
        pointerType: "mouse",
      },
    });

    const up = { ...down, action: "up" } as const;
    expect(pointerButtonMask(up)).toBe(0);
    expect(trustedInputCommand(up, viewport, 0).params).toMatchObject({
      type: "mouseReleased",
      button: "left",
      buttons: 0,
      x: 300,
      y: 400,
    });
  });

  it("uses the native wheel command without script injection", () => {
    expect(trustedInputCommand({
      type: "scroll",
      x: 20,
      y: 40,
      normalizedX: 0.5,
      normalizedY: 0.25,
      deltaX: 4,
      deltaY: 120,
    }, viewport)).toEqual({
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseWheel", x: 600, y: 200, deltaX: 4, deltaY: 120 },
    });
  });

  it("maps text and modifiers to native key events", () => {
    expect(trustedInputCommand({
      type: "key",
      action: "down",
      key: "A",
      code: "KeyA",
      text: "A",
      modifiers: 8,
    }, viewport)).toEqual({
      method: "Input.dispatchKeyEvent",
      params: {
        type: "keyDown",
        key: "A",
        code: "KeyA",
        text: "A",
        unmodifiedText: "A",
        modifiers: 8,
      },
    });
  });
});
