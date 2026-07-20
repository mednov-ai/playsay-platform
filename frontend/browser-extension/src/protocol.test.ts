import { describe, expect, it } from "vitest";
import { cdpCommandForInput, isTrustedPlaySayOrigin, parsePageCommand } from "./protocol";

describe("extension protocol", () => {
  it("accepts production and local Play&Say origins only", () => {
    expect(isTrustedPlaySayOrigin("https://online.play-and-say.ru")).toBe(true);
    expect(isTrustedPlaySayOrigin("http://localhost:5173")).toBe(true);
    expect(isTrustedPlaySayOrigin("https://evil.example")).toBe(false);
    expect(isTrustedPlaySayOrigin("https://online.play-and-say.ru.evil.example")).toBe(false);
  });

  it("requires a versioned command with matching session and nonce", () => {
    expect(parsePageCommand({ version: 1, type: "PREPARE", sessionId: "s-1", nonce: "n-1", url: "https://wordwall.net/resource/1" })).toEqual({
      version: 1,
      type: "PREPARE",
      sessionId: "s-1",
      nonce: "n-1",
      url: "https://wordwall.net/resource/1",
    });
    expect(parsePageCommand({ version: 2, type: "PREPARE" })).toBeNull();
    expect(parsePageCommand({ version: 1, type: "PREPARE", sessionId: "", nonce: "n", url: "javascript:alert(1)" })).toBeNull();
  });

  it("maps pointer keyboard and scroll events to debugger input commands", () => {
    expect(cdpCommandForInput({ type: "pointer", action: "down", x: 10, y: 20, button: "left", clickCount: 1 })).toEqual({
      method: "Input.dispatchMouseEvent",
      params: { type: "mousePressed", x: 10, y: 20, button: "left", clickCount: 1 },
    });
    expect(cdpCommandForInput({ type: "key", action: "down", key: "A", code: "KeyA", text: "a", modifiers: 0 })).toMatchObject({
      method: "Input.dispatchKeyEvent",
      params: { type: "keyDown", key: "A", code: "KeyA", text: "a" },
    });
    expect(cdpCommandForInput({ type: "scroll", x: 5, y: 6, deltaX: 0, deltaY: 120 })).toMatchObject({
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseWheel", deltaY: 120 },
    });
  });

  it("rejects out of bounds and unsupported input", () => {
    expect(cdpCommandForInput({ type: "pointer", action: "move", x: -1, y: 20 })).toBeNull();
    expect(cdpCommandForInput({ type: "clipboard", value: "secret" } as never)).toBeNull();
  });
});
