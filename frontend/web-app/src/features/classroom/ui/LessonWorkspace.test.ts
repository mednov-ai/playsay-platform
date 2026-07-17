import { describe, expect, it } from "vitest";
import { teacherTaskVisibilityAfterLiveUpload } from "./LessonWorkspace";

describe("lesson workspace live upload visibility", () => {
  it("opens the teacher task after the first live page and keeps it open", () => {
    expect(teacherTaskVisibilityAfterLiveUpload(false, true, "page-image")).toBe(true);
    expect(teacherTaskVisibilityAfterLiveUpload(true, true, null)).toBe(true);
  });

  it("does not expose teacher-only task controls to students", () => {
    expect(teacherTaskVisibilityAfterLiveUpload(false, false, "page-image")).toBe(false);
  });
});
