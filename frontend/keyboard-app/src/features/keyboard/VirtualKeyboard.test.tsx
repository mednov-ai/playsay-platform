import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VirtualKeyboard, type KeyboardLabels } from "./VirtualKeyboard";

const labels: KeyboardLabels = {
  backspace: "Backspace",
  tab: "Tab",
  caps: "Caps",
  enter: "Enter",
  shift: "Shift",
  control: "Ctrl",
  alt: "Alt",
  space: "Space",
};

describe("VirtualKeyboard", () => {
  it("marks physical home-row finger landing keys without marking neighboring keys", () => {
    const markup = renderToStaticMarkup(createElement(VirtualKeyboard, {
      labels,
      layoutId: "EN",
      nextChar: null,
    }));

    expect((markup.match(/data-home-key="true"/g) ?? [])).toHaveLength(8);
    expect(markup).toContain('data-home-char="a"');
    expect(markup).toContain('data-home-char="f"');
    expect(markup).toContain('data-home-char="j"');
    expect(markup).toContain('data-home-char=";"');
    expect(markup).not.toContain('data-home-char="g"');
    expect(markup).not.toContain('data-home-char="h"');
  });

  it("renders a subdued advanced symbol layer and brightens it while Shift is held", () => {
    const idleMarkup = renderToStaticMarkup(createElement(VirtualKeyboard, {
      labels,
      layoutId: "EN",
      nextChar: "{",
      nextRequiresShift: true,
      advancedMode: true,
      shiftActive: false,
    }));
    const shiftedMarkup = renderToStaticMarkup(createElement(VirtualKeyboard, {
      labels,
      layoutId: "EN",
      nextChar: "{",
      nextRequiresShift: true,
      advancedMode: true,
      shiftActive: true,
    }));

    expect(idleMarkup).toContain("virtual-keyboard--advanced");
    expect(idleMarkup).toContain("virtual-keyboard__shifted");
    expect(idleMarkup).toContain("{");
    expect(idleMarkup).toContain("is-shift-target");
    expect(shiftedMarkup).toContain("virtual-keyboard--shift-active");
    expect(shiftedMarkup).toContain("virtual-keyboard__key--shift");
  });

  it("keeps letter keys readable instead of duplicating uppercase letters in the advanced Shift layer", () => {
    const markup = renderToStaticMarkup(createElement(VirtualKeyboard, {
      labels,
      layoutId: "EN",
      nextChar: "{",
      nextRequiresShift: true,
      advancedMode: true,
      shiftActive: true,
    }));

    expect(markup).toContain('<span class="virtual-keyboard__shifted">{</span>');
    expect(markup).not.toMatch(/<span class="virtual-keyboard__shifted">[A-Z]<\/span>/);
  });
});
