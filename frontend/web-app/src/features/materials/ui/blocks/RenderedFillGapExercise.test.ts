import { describe, expect, it } from "vitest";
import type { MaterialEditorBlock, MaterialExerciseItem } from "../../model/materialDocument";
import {
  materialAttemptBarRedPercent,
  materialAttemptBarVisible,
  materialHintForExerciseItem,
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
});
