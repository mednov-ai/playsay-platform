import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MaterialEditorBlock, MaterialExerciseItem } from "../../model/materialDocument";
import {
  RenderedFillGapExercise,
  materialAttemptBarRedPercent,
  materialAttemptBarVisible,
  materialHintForExerciseItem,
  materialManualInputInlineHint,
} from "./RenderedFillGapExercise";

describe("RenderedFillGapExercise hints", () => {
  it("reveals manual fill gap hints one character at a time", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Gerunds",
      assessment: { hintPenalty: 0.15 },
    } as MaterialEditorBlock;
    const item: MaterialExerciseItem = {
      id: "item-going",
      prompt: "I don't enjoy ␣ to the cinema.",
      answer: "going",
    };

    expect(materialHintForExerciseItem(item, block, 1).value).toBe("g...");
    expect(materialHintForExerciseItem(item, block, 2).value).toBe("go...");
    expect(materialHintForExerciseItem(item, block, 3).value).toBe("goi...");
  });

  it("keeps the inline attempt bar visible while a penalized answer is being edited", () => {
    expect(materialAttemptBarVisible({
      attemptsUsed: 0,
      correct: false,
      hintsUsed: 0,
      incorrectAttempts: 0,
      kind: "empty",
      label: "Check",
      locked: false,
      maxAttempts: 3,
    })).toBe(true);

    expect(materialAttemptBarVisible({
      attemptsUsed: 1,
      correct: false,
      hintsUsed: 0,
      incorrectAttempts: 1,
      kind: "draft",
      label: "Check",
      locked: false,
      maxAttempts: 3,
    })).toBe(true);

    expect(materialAttemptBarRedPercent({
      attemptsUsed: 0,
      correct: false,
      hintsUsed: 2,
      incorrectAttempts: 0,
      kind: "hint",
      label: "Hint",
      locked: false,
      maxAttempts: 3,
    })).toBeCloseTo(66.67, 1);
  });

  it("keeps the latest manual hint visible next to an empty or partial answer", () => {
    const item: MaterialExerciseItem = {
      id: "item-going",
      prompt: "I don't enjoy ␣ to the cinema.",
      answer: "going",
    };
    const hints = [{
      at: "2026-05-30T00:00:00.000Z",
      label: "Hint 2: go...",
      penalty: 0.15,
      type: "partialAnswer" as const,
      value: "go...",
    }];

    expect(materialManualInputInlineHint(item, hints, "")).toBe("go...");
    expect(materialManualInputInlineHint(item, hints, "g")).toBe("o...");
    expect(materialManualInputInlineHint(item, hints, "go")).toBe("");
  });

  it("renders mixed fill gap modes as inline paragraph fragments", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Gerunds",
      items: [
        { id: "typed-going", prompt: "I do not enjoy ␣ to the cinema.", answer: "going" },
        { id: "choice-at", prompt: "We met ␣ the station.", answer: "at", gapMode: "singleChoice", options: ["in", "at", "on"] },
        { id: "bank-to", prompt: "Then we walked ␣ the park.", answer: "to", answerOptionId: "bank-to", gapMode: "wordBank" },
      ],
      wordBankOptions: [
        { id: "bank-to", value: "to" },
        { id: "bank-with", value: "with" },
      ],
    } as MaterialEditorBlock;

    const markup = renderToStaticMarkup(createElement(RenderedFillGapExercise, { block }));

    expect(markup).toContain("playsay-fill-paragraph");
    expect(markup.match(/playsay-answer-fragment/g)).toHaveLength(3);
    expect(markup.match(/playsay-answer-attempt-bar/g)).toHaveLength(3);
    expect(markup).toContain("playsay-inline-select");
    expect(markup).toContain("playsay-word-bank-drop");
    expect(markup).not.toContain("playsay-answer-row");
  });
});
