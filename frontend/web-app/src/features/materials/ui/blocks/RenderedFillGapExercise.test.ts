// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MaterialEditorBlock, MaterialExerciseItem } from "../../model/materialDocument";
import {
  materialAttemptBarRedPercent,
  materialAttemptBarVisible,
  materialHintForExerciseItem,
  materialManualInputHintLimit,
  materialManualInputHintValue,
} from "../../model/materialDocument";
import { RenderedFillGapExercise } from "./RenderedFillGapExercise";

vi.hoisted(() => {
  const values = new Map<string, string>([["playsay.language", "ru"]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

afterEach(cleanup);

describe("RenderedFillGapExercise hints", () => {
  it("reveals manual fill gap hints by configured answer proportions", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Gerunds",
      assessment: { hintCount: 3, hintPenalty: 0.15 },
    } as MaterialEditorBlock;
    const item: MaterialExerciseItem = {
      id: "item-going",
      prompt: "I don't enjoy ␣ to the cinema.",
      answer: "going",
    };

    expect(materialHintForExerciseItem(item, block, 1).value).toBe("go");
    expect(materialHintForExerciseItem(item, block, 2).value).toBe("goin");
    expect(materialHintForExerciseItem(item, block, 3).value).toBe("going");
  });

  it("starts typed fill gap hints from the selected one or two letter prefix", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Gerunds",
      assessment: { hintCount: 3, hintPenalty: 0.15 },
    } as MaterialEditorBlock;

    expect(materialHintForExerciseItem({
      id: "item-g",
      prompt: "I don't enjoy ␣ to the cinema.",
      answer: "going",
      hintPrefixLength: 1,
    }, block, 1).value).toBe("g");
    expect(materialHintForExerciseItem({
      id: "item-go",
      prompt: "I don't enjoy ␣ to the cinema.",
      answer: "going",
      hintPrefixLength: 2,
    }, block, 1).value).toBe("go");
    expect(materialHintForExerciseItem({
      id: "item-go",
      prompt: "I don't enjoy ␣ to the cinema.",
      answer: "going",
      hintPrefixLength: 2,
    }, block, 2).value).toBe("goin");
    expect(materialHintForExerciseItem({
      id: "item-go",
      prompt: "I don't enjoy ␣ to the cinema.",
      answer: "going",
      hintPrefixLength: 2,
    }, block, 3).value).toBe("going");
  });

  it("caps manual fill gap hint count by answer length", () => {
    expect(materialManualInputHintLimit("cat", 5)).toBe(3);
    expect(materialManualInputHintLimit("planet", 5)).toBe(4);
    expect(materialManualInputHintLimit("learning", 5)).toBe(5);
    expect(materialManualInputHintValue("learning", 1, 5)).toBe("le");
    expect(materialManualInputHintValue("learning", 3, 5)).toBe("learn");
    expect(materialManualInputHintValue("learning", 5, 5)).toBe("learning");
  });

  it("uses per-item hint limits over block-level fill gap settings", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Gerunds",
      assessment: { hintCount: 5, hintPenalty: 1 },
    } as MaterialEditorBlock;
    const item: MaterialExerciseItem = {
      id: "item-learning",
      prompt: "She keeps ␣ English.",
      answer: "learning",
      hintCount: 4,
    };

    expect(materialHintForExerciseItem(item, block, 1).penalty).toBe(0.15);
    expect(materialHintForExerciseItem(item, block, 4).value).toBe("learning");
    expect(materialHintForExerciseItem(item, block, 5).value).toBe("learning");
    expect(materialHintForExerciseItem(item, block, 5).type).toBe("fullAnswer");
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
    }, 5)).toBeCloseTo(40, 1);
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

  it("publishes a word-bank selection and its applied answer", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Weather",
      items: [{
        id: "gap-cloud",
        prompt: "I see a ␣.",
        answer: "cloud",
        answerOptionId: "bank-cloud",
        gapMode: "wordBank",
      }],
      wordBankOptions: [
        { id: "bank-cloud", value: "cloud" },
        { id: "bank-rain", value: "rain" },
      ],
    } as MaterialEditorBlock;
    const onAnswerChange = vi.fn();
    const onInteractionChange = vi.fn();
    const { container } = render(createElement(RenderedFillGapExercise, {
      block,
      onAnswerChange,
      onInteractionChange,
    }));

    fireEvent.click(container.querySelectorAll<HTMLButtonElement>(".playsay-word-bank-chip")[0]!);
    expect(onInteractionChange).toHaveBeenLastCalledWith({
      blockId: "block-gaps",
      kind: "wordBankDrag",
      optionId: "bank-cloud",
    });

    fireEvent.click(container.querySelector<HTMLButtonElement>(".playsay-word-bank-drop")!);
    expect(onAnswerChange).toHaveBeenCalledWith("block-gaps", expect.objectContaining({
      items: { "gap-cloud": "cloud" },
      optionIds: { "gap-cloud": "bank-cloud" },
      type: "fillGaps",
    }));
    expect(onInteractionChange).toHaveBeenLastCalledWith(null);
  });

  it("highlights the remote word and target gap with the participant color", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Weather",
      items: [{
        id: "gap-cloud",
        prompt: "I see a ␣.",
        answer: "cloud",
        answerOptionId: "bank-cloud",
        gapMode: "wordBank",
      }],
      wordBankOptions: [{ id: "bank-cloud", value: "cloud" }],
    } as MaterialEditorBlock;
    const markup = renderToStaticMarkup(createElement(RenderedFillGapExercise, {
      block,
      participants: [{
        clientId: 7,
        color: "#2574ff",
        interaction: {
          blockId: "block-gaps",
          kind: "wordBankDrag",
          optionId: "bank-cloud",
          targetItemKey: "gap-cloud",
        },
        name: "Student",
      }],
    }));

    expect(markup.match(/data-live-active="true"/g)).toHaveLength(2);
    expect(markup).toContain("--playsay-live-color:#2574ff");
    expect(markup).toContain("Student");
  });

  it("renders form transform base form as a placeholder and reveals a key after failed attempts", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Verb forms",
      assessment: { maxAttempts: 2 },
      items: [
        {
          id: "form-study",
          prompt: "Sam ␣ right now.",
          baseForm: "not study",
          answer: "isn't studying",
          acceptedAnswers: ["is not studying"],
          gapMode: "formTransform",
        },
      ],
    } as MaterialEditorBlock;
    const answer = {
      type: "fillGaps",
      items: { "form-study": "not studies" },
      attempts: {
        "form-study": [
          { at: "2026-05-31T00:00:00.000Z", value: "not study", correct: false },
          { at: "2026-05-31T00:01:00.000Z", value: "not studies", correct: false },
        ],
      },
    };

    const initialMarkup = renderToStaticMarkup(createElement(RenderedFillGapExercise, { block }));
    const failedMarkup = renderToStaticMarkup(createElement(RenderedFillGapExercise, { answer, block }));

    expect(initialMarkup).toContain('placeholder="not study"');
    expect(initialMarkup).toContain('value=""');
    expect(initialMarkup).not.toContain('value="not study"');
    expect(initialMarkup).toContain('data-input-mode="formTransform"');
    expect(initialMarkup).toContain('data-control-mode="formTransform"');
    expect(initialMarkup).toContain("--playsay-gap-chars:16");
    expect(failedMarkup).toContain("playsay-answer-reveal");
  });

  it("uses per-item max attempts for form transform answer key visibility", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Verb forms",
      assessment: { maxAttempts: 1 },
      items: [
        {
          id: "form-study",
          prompt: "Sam ␣ right now.",
          baseForm: "study",
          answer: "is studying",
          gapMode: "formTransform",
          maxAttempts: 2,
        },
      ],
    } as MaterialEditorBlock;
    const answer = {
      type: "fillGaps",
      items: { "form-study": "studies" },
      attempts: {
        "form-study": [
          { at: "2026-05-31T00:00:00.000Z", value: "studies", correct: false },
        ],
      },
    };

    const markup = renderToStaticMarkup(createElement(RenderedFillGapExercise, { answer, block }));

    expect(markup).not.toContain("playsay-answer-reveal");
    expect(markup).toContain("Ошибок 1 из 2");
  });

  it("sizes form transform input from the entered long answer instead of the compact fill gap cap", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Verb forms",
      items: [
        {
          id: "form-study",
          prompt: "Sam ␣ right now.",
          baseForm: "study",
          answer: "is studying",
          gapMode: "formTransform",
        },
      ],
    } as MaterialEditorBlock;
    const answer = {
      type: "fillGaps",
      items: { "form-study": "has not been studying" },
    };

    const markup = renderToStaticMarkup(createElement(RenderedFillGapExercise, { answer, block }));

    expect(markup).toContain("--playsay-gap-chars:22");
  });

  it("keeps short form transform answers wide enough for the answer and inline controls", () => {
    const block = {
      id: "block-gaps",
      type: "fillGaps",
      title: "Verb forms",
      items: [
        {
          id: "form-go",
          prompt: "I am ␣ to the airport.",
          baseForm: "go",
          answer: "going",
          gapMode: "formTransform",
        },
      ],
    } as MaterialEditorBlock;
    const answer = {
      type: "fillGaps",
      items: { "form-go": "going" },
    };

    const markup = renderToStaticMarkup(createElement(RenderedFillGapExercise, { answer, block }));

    expect(markup).toContain("--playsay-gap-chars:10");
  });
});
