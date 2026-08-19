// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextFromPromise } from "./clipboard";

const originalClipboard = navigator.clipboard;

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
});

describe("copyTextFromPromise", () => {
  it("returns text for an in-app fallback without opening a browser prompt", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const prompt = vi.spyOn(window, "prompt");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.stubGlobal("ClipboardItem", undefined);

    await expect(copyTextFromPromise(Promise.resolve("https://dev.online.honey.school/join#token"))).resolves.toEqual({
      copied: false,
      text: "https://dev.online.honey.school/join#token",
    });
    expect(prompt).not.toHaveBeenCalled();
  });
});
