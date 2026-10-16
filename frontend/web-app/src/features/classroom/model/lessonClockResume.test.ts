// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeLessonClockResume } from "./lessonClockResume";

let unsubscribe: (() => void) | undefined;
afterEach(() => { unsubscribe?.(); unsubscribe = undefined; vi.restoreAllMocks(); });
const fire = (type: string) => window.dispatchEvent(new Event(type));

describe("lesson clock resume", () => {
  it("keeps the existing clock anchor when focus moves between an iframe and its lesson toolbar", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const resume = vi.fn(); unsubscribe = subscribeLessonClockResume(resume);
    for (let i = 0; i < 3; i++) { fire("blur"); fire("focus"); }
    expect(resume).not.toHaveBeenCalled();
  });
  it("refreshes once after actual window focus loss and when mounted while unfocused", () => {
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const resume = vi.fn(); unsubscribe = subscribeLessonClockResume(resume);
    focus.mockReturnValue(true); fire("focus");
    expect(resume).toHaveBeenCalledTimes(1);
    focus.mockReturnValue(false); fire("blur"); focus.mockReturnValue(true); fire("focus"); fire("focus");
    expect(resume).toHaveBeenCalledTimes(2);
  });
  it("retains tab, page and network resume while deduplicating the following focus", () => {
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const resume = vi.fn(); unsubscribe = subscribeLessonClockResume(resume);
    focus.mockReturnValue(false); fire("blur"); document.dispatchEvent(new Event("visibilitychange"));
    expect(resume).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); focus.mockReturnValue(true); fire("focus");
    expect(resume).toHaveBeenCalledTimes(1);
    fire("pageshow"); fire("online");
    expect(resume).toHaveBeenCalledTimes(3);
  });
  it("detaches listeners on lesson exit", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const resume = vi.fn(); unsubscribe = subscribeLessonClockResume(resume); unsubscribe();
    fire("blur"); fire("focus"); fire("pageshow"); fire("online"); document.dispatchEvent(new Event("visibilitychange"));
    expect(resume).not.toHaveBeenCalled();
  });
});
