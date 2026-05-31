import type { LessonMaterial, LessonMaterialJson } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import {
  materialAnswerAttempts,
  materialAnswerHints,
  materialAnswerItems,
  materialAnswerOptionIds,
  materialAnswerMatches,
} from "./answers";
import { editorDocumentFromJson } from "./documentSerde";
import { asJsonObject, asNumber, clampNumber, isMaterialNormalizationTerm, materialFillGapMode } from "./formatters";
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
    hintCount: 3,
    hintPenalty: 0.15,
    lockAfterAttempts: true,
  };
}

export const DEFAULT_FILL_GAP_MAX_ATTEMPTS = 5;
export const DEFAULT_FILL_GAP_MAX_ERRORS = 3;

export function cleanMaterialAssessment(value: MaterialAssessmentPolicy): MaterialAssessmentPolicy {
  return {
    weight: clampNumber(value.weight ?? 1, 0.1, 20),
    maxAttempts: Math.round(clampNumber(value.maxAttempts ?? 3, 1, 10)),
    maxErrors: Math.round(clampNumber(value.maxErrors ?? value.maxAttempts ?? 3, 1, 10)),
    attemptPenalty: clampNumber(value.attemptPenalty ?? 0.3, 0, 1),
    hintCount: Math.round(clampNumber(value.hintCount ?? 3, 3, 5)),
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
    answerOptionId: item.answerOptionId ?? null,
    key: materialExerciseItemKey(item, index),
    gapMode: item.gapMode ?? null,
    prompt: item.prompt,
    previousPrompt: allItems[index - 1]?.prompt ?? null,
    nextPrompt: allItems[index + 1]?.prompt ?? null,
    options: item.options ?? [],
    acceptedAnswers: item.acceptedAnswers ?? [],
  }));

  return {
    blockId: block.id,
    blockType: block.type,
    title: block.title,
    label: materialBlockContextLabel(block),
    body: block.body ?? null,
    prompt: block.prompt ?? null,
    items,
    wordBankOptions: block.wordBankOptions ?? [],
  };
}

export function materialItemAnswerMatches(item: MaterialExerciseItem | undefined, value: string, answerOptionId?: string): boolean {
  if (item?.gapMode === "wordBank" && item.answerOptionId) {
    return value.trim().length > 0 && answerOptionId === item.answerOptionId;
  }

  const expectedAnswers = materialAcceptedAnswersForItem(item);
  if (expectedAnswers.length === 0 || !value.trim()) {
    return false;
  }
  const normalizedValue = normalizeScoredMaterialAnswer(value);
  return expectedAnswers.some((expected) => normalizeScoredMaterialAnswer(expected) === normalizedValue);
}

