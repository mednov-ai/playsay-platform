import { describe, expect, it } from "vitest";
import { validatedReturnTarget, vocabularySessionIdFromLocation } from "./KeyboardTrainerShell";

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
});
