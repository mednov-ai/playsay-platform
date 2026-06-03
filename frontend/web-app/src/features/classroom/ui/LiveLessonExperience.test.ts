import { afterEach, describe, expect, it, vi } from "vitest";
import { classroomViewportModeFromSnapshot, requestClassroomFullscreen } from "./LiveLessonExperience";

describe("classroomViewportMode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats phone portrait as mobile portrait", () => {
    expect(classroomViewportModeFromSnapshot(viewportSnapshot(390, 844))).toBe("mobilePortrait");
  });

  it("treats phone landscape as mobile landscape", () => {
    expect(classroomViewportModeFromSnapshot(viewportSnapshot(844, 390))).toBe("mobileLandscape");
  });

  it("treats iPhone Safari landscape as mobile landscape when orientation media query lags", () => {
    expect(classroomViewportModeFromSnapshot({
      ...viewportSnapshot(980, 414),
      landscapeQueryMatches: false,
    })).toBe("mobileLandscape");
  });

  it("keeps tall narrow desktop and tablet resizes in desktop mode", () => {
    expect(classroomViewportModeFromSnapshot(viewportSnapshot(920, 820))).toBe("desktop");
  });

  it("keeps short desktop browser resizes in desktop mode without a coarse pointer", () => {
    expect(classroomViewportModeFromSnapshot({
      ...viewportSnapshot(920, 600),
      coarsePointer: false,
    })).toBe("desktop");
  });

  it("requests browser fullscreen for the classroom shell when supported", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const shell = {
      requestFullscreen,
      querySelector: vi.fn(),
    } as unknown as HTMLElement;

    await expect(requestClassroomFullscreen(shell)).resolves.toBe(true);

    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
  });

  it("falls back to native video fullscreen for iPhone Safari", async () => {
    const webkitEnterFullscreen = vi.fn();
    const shell = {
      querySelector: vi.fn(() => ({ webkitEnterFullscreen })),
    } as unknown as HTMLElement;

    await expect(requestClassroomFullscreen(shell)).resolves.toBe(true);

    expect(webkitEnterFullscreen).toHaveBeenCalledTimes(1);
  });
});

function viewportSnapshot(width: number, height: number) {
  const portrait = height >= width;

  return {
    coarsePointer: true,
    height,
    landscapeQueryMatches: !portrait && width <= 1024 && height <= 640,
    portraitQueryMatches: portrait && width <= 640,
    width,
  };
}
