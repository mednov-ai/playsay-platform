import { describe, expect, it } from "vitest";
import { teacherTaskVisibilityAfterLiveUpload, teacherTaskVisibilityAfterSharedGame } from "./LessonWorkspace";

describe("lesson workspace live upload visibility", () => {
  it("opens the teacher task after the first live page and keeps it open", () => {
    expect(teacherTaskVisibilityAfterLiveUpload(false, true, "page-image")).toBe(true);
    expect(teacherTaskVisibilityAfterLiveUpload(true, true, null)).toBe(true);
  });

  it("does not expose teacher-only task controls to students", () => {
    expect(teacherTaskVisibilityAfterLiveUpload(false, false, "page-image")).toBe(false);
  });

  it("opens the hidden teacher task when a student presents a shared game", () => {
    expect(teacherTaskVisibilityAfterSharedGame(false, true, "game-1")).toBe(true);
    expect(teacherTaskVisibilityAfterSharedGame(false, false, "game-1")).toBe(false);
    expect(teacherTaskVisibilityAfterSharedGame(true, true, null)).toBe(true);
  });
});
