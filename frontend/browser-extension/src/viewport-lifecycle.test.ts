import { describe, expect, it } from "vitest";
import { debuggerEventRefreshesViewport } from "./viewport-lifecycle";

describe("viewport lifecycle", () => {
  it("refreshes for resize, load and top-level navigation", () => {
    expect(debuggerEventRefreshesViewport("Page.frameResized")).toBe(true);
    expect(debuggerEventRefreshesViewport("Page.loadEventFired")).toBe(true);
    expect(debuggerEventRefreshesViewport("Page.frameNavigated", { frame: { id: "root" } })).toBe(true);
  });

  it("ignores nested-frame navigation and unrelated debugger events", () => {
    expect(debuggerEventRefreshesViewport("Page.frameNavigated", { frame: { id: "child", parentId: "root" } })).toBe(false);
    expect(debuggerEventRefreshesViewport("Network.requestWillBeSent")).toBe(false);
  });
});
