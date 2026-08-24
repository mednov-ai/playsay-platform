import { describe, expect, it } from "vitest";
import { isUsableVocabularySessionPractice, validatedReturnTarget, vocabularySessionIdFromLocation } from "./KeyboardTrainerShell";

describe("vocabulary launch boundary", () => {
  it("accepts only UUID session launches", () => {
    expect(vocabularySessionIdFromLocation("?vocabularySessionId=11111111-1111-4111-a111-111111111111")).toBe("11111111-1111-4111-a111-111111111111");
    expect(vocabularySessionIdFromLocation("?vocabularySessionId=foreign-script")).toBeNull();
  });

  it("allows Honey School and local return targets while rejecting credentials, scripts and foreign hosts", () => {
    expect(validatedReturnTarget(`?returnTo=${encodeURIComponent("https://online.honey.school/homework")}`)).toBe("https://online.honey.school/homework");
    expect(validatedReturnTarget(`?returnTo=${encodeURIComponent("http://localhost:5173/lesson")}`)).toBe("http://localhost:5173/lesson");
    expect(validatedReturnTarget(`?returnTo=${encodeURIComponent("https://evil.example/steal")}`)).toBeNull();
    expect(validatedReturnTarget(`?returnTo=${encodeURIComponent("https://user:secret@online.honey.school/")}`)).toBeNull();
    expect(validatedReturnTarget(`?returnTo=${encodeURIComponent("javascript:alert(1)")}`)).toBeNull();
  });

  it("treats a targets-only successful snapshot as an activatable vocabulary launch", () => {
    expect(isUsableVocabularySessionPractice({
      sessionId: "11111111-1111-4111-a111-111111111111",
      title: "Vocabulary",
      entries: [],
      items: [],
      mode: "MIXED",
      targets: [{
        targetId: "22222222-2222-4222-a222-222222222222",
        position: 0,
        type: "CHARACTER_NGRAM",
        text: "ing",
        sourceEntryIds: [],
        sourceItemIds: [],
        offsets: [],
      }],
    })).toBe(true);
    expect(isUsableVocabularySessionPractice({
      sessionId: "11111111-1111-4111-a111-111111111111",
      title: "Vocabulary",
      entries: [],
      items: [],
      targets: [],
    })).toBe(false);
  });
});
