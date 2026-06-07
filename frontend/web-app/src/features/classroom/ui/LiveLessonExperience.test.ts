import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classroomViewportModeFromSnapshot,
  effectiveClassroomViewportMode,
  requestClassroomFullscreen,
  shouldShowLessonWorkspace,
} from "./LiveLessonExperience";

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

  it("keeps teachers in desktop classroom layout even on narrow touch viewports", () => {
    expect(effectiveClassroomViewportMode("mobilePortrait", true)).toBe("desktop");
    expect(effectiveClassroomViewportMode("mobileLandscape", true)).toBe("desktop");
  });

  it("hides lesson workspace from mobile students while keeping desktop student work visible", () => {
    expect(shouldShowLessonWorkspace({
      canManageLesson: false,
      videoOnly: false,
      viewportMode: "mobilePortrait",
    })).toBe(false);
    expect(shouldShowLessonWorkspace({
      canManageLesson: false,
      videoOnly: false,
      viewportMode: "mobileLandscape",
    })).toBe(false);
    expect(shouldShowLessonWorkspace({
      canManageLesson: false,
      videoOnly: false,
      viewportMode: "desktop",
    })).toBe(true);
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

  it("requests webkit fullscreen for the classroom shell when standard fullscreen is unavailable", async () => {
    const webkitRequestFullscreen = vi.fn();
    const shell = {
      webkitRequestFullscreen,
      querySelector: vi.fn(),
    } as unknown as HTMLElement;

    await expect(requestClassroomFullscreen(shell)).resolves.toBe(true);

    expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to native video fullscreen because it hides classroom controls and participants", async () => {
    const webkitEnterFullscreen = vi.fn();
    const shell = {
      querySelector: vi.fn(() => ({ webkitEnterFullscreen })),
    } as unknown as HTMLElement;

    await expect(requestClassroomFullscreen(shell)).resolves.toBe(false);

    expect(webkitEnterFullscreen).not.toHaveBeenCalled();
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
