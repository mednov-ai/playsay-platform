// @vitest-environment jsdom
import { createElement } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TranslationSuggestion } from "../../../shared/api/playsay";
import { normalizedVariants, VocabularyQuickAdd } from "./VocabularyQuickAdd";

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

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

describe("VocabularyQuickAdd accessibility", () => {
  it("uses existing localized keys for the dialog and close action names", () => {
    const { getByRole } = render(createElement(VocabularyQuickAdd, {
      children: createElement("span", null, "Selection"),
      source: { sourceType: "MANUAL" },
    }));

    fireEvent.click(getByRole("button", { name: "vocabulary.actions.add" }));

    expect(getByRole("dialog", { name: "vocabulary.quickAdd.title" })).toBeTruthy();
    expect(getByRole("button", { name: "common.actions.close" })).toBeTruthy();
  });
});
