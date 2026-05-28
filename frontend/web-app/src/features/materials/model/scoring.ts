import type { LessonMaterial, LessonMaterialJson } from "../../../shared/api/playsay";
import {
  materialAnswerAttempts,
  materialAnswerHints,
  materialAnswerItems,
  materialAnswerMatches,
} from "./answers";
import { editorDocumentFromJson } from "./documentSerde";
import { asJsonObject, asNumber, clampNumber } from "./formatters";
import type {
  MaterialAnswerState,
  MaterialAnswerStatus,
  MaterialAssessmentPolicy,
  MaterialAttemptEntry,
  MaterialEditorBlock,
  MaterialExerciseItem,
  MaterialHintEntry,
} from "./types";

export function defaultObjectiveAssessmentPolicy(): MaterialAssessmentPolicy {
  return {
    weight: 1,
    maxAttempts: 3,
    attemptPenalty: 0.3,
    hintPenalty: 0.15,
    lockAfterAttempts: true,
  };
}

export function cleanMaterialAssessment(value: MaterialAssessmentPolicy): MaterialAssessmentPolicy {
  return {
    weight: clampNumber(value.weight ?? 1, 0.1, 20),
    maxAttempts: Math.round(clampNumber(value.maxAttempts ?? 3, 1, 10)),
    attemptPenalty: clampNumber(value.attemptPenalty ?? 0.3, 0, 1),
    hintPenalty: clampNumber(value.hintPenalty ?? 0.15, 0, 1),
    lockAfterAttempts: value.lockAfterAttempts ?? true,
  };
}

export function materialMaxScore(rubric: LessonMaterialJson): number {
  const object = asJsonObject(rubric);
  const maxScore = asNumber(object.maxScore);
  if (maxScore !== null) {
    return maxScore;
  }

  const scale = asNumber(object.scale);
  return scale ?? 10;
}

export function materialAnswerContextForBlock(block: MaterialEditorBlock): LessonMaterialJson {
  const items = (block.items ?? []).map((item, index, allItems) => ({
    key: `${item.prompt}-${index}`,
    prompt: item.prompt,
    previousPrompt: allItems[index - 1]?.prompt ?? null,
    nextPrompt: allItems[index + 1]?.prompt ?? null,
    options: item.options ?? [],
  }));

  return {
    blockId: block.id,
    blockType: block.type,
    title: block.title,
    label: materialBlockContextLabel(block),
    body: block.body ?? null,
    prompt: block.prompt ?? null,
    items,
  };
}

export function materialItemAnswerMatches(item: MaterialExerciseItem | undefined, value: string): boolean {
  const expected = normalizeScoredMaterialAnswer(item?.answer);
  if (!expected || !value.trim()) {
    return false;
  }
  return normalizeScoredMaterialAnswer(value) === expected;
}

export function materialAnswerStatus(
  item: MaterialExerciseItem,
  value: string | undefined,
  attempts: MaterialAttemptEntry[] | undefined,
  hints: MaterialHintEntry[],
  policy?: MaterialAssessmentPolicy,
  requiresExplicitCheck = false,
): MaterialAnswerStatus {
  const cleanPolicy = cleanMaterialAssessment(policy ?? defaultObjectiveAssessmentPolicy());
  const cleanValue = value?.trim() ?? "";
  const currentAttempts = attempts ?? [];
  const latestAttempt = currentAttempts[currentAttempts.length - 1];
  const currentValueChecked = Boolean(cleanValue && latestAttempt?.value.trim() === cleanValue);
  const checkedByPolicy = !requiresExplicitCheck || currentValueChecked;
  const maxAttempts = cleanPolicy.maxAttempts ?? 3;
  const attemptCount = currentAttempts.length || (!requiresExplicitCheck && cleanValue ? 1 : 0);
  const incorrectAttempts = currentAttempts.filter((attempt) => (
    attempt.correct === false || (attempt.correct !== true && !materialItemAnswerMatches(item, attempt.value))
  )).length;
  const answerIsCorrect = materialItemAnswerMatches(item, cleanValue);
  const visibleCorrect = answerIsCorrect && checkedByPolicy;
  const locked = !visibleCorrect && cleanPolicy.lockAfterAttempts === true && incorrectAttempts >= maxAttempts;
  const baseStatus = {
    attemptsUsed: attemptCount,
    correct: false,
    incorrectAttempts,
    hintsUsed: hints.length,
    locked: false,
    maxAttempts,
  };

  if (!cleanValue) {
    return { ...baseStatus, kind: "empty", label: "Нет ответа" };
  }
  if (locked) {
    return { ...baseStatus, kind: "locked", label: "Попытки закончились", locked: true };
  }
  if (requiresExplicitCheck && !currentValueChecked) {
    return { ...baseStatus, kind: "draft", label: "Проверить" };
  }
  if (visibleCorrect && hints.length > 0) {
    return { ...baseStatus, correct: true, kind: "hint", label: "Ответ принят" };
  }
  if (visibleCorrect && incorrectAttempts > 0) {
    return { ...baseStatus, correct: true, kind: "retry", label: "Ответ принят" };
  }
  if (visibleCorrect) {
    return { ...baseStatus, correct: true, kind: "correct", label: "Ответ принят" };
  }
  return { ...baseStatus, kind: "wrong", label: `${Math.max(1, incorrectAttempts)} ошибка` };
}

