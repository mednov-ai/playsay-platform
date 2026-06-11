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
});
