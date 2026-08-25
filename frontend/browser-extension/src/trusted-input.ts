import type { ExternalInput } from "./protocol";

export type TrustedViewport = { height: number; width: number };

export type TrustedInputCommand = {
  method: "Input.dispatchKeyEvent" | "Input.dispatchMouseEvent";
  params: Record<string, unknown>;
};

export function trustedInputCommand(
  input: ExternalInput,
  viewport: TrustedViewport,
  pressedButtons = 0,
): TrustedInputCommand {
  if (input.type === "key") {
    const params: Record<string, unknown> = {
      type: input.action === "down" ? "keyDown" : "keyUp",
      key: input.key,
      code: input.code ?? "",
      modifiers: input.modifiers ?? 0,
    };
    if (input.action === "down" && input.text) {
      params.text = input.text;
      params.unmodifiedText = input.text;
    }
    return { method: "Input.dispatchKeyEvent", params };
  }

  const x = coordinate(input.normalizedX, input.x, viewport.width);
  const y = coordinate(input.normalizedY, input.y, viewport.height);
  if (input.type === "scroll") {
    return {
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseWheel", x, y, deltaX: input.deltaX, deltaY: input.deltaY },
    };
  }

  const button = input.button ?? "left";
  return {
    method: "Input.dispatchMouseEvent",
    params: {
      type: input.action === "down"
        ? "mousePressed"
        : input.action === "up"
          ? "mouseReleased"
          : "mouseMoved",
      x,
      y,
      button: input.action === "move" && pressedButtons === 0 ? "none" : button,
      buttons: pressedButtons,
      clickCount: input.clickCount ?? 1,
      pointerType: "mouse",
    },
  };
}

export function pointerButtonMask(input: Extract<ExternalInput, { type: "pointer" }>): number {
  if (input.action === "up") return 0;
  if (input.action !== "down") return -1;
  if (input.button === "middle") return 4;
  if (input.button === "right") return 2;
  return 1;
}

function coordinate(normalized: number | undefined, fallback: number, extent: number): number {
  const value = normalized === undefined ? fallback : normalized * extent;
  return Math.min(Math.max(0, extent - 1), Math.max(0, value));
}