export function materialLiveScore(material: LessonMaterial, answers: MaterialAnswerState): number | null {
  const document = editorDocumentFromJson(material.document, material.title);
  let touchedWeight = 0;
  let earnedWeight = 0;

  document.pages.forEach((page) => {
    page.blocks.forEach((block) => {
      const answerBlock = answers[block.id];

      if (block.type === "fillGaps" || block.type === "multipleChoice") {
        const answerItems = materialAnswerItems(answerBlock);
        const attempts = materialAnswerAttempts(answerBlock);
        const hints = materialAnswerHints(answerBlock);

        (block.items ?? []).forEach((item, index) => {
          if (!item.answer?.trim()) {
            return;
          }

          const itemKey = `${item.prompt}-${index}`;
          const actual = answerItems[itemKey] ?? "";
          const itemAttempts = attempts[itemKey] ?? [];
          const itemHints = hints[itemKey] ?? [];
          const isManualInput = (item.options ?? []).length === 0;
          const checkedManualValue = itemAttempts.some((attempt) => (
            normalizeScoredMaterialAnswer(attempt.value) === normalizeScoredMaterialAnswer(actual)
          ));
          const touched = itemAttempts.length > 0 || itemHints.length > 0 || (!isManualInput && actual.trim().length > 0);

          if (!touched) {
            return;
          }

          const policy = materialAssessmentForItem(block, item);
          const correct = materialItemAnswerMatches(item, actual) && (!isManualInput || checkedManualValue);
          const attemptsUsed = itemAttempts.length || (actual.trim() ? 1 : 0);
          const scoreFactor = materialLiveScoreFactor(correct, attemptsUsed, itemHints, policy);

          touchedWeight += policy.weight ?? 1;
          earnedWeight += (policy.weight ?? 1) * scoreFactor;
        });
        return;
      }

      if (block.type === "matchingPairs") {
        const matches = materialAnswerMatches(answerBlock);
        const attempts = materialAnswerAttempts(answerBlock);
        const hints = materialAnswerHints(answerBlock);

        (block.pairs ?? []).forEach((pair) => {
          const actual = matches[pair.id] ?? "";
          const itemAttempts = attempts[pair.id] ?? [];
          const itemHints = hints[pair.id] ?? [];
          const touched = itemAttempts.length > 0 || itemHints.length > 0 || actual.trim().length > 0;

          if (!touched) {
            return;
          }

          const policy = materialAssessmentForItem(block);
          const correct = actual === pair.id;
          const attemptsUsed = itemAttempts.length || (actual.trim() ? 1 : 0);
          const scoreFactor = materialLiveScoreFactor(correct, attemptsUsed, itemHints, policy);

          touchedWeight += policy.weight ?? 1;
          earnedWeight += (policy.weight ?? 1) * scoreFactor;
        });
      }
    });
  });

  if (touchedWeight <= 0) {
    return null;
  }

  const maxScore = materialMaxScore(material.scoringRubric);
  return Math.round((maxScore * earnedWeight / touchedWeight) * 100) / 100;
}

export function materialAssessmentForItem(
  block: MaterialEditorBlock,
  item?: NonNullable<MaterialEditorBlock["items"]>[number],
): MaterialAssessmentPolicy {
  return cleanMaterialAssessment({
    ...defaultObjectiveAssessmentPolicy(),
    ...block.assessment,
    weight: item?.weight ?? block.assessment?.weight ?? defaultObjectiveAssessmentPolicy().weight,
  });
}

export function materialLiveScoreFactor(
  correct: boolean,
  attemptsUsed: number,
  hints: MaterialHintEntry[],
  policy: MaterialAssessmentPolicy,
): number {
  if (!correct) {
    return 0;
  }

  const attemptPenalty = policy.attemptPenalty ?? 0.3;
  const hintPenalty = policy.hintPenalty ?? 0.15;
  const attemptFactor = Math.max(1 - attemptPenalty * Math.max(0, attemptsUsed - 1), 0.4);
  const hintFactor = Math.max(1 - hints.reduce((total, hint) => total + (hint.penalty ?? hintPenalty), 0), 0.4);

  return clampNumber(Math.min(attemptFactor, hintFactor), 0, 1);
}

export function materialMatchingStatus(
  leftId: string,
  value: string | undefined,
  attempts: MaterialAttemptEntry[] | undefined,
  policy?: MaterialAssessmentPolicy,
): MaterialAnswerStatus["kind"] {
  const cleanPolicy = cleanMaterialAssessment(policy ?? defaultObjectiveAssessmentPolicy());
  const incorrectAttempts = attempts?.filter((attempt) => attempt.correct === false).length ?? 0;
  if (!value) {
    return "empty";
  }
  if (value === leftId) {
    return incorrectAttempts > 0 ? "retry" : "correct";
  }
  if (cleanPolicy.lockAfterAttempts === true && incorrectAttempts >= (cleanPolicy.maxAttempts ?? 3)) {
    return "locked";
  }
  return "wrong";
}

export function materialBlockContextLabel(block: MaterialEditorBlock): string {
  const parts = [
    `block:${block.type}`,
    `title:${block.title}`,
    block.body ? `body:${block.body}` : "",
    block.prompt ? `prompt:${block.prompt}` : "",
    ...(block.items ?? []).map((item, index) => `item${index + 1}:${item.prompt}`),
  ].filter(Boolean);
  return parts.join(" | ").slice(0, 900);
}

function normalizeScoredMaterialAnswer(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (["no article", "no article needed", "zero article", "нет артикля"].includes(normalized)) {
    return "-";
  }
  return normalized;
}
