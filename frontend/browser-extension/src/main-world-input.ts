import type { ExternalInput } from "./protocol";

type InputState = {
  pressedButton: number;
  pressedTarget: Element | null;
};

type InputWindow = Window & {
  __honeySchoolExternalInputState?: InputState;
};

export function applyExternalInput(input: ExternalInput) {
  const inputWindow = window as InputWindow;
  if (input.type === "key") {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    target.dispatchEvent(new KeyboardEvent(input.action === "down" ? "keydown" : "keyup", {
      bubbles: true,
      cancelable: true,
      code: input.code ?? "",
      key: input.key,
      altKey: Boolean(input.modifiers && input.modifiers & 1),
      ctrlKey: Boolean(input.modifiers && input.modifiers & 2),
      metaKey: Boolean(input.modifiers && input.modifiers & 4),
      shiftKey: Boolean(input.modifiers && input.modifiers & 8),
    }));
    if (
      input.action === "down"
      && input.text
      && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    ) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      target.setRangeText(input.text, start, end, "end");
      target.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: input.text,
        inputType: "insertText",
      }));
    }
    return;
  }

  const normalizedX = typeof input.normalizedX === "number"
    ? input.normalizedX
    : input.x / Math.max(1, window.innerWidth);
  const normalizedY = typeof input.normalizedY === "number"
    ? input.normalizedY
    : input.y / Math.max(1, window.innerHeight);
  const clientX = Math.min(window.innerWidth - 1, Math.max(0, normalizedX * window.innerWidth));
  const clientY = Math.min(window.innerHeight - 1, Math.max(0, normalizedY * window.innerHeight));
  const hitTarget = document.elementFromPoint(clientX, clientY);
  if (!hitTarget) return;

  if (input.type === "scroll") {
    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      deltaX: input.deltaX,
      deltaY: input.deltaY,
    });
    hitTarget.dispatchEvent(wheelEvent);
    if (!wheelEvent.defaultPrevented) {
      window.scrollBy({ left: input.deltaX, top: input.deltaY, behavior: "auto" });
    }
    return;
  }

  const button = input.button === "middle" ? 1 : input.button === "right" ? 2 : 0;
  const buttonMask = button === 1 ? 4 : button === 2 ? 2 : 1;
  const interactiveTarget = hitTarget.closest(
    "button, a, input, label, select, textarea, [role='button'], [role='link'], [tabindex]",
  ) ?? hitTarget;
  const state = inputWindow.__honeySchoolExternalInputState ?? {
    pressedButton: 0,
    pressedTarget: null,
  };
  inputWindow.__honeySchoolExternalInputState = state;

  if (input.action === "move") {
    const buttons = state.pressedTarget ? state.pressedButton : 0;
    hitTarget.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button,
      buttons,
      cancelable: true,
      clientX,
      clientY,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    }));
    hitTarget.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      button,
      buttons,
      cancelable: true,
      clientX,
      clientY,
    }));
    return;
  }

  if (input.action === "down") {
    state.pressedButton = buttonMask;
    state.pressedTarget = interactiveTarget;
    if (interactiveTarget instanceof HTMLElement) interactiveTarget.focus({ preventScroll: true });
    interactiveTarget.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button,
      buttons: buttonMask,
      cancelable: true,
      clientX,
      clientY,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    }));
    interactiveTarget.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button,
      buttons: buttonMask,
      cancelable: true,
      clientX,
      clientY,
    }));
    return;
  }

  const releaseTarget = state.pressedTarget ?? interactiveTarget;
  releaseTarget.dispatchEvent(new PointerEvent("pointerup", {
    bubbles: true,
    button,
    buttons: 0,
    cancelable: true,
    clientX,
    clientY,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  }));
  releaseTarget.dispatchEvent(new MouseEvent("mouseup", {
    bubbles: true,
    button,
    buttons: 0,
    cancelable: true,
    clientX,
    clientY,
  }));
  state.pressedButton = 0;
  state.pressedTarget = null;
  if (button === 0 && "click" in releaseTarget && typeof releaseTarget.click === "function") {
    releaseTarget.click();
  }
}
