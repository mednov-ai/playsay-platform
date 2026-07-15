import { describe, expect, it } from "vitest";
import { appendTranscriptDelta, translationCollisionWinner } from "./realtimeTranslation";

describe("realtime lesson translation", () => {
  it("gives the teacher priority when both participants press at once", () => {
    expect(translationCollisionWinner("teacher", "student")).toBe("local");
    expect(translationCollisionWinner("student", "teacher")).toBe("incoming");
  });

  it("appends provider transcript deltas without inserting spaces", () => {
    const first = appendTranscriptDelta([], "turn-1", "Guten");
    const second = appendTranscriptDelta(first, "turn-1", " Tag");

    expect(second).toEqual([{ id: "turn-1", text: "Guten Tag" }]);
  });

  it("keeps only the three latest translated utterances in memory", () => {
    const captions = ["one", "two", "three", "four"].reduce(
      (current, text, index) => appendTranscriptDelta(current, `turn-${index}`, text),
      [] as Array<{ id: string; text: string }>,
    );

    expect(captions.map(({ text }) => text)).toEqual(["two", "three", "four"]);
  });
});
