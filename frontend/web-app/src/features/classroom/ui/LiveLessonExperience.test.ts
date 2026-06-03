import { afterEach, describe, expect, it, vi } from "vitest";
import { classroomViewportMode } from "./LiveLessonExperience";

describe("classroomViewportMode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats phone portrait as mobile portrait", () => {
    stubMatchMedia(390, 844);

    expect(classroomViewportMode()).toBe("mobilePortrait");
  });

  it("treats phone landscape as mobile landscape", () => {
    stubMatchMedia(844, 390);

    expect(classroomViewportMode()).toBe("mobileLandscape");
  });

  it("keeps tall narrow desktop and tablet resizes in desktop mode", () => {
    stubMatchMedia(920, 820);

    expect(classroomViewportMode()).toBe("desktop");
  });
});

function stubMatchMedia(width: number, height: number) {
  vi.stubGlobal("window", {
    matchMedia: (query: string): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: matchesMediaQuery(query, width, height),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  });
}

function matchesMediaQuery(query: string, width: number, height: number): boolean {
  const maxWidth = Number(query.match(/max-width:\s*(\d+)px/)?.[1] ?? Infinity);
  const maxHeight = Number(query.match(/max-height:\s*(\d+)px/)?.[1] ?? Infinity);
  const orientation = query.match(/orientation:\s*(portrait|landscape)/)?.[1];

  return width <= maxWidth &&
    height <= maxHeight &&
    (orientation === undefined ||
      (orientation === "portrait" ? height >= width : width >= height));
}