export function materialAcceptedAnswersForItem(item: MaterialExerciseItem | undefined): string[] {
  const answers = [item?.answer, ...(item?.acceptedAnswers ?? [])]
    .map((answer) => answer?.trim() ?? "")
    .filter(Boolean);
  const seen = new Set<string>();
  return answers.filter((answer) => {
    const key = normalizeScoredMaterialAnswer(answer);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function materialExerciseItemKey(item: MaterialExerciseItem, index: number): string {
  return item.id?.trim() || `${item.prompt}-${index}`;
}

export function materialAnswerStatus(
  item: MaterialExerciseItem,
  value: string | undefined,
  attempts: MaterialAttemptEntry[] | undefined,
  hints: MaterialHintEntry[],
  policy?: MaterialAssessmentPolicy,
  requiresExplicitCheck = false,
  answerOptionId?: string,
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
    attempt.correct === false || (attempt.correct !== true && !materialItemAnswerMatches(item, attempt.value, attempt.optionId))
  )).length;
  const answerIsCorrect = materialItemAnswerMatches(item, cleanValue, answerOptionId);
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

  if (locked) {
    return { ...baseStatus, kind: "locked", label: i18n.t("materials.answerStatus.locked"), locked: true };
  }
  if (!cleanValue) {
    if (incorrectAttempts > 0) {
      return { ...baseStatus, kind: "wrong", label: i18n.t("materials.answerStatus.wrong", { count: incorrectAttempts }) };
    }
    if (hints.length > 0) {
      return { ...baseStatus, kind: "hint", label: i18n.t("materials.answerStatus.check") };
    }
    return { ...baseStatus, kind: "empty", label: i18n.t("materials.answerStatus.empty") };
  }
  if (requiresExplicitCheck && !currentValueChecked) {
    if (hints.length > 0) {
      return { ...baseStatus, kind: "hint", label: i18n.t("materials.answerStatus.check") };
    }
    return { ...baseStatus, kind: "draft", label: i18n.t("materials.answerStatus.check") };
  }
  if (visibleCorrect && hints.length > 0) {
    return { ...baseStatus, correct: true, kind: "hint", label: i18n.t("materials.answerStatus.accepted") };
  }
  if (visibleCorrect && incorrectAttempts > 0) {
    return { ...baseStatus, correct: true, kind: "retry", label: i18n.t("materials.answerStatus.accepted") };
  }
  if (visibleCorrect) {
    return { ...baseStatus, correct: true, kind: "correct", label: i18n.t("materials.answerStatus.accepted") };
  }
  return { ...baseStatus, kind: "wrong", label: i18n.t("materials.answerStatus.wrong", { count: Math.max(1, incorrectAttempts) }) };
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
        const answerOptionIds = materialAnswerOptionIds(answerBlock);
        const attempts = materialAnswerAttempts(answerBlock);
        const hints = materialAnswerHints(answerBlock);

        (block.items ?? []).forEach((item, index) => {
          if (!item.answer?.trim()) {
            return;
          }

          const itemKey = materialExerciseItemKey(item, index);
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
          const correct = materialItemAnswerMatches(item, actual, answerOptionIds[itemKey]) && (!isManualInput || checkedManualValue);
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
  if (block.type === "fillGaps") {
    return materialFillGapAssessmentForItem(block, item);
  }

  return cleanMaterialAssessment({
    ...defaultObjectiveAssessmentPolicy(),
    ...block.assessment,
    weight: item?.weight ?? block.assessment?.weight ?? defaultObjectiveAssessmentPolicy().weight,
  });
}

function materialFillGapAssessmentForItem(
  block: MaterialEditorBlock,
  item?: NonNullable<MaterialEditorBlock["items"]>[number],
): MaterialAssessmentPolicy {
  const defaults = defaultObjectiveAssessmentPolicy();
  const blockPolicy = cleanMaterialAssessment({
    ...defaults,
    ...block.assessment,
  });
  const mode = item ? materialFillGapMode(item) : "typed";
  const optionCount = Math.max(1, item?.options?.length ?? 0);
  const maxAttempts = mode === "singleChoice"
    ? optionCount
    : mode === "wordBank"
      ? Math.round(clampNumber(item?.maxErrors ?? block.assessment?.maxErrors ?? block.assessment?.maxAttempts ?? DEFAULT_FILL_GAP_MAX_ERRORS, 1, 10))
      : Math.round(clampNumber(item?.maxAttempts ?? block.assessment?.maxAttempts ?? DEFAULT_FILL_GAP_MAX_ATTEMPTS, 1, 10));

  return cleanMaterialAssessment({
    ...blockPolicy,
    weight: defaults.weight,
    maxAttempts,
    maxErrors: maxAttempts,
    hintCount: Math.round(clampNumber(item?.hintCount ?? block.assessment?.hintCount ?? defaults.hintCount ?? 3, 3, 5)),
    attemptPenalty: defaults.attemptPenalty,
    hintPenalty: defaults.hintPenalty,
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
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]+/g, "")
    .replace(/\s+/g, " ") ?? "";
  if (isMaterialNormalizationTerm("noArticle", normalized)) {
    return "-";
  }
  return normalized;
}
