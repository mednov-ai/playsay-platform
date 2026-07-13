import { describe, expect, it } from "vitest";
import type { TranslationSuggestion } from "../../../shared/api/playsay";
import { normalizedVariants } from "./VocabularyQuickAdd";

describe("normalizedVariants", () => {
  it("keeps all translation and usage variants returned by the current API", () => {
    const variants = [
      { translation: "бронировать", partOfSpeech: "verb", example: "Book a room." },
      { translation: "книга", partOfSpeech: "noun", example: "Read a book." },
    ];

    expect(normalizedVariants({ ...variants[0], variants, source: "OPENAI" })).toEqual(variants);
  });

  it("keeps the add dialog compatible with the previous single-translation response during rollout", () => {
    const legacySuggestion = {
      translation: "книга",
      partOfSpeech: "noun",
      example: "Read a book.",
      exampleTranslation: "Прочитай книгу.",
      source: "OPENAI",
    } as TranslationSuggestion;

    expect(normalizedVariants(legacySuggestion)).toEqual([{
      translation: "книга",
      partOfSpeech: "noun",
      example: "Read a book.",
      exampleTranslation: "Прочитай книгу.",
    }]);
  });
});
