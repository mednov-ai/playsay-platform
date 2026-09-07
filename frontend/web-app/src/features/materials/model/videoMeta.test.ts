import { describe, expect, it } from "vitest";
import { normalizeMaterialVideoMeta, parseMaterialVideoDuration } from "./videoMeta";

describe("full video duration", () => {
  it.each(["0", "-1", "1.5", "1,5", "3:60", "3:7", "Infinity", "", "4294967416"])("rejects %s without rounding or overflow", (source) => {
    expect(parseMaterialVideoDuration(source)).toBeUndefined();
  });
  it.each([["3:42", 222], ["7:00", 420], ["7:01", 421], ["180", 180], ["1:02:03", 3723]] as const)("parses %s as full duration", (source, seconds) => {
    expect(parseMaterialVideoDuration(source)).toBe(seconds);
  });
  it("keeps partial metadata without inventing a confirmation", () => {
    expect(normalizeMaterialVideoMeta({ durationSeconds: 180 })).toEqual({ durationSeconds: 180 });
    expect(normalizeMaterialVideoMeta({ durationSeconds: 4294967416, language: "en" })).toEqual({ language: "en" });
    expect(normalizeMaterialVideoMeta({ durationSeconds: 0 })).toBeUndefined();
  });
});
