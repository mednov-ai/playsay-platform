import { type CSSProperties, type DragEvent, type KeyboardEvent, useMemo, useRef, useState } from "react";
import { CornerDownLeft, FileText, KeyRound } from "lucide-react";
import { i18n, useAppTranslation } from "../../../../shared/i18n";
import {
  MAX_MANUAL_INPUT_HINTS,
  MIN_MANUAL_INPUT_HINTS,
  appendMaterialAttempt,
  materialAssessmentForItem,
  materialAnswerAttempts,
  materialAnswerContextForBlock,
  materialAnswerHints,
  materialAnswerItems,
  materialAnswerOptionIds,
  materialAnswerStatus,
  materialExerciseItemKey,
  materialFillGapMode,
  materialHintPrefixLength,
  isMaterialNormalizationTerm,
  materialItemAnswerMatches,
  materialNormalizationTerms,
  materialWordBankUsedOptionIds,
  splitFillGapPrompt,
  type MaterialAnswerBlock,
  type MaterialAnswerStatus,
  type MaterialEditorBlock,
  type MaterialExerciseItem,
  type MaterialHintEntry,
} from "../../model/materialDocument";
import { MarkdownInline } from "../markdown/RenderedMarkdown";

export { appendMaterialAttempt } from "../../model/materialDocument";

export function RenderedFillGapExercise({
  answer,
  block,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const { t } = useAppTranslation();
  const answers = materialAnswerItems(answer);
  const answerOptionIds = materialAnswerOptionIds(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);
  const usedWordBankOptionIds = materialWordBankUsedOptionIds(answer);
  const wordBankItems = (block.items ?? []).filter((item) => materialFillGapMode(item) === "wordBank");
  const wordBankOptions = useMemo(() => materialFillGapWordBankOptions(block), [block]);
  const [selectedWordBankOptionId, setSelectedWordBankOptionId] = useState<string | null>(null);
  const [wrongFeedbackItemKey, setWrongFeedbackItemKey] = useState<string | null>(null);
  const [focusedManualItemKey, setFocusedManualItemKey] = useState<string | null>(null);
  const manualInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function updateItemValue(itemKey: string, value: string) {
    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: {
        ...answers,
        [itemKey]: value,
      },
      optionIds: omitMaterialAnswerKey(answerOptionIds, itemKey),
      attempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function checkItem(itemKey: string, value = answers[itemKey] ?? "", answerOptionId = answerOptionIds[itemKey]) {
    const item = (block.items ?? []).find((candidate, index) => materialExerciseItemKey(candidate, index) === itemKey);
    const correct = materialItemAnswerMatches(item, value, answerOptionId);
    const nextAttempts = appendMaterialAttempt(attempts, itemKey, value, correct, answerOptionId);
    if (!correct && item && ["typed", "formTransform"].includes(materialFillGapMode(item))) {
      setWrongFeedbackItemKey(itemKey);
      globalThis.setTimeout?.(() => setWrongFeedbackItemKey((current) => current === itemKey ? null : current), 360);
    }
    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: {
        ...answers,
        [itemKey]: value,
      },
      optionIds: answerOptionId ? { ...answerOptionIds, [itemKey]: answerOptionId } : omitMaterialAnswerKey(answerOptionIds, itemKey),
      attempts: nextAttempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function revealFormTransformAnswer(itemKey: string, item: MaterialExerciseItem) {
    const value = item.answer?.trim() ?? "";
    if (!value) {
      return;
    }
    const hint: MaterialHintEntry = {
      at: new Date().toISOString(),
      label: i18n.t("materials.renderer.answerKeyValue", { value }),
      penalty: 0,
      type: "answerKey",
      value,
    };
    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: {
        ...answers,
        [itemKey]: value,
      },
      optionIds: omitMaterialAnswerKey(answerOptionIds, itemKey),
      attempts: appendMaterialAttempt(attempts, itemKey, value, true),
      context: materialAnswerContextForBlock(block),
      hints: appendMaterialHint(hints, itemKey, hint),
    });
  }

  function requestHint(itemKey: string, item: MaterialExerciseItem) {
    const itemHints = hints[itemKey] ?? [];
    const itemPolicy = materialAssessmentForItem(block, item);
    const hintLimit = materialManualInputHintLimit(item.answer ?? "", itemPolicy.hintCount);
    const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, itemPolicy, true, answerOptionIds[itemKey]);
    if (!canRequestManualInputHint(item, itemHints, status, hintLimit)) {
      return;
    }

    const hint = materialHintForExerciseItem(item, block, itemHints.length + 1);
    const value = hint.value ?? "";
    const correct = materialItemAnswerMatches(item, value);
    const nextHints = appendMaterialHint(hints, itemKey, hint);
    const nextAttempts = correct
      ? appendMaterialAttempt(attempts, itemKey, value, true)
      : attempts;

    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: {
        ...answers,
        [itemKey]: value,
      },
      optionIds: omitMaterialAnswerKey(answerOptionIds, itemKey),
      attempts: nextAttempts,
      context: materialAnswerContextForBlock(block),
      hints: nextHints,
    });

    globalThis.requestAnimationFrame?.(() => {
      const input = manualInputRefs.current[itemKey];
      const cursor = value.length;
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    });
  }

  function assignWordBankOption(itemKey: string, item: MaterialExerciseItem, optionId: string) {
    const option = wordBankOptions.find((candidate) => candidate.id === optionId);
    if (!option || usedWordBankOptionIds.has(option.id)) {
      return;
    }

    const correct = materialItemAnswerMatches(item, option.value, option.id);
    const nextAttempts = appendMaterialAttempt(attempts, itemKey, option.value, correct, option.id);
    const nextItems = correct
      ? { ...answers, [itemKey]: option.value }
      : omitMaterialAnswerKey(answers, itemKey);
    const nextOptionIds = correct
      ? { ...answerOptionIds, [itemKey]: option.id }
      : omitMaterialAnswerKey(answerOptionIds, itemKey);

    setSelectedWordBankOptionId(null);
    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: nextItems,
      optionIds: nextOptionIds,
      attempts: nextAttempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function handleWordBankDrop(event: DragEvent<HTMLElement>, itemKey: string, item: MaterialExerciseItem) {
    event.preventDefault();
    const optionId = event.dataTransfer.getData("text/plain");
    if (optionId) {
      assignWordBankOption(itemKey, item, optionId);
    }
  }

  function handleManualInputKeyDown(event: KeyboardEvent<HTMLInputElement>, itemKey: string) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    checkItem(itemKey, event.currentTarget.value);
  }

  return (
    <div className="playsay-fill-exercise">
      {wordBankItems.length > 0 ? (
        <div className="playsay-word-bank" aria-label={t("materials.renderer.wordBankLabel")}>
          {wordBankOptions.map((option) => {
            const used = usedWordBankOptionIds.has(option.id);
            const selected = selectedWordBankOptionId === option.id;
            return (
              <button
                aria-pressed={selected}
                className="playsay-word-bank-chip"
                data-selected={selected || undefined}
                disabled={used}
                draggable={!used}
                key={option.id}
                onClick={() => setSelectedWordBankOptionId(selected ? null : option.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", option.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                title={used ? t("materials.renderer.wordBankOptionUsed", { value: option.value }) : t("materials.renderer.wordBankOptionTitle", { value: option.value })}
                type="button"
              >
                {option.value}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="playsay-fill-paragraph">
        {(block.items ?? []).map((item, index) => {
          const itemKey = materialExerciseItemKey(item, index);
          const gapMode = materialFillGapMode(item);
          const options = materialExerciseOptions(item, block);
          const isWordBank = gapMode === "wordBank";
          const isFormTransform = gapMode === "formTransform";
          const isManualInput = gapMode === "typed" && options.length === 0;
          const isManualLikeInput = isManualInput || isFormTransform;
          const hasCurrentAnswer = Object.prototype.hasOwnProperty.call(answers, itemKey);
          const currentAnswer = hasCurrentAnswer ? answers[itemKey] ?? "" : "";
          const inputAnswer = currentAnswer;
          const formTransformPlaceholder = isFormTransform && focusedManualItemKey !== itemKey ? item.baseForm ?? "" : "";
          const prompt = splitFillGapPrompt(item.prompt);
          const itemHints = hints[itemKey] ?? [];
          const itemPolicy = materialAssessmentForItem(block, item);
          const hintLimit = materialManualInputHintLimit(item.answer ?? "", itemPolicy.hintCount);
          const status = materialAnswerStatus(item, inputAnswer, attempts[itemKey], itemHints, itemPolicy, isManualLikeInput, answerOptionIds[itemKey]);
          const manualInputStyle = isManualLikeInput
            ? { "--playsay-gap-chars": materialManualInputVisualCharacters(longestMaterialInputText(inputAnswer, item.baseForm, item.answer, ...(item.acceptedAnswers ?? [])), "", isFormTransform ? 42 : 18, isFormTransform ? 10 : 4) } as CSSProperties
            : undefined;
          const canRequestHint = isManualInput && canRequestManualInputHint(item, itemHints, status, hintLimit);
          const canRevealAnswer = isFormTransform && Boolean(item.answer?.trim()) && !status.correct && status.incorrectAttempts >= status.maxAttempts;
          const selectedWordBankOption = selectedWordBankOptionId
            ? wordBankOptions.find((option) => option.id === selectedWordBankOptionId)
            : null;

          return (
            <span className="playsay-answer-fragment" data-input-mode={isWordBank ? "wordBank" : isFormTransform ? "formTransform" : isManualInput ? "manual" : "select"} data-status={status.kind} key={itemKey}>
              <label>
                {prompt.before ? <MarkdownInline value={prompt.before} /> : null}
                {isWordBank ? (
                  <span className="playsay-inline-answer-wrap">
                    <button
                      aria-label={answers[itemKey] ? t("materials.renderer.wordBankFilledGap", { value: answers[itemKey] }) : t("materials.renderer.wordBankEmptyGap", { number: index + 1 })}
                      className="playsay-word-bank-drop"
                      data-status={status.kind}
                      disabled={status.locked || status.correct}
                      onClick={() => {
                        if (selectedWordBankOption) {
                          assignWordBankOption(itemKey, item, selectedWordBankOption.id);
                        }
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleWordBankDrop(event, itemKey, item)}
                      title={selectedWordBankOption ? t("materials.renderer.wordBankPlaceSelected", { value: selectedWordBankOption.value }) : t("materials.renderer.wordBankDropTitle")}
                      type="button"
                    >
                      {answers[itemKey] || t("materials.renderer.wordBankGapPlaceholder")}
                    </button>
                    <MaterialAttemptBar hintLimit={hintLimit} status={status} />
                  </span>
                ) : options.length > 0 ? (
                  <span className="playsay-inline-answer-wrap">
                    <select
                      aria-label={t("materials.renderer.gapNumber", { number: index + 1 })}
                      className="playsay-inline-select"
                      data-status={status.kind}
                      disabled={status.locked || status.correct}
                      onChange={(event) => {
                        if (!event.target.value) {
                          return;
                        }
                        checkItem(itemKey, event.target.value);
                      }}
                      value={answers[itemKey] ?? ""}
                    >
                      <option disabled hidden value="">{t("materials.renderer.selectPlaceholder")}</option>
                      {options.map((option, optionIndex) => (
                        <option key={`${option}-${optionIndex}`} value={option}>{option}</option>
                      ))}
                    </select>
                    <MaterialAttemptBar hintLimit={hintLimit} status={status} />
                  </span>
                ) : (
                  <span className="playsay-inline-answer-wrap" data-control-mode={isFormTransform ? "formTransform" : "typed"}>
                    <span
                      className="playsay-inline-answer"
                      data-feedback={wrongFeedbackItemKey === itemKey ? "wrong" : undefined}
                      data-mode={isFormTransform ? "formTransform" : "typed"}
                      data-status={status.kind}
                      style={manualInputStyle}
                    >
                      <input
                        aria-label={t("materials.renderer.gapNumber", { number: index + 1 })}
                        disabled={status.correct || (!isFormTransform && status.locked)}
                        onChange={(event) => updateItemValue(itemKey, event.target.value)}
                        onBlur={() => setFocusedManualItemKey((current) => current === itemKey ? null : current)}
                        onFocus={() => setFocusedManualItemKey(itemKey)}
                        onKeyDown={(event) => handleManualInputKeyDown(event, itemKey)}
                        placeholder={formTransformPlaceholder}
                        ref={(node) => {
                          manualInputRefs.current[itemKey] = node;
                        }}
                        value={inputAnswer}
                      />
                      <button
                        aria-label={t("materials.renderer.checkAnswer")}
                        className="playsay-inline-check"
                        disabled={status.correct || (!isFormTransform && status.locked) || !inputAnswer.trim()}
                        onClick={() => checkItem(itemKey, inputAnswer)}
                        title={t("materials.renderer.checkAnswerTitle")}
                        type="button"
                      >
                        <CornerDownLeft className="h-3.5 w-3.5" />
                      </button>
                    </span>
                    <MaterialAttemptBar hintLimit={hintLimit} status={status} />
                    {canRevealAnswer ? (
                      <button
                        aria-label={t("materials.renderer.answerKey")}
                        className="playsay-answer-reveal"
                        onClick={() => revealFormTransformAnswer(itemKey, item)}
                        title={t("materials.renderer.answerKeyTitle")}
                        type="button"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <MaterialAnswerTools
                      canRequestHint={canRequestHint}
                      hintLimit={hintLimit}
                      onHint={() => requestHint(itemKey, item)}
                      status={status}
                    />
                  </span>
                )}
                {prompt.after ? <MarkdownInline value={prompt.after} /> : null}
              </label>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function omitMaterialAnswerKey(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

function longestMaterialInputText(...values: Array<string | undefined>): string {
  return values.reduce<string>((longest, value) => {
    const cleanValue = value?.trim() ?? "";
    return Array.from(cleanValue).length > Array.from(longest).length ? cleanValue : longest;
  }, "");
}

export function MaterialAnswerTools({
  canRequestHint,
  hintLimit = MAX_MANUAL_INPUT_HINTS,
  onHint,
  status,
}: {
  canRequestHint: boolean;
  hintLimit?: number;
  onHint: () => void;
  status: MaterialAnswerStatus;
}) {
  const { t } = useAppTranslation();
  const nextHintNumber = Math.min(status.hintsUsed + 1, hintLimit);
  if (!canRequestHint) {
    return null;
  }

  return (
    <span className="playsay-answer-tools">
      <button
        aria-label={t("materials.renderer.hintProgress", { current: nextHintNumber, total: hintLimit })}
        className="playsay-hint-button"
        onClick={onHint}
        title={t("materials.renderer.hintProgress", { current: nextHintNumber, total: hintLimit })}
        type="button"
      >
        <FileText className="h-3.5 w-3.5" />
        {nextHintNumber}/{hintLimit}
      </button>
    </span>
  );
}

export function MaterialAttemptBar({ hintLimit = MIN_MANUAL_INPUT_HINTS, status }: { hintLimit?: number; status: MaterialAnswerStatus }) {
  const { t } = useAppTranslation();

  if (!materialAttemptBarVisible(status)) {
    return null;
  }

  const redPercent = materialAttemptBarRedPercent(status, hintLimit);
  const maxAttempts = Math.max(1, status.maxAttempts);
  const label = status.locked
    ? t("materials.renderer.attemptsFinished", { used: status.incorrectAttempts, total: maxAttempts })
    : status.hintsUsed > 0 && status.incorrectAttempts === 0 && !status.correct
      ? t("materials.renderer.hintsUsed", { used: status.hintsUsed, total: hintLimit })
      : status.correct
        ? t("materials.renderer.acceptedAttempts", { used: status.incorrectAttempts, total: maxAttempts })
        : t("materials.renderer.errorAttempts", { used: status.incorrectAttempts, total: maxAttempts });
  const style = {
    "--playsay-answer-red": `${redPercent}%`,
  } as CSSProperties;

  return (
    <span
      aria-label={label}
      className="playsay-answer-attempt-bar"
      data-kind={status.kind}
      role="img"
      style={style}
      title={label}
    />
  );
}

export function materialAttemptBarVisible(status: MaterialAnswerStatus): boolean {
  return status.maxAttempts > 0;
}

export function materialAttemptBarRedPercent(status: MaterialAnswerStatus, hintLimit = MIN_MANUAL_INPUT_HINTS): number {
  if (status.locked) {
    return 100;
  }

  const maxAttempts = Math.max(1, status.maxAttempts);
  const errorPercent = Math.min(100, Math.max(0, (status.incorrectAttempts / maxAttempts) * 100));
  const hintPercent = Math.min(100, Math.max(0, (status.hintsUsed / Math.max(MIN_MANUAL_INPUT_HINTS, hintLimit)) * 100));
  return Math.max(errorPercent, hintPercent);
}

export function materialExerciseOptions(item: MaterialExerciseItem, block: MaterialEditorBlock): string[] {
  if (materialFillGapMode(item) === "wordBank") {
    return [];
  }
  const configuredOptions = uniqueMaterialOptions(item.options ?? []);
  if (configuredOptions.length > 0) {
    return configuredOptions;
  }

  const answer = normalizeMaterialAnswer(item.answer);
  const articleContext = `${block.title} ${block.body ?? ""} ${block.prompt ?? ""} ${item.prompt}`.toLowerCase();
  if (
    ["a", "an", "-"].includes(answer) ||
    materialNormalizationTerms("articleContext").some((term) => articleContext.includes(term))
  ) {
    return ["a", "an", "-"];
  }

  return [];
}

function materialFillGapWordBankOptions(block: MaterialEditorBlock): NonNullable<MaterialEditorBlock["wordBankOptions"]> {
  if (block.wordBankOptions?.length) {
    return block.wordBankOptions;
  }

  return (block.items ?? [])
    .filter((item) => materialFillGapMode(item) === "wordBank")
    .map((item, index) => ({
      id: item.answerOptionId || materialExerciseItemKey(item, index),
      value: item.answer?.trim() ?? "",
    }))
    .filter((option) => option.value);
}

export function appendMaterialHint(
  hints: Record<string, MaterialHintEntry[]>,
  itemKey: string,
  hint: MaterialHintEntry,
): Record<string, MaterialHintEntry[]> {
  const current = hints[itemKey] ?? [];
  return {
    ...hints,
    [itemKey]: [...current, hint],
  };
}

export function canRequestManualInputHint(
  item: MaterialExerciseItem,
  hints: MaterialHintEntry[],
  status: MaterialAnswerStatus,
  hintLimit = MAX_MANUAL_INPUT_HINTS,
): boolean {
  return Boolean(item.answer?.trim()) && hints.length < hintLimit && !status.locked && !status.correct;
}

export function materialManualInputHintPreview(item: MaterialExerciseItem, hints: MaterialHintEntry[]): string {
  const latestHint = hints[hints.length - 1];
  if (latestHint?.value) {
    return latestHint.value;
  }
  if (hints.length === 0) {
    return "";
  }
  return materialManualInputHintValue(item.answer ?? "", hints.length, materialManualInputHintLimit(item.answer ?? ""), materialHintPrefixLength(item));
}

export function materialManualInputInlineHint(item: MaterialExerciseItem, hints: MaterialHintEntry[], value: string): string {
  const hint = materialManualInputHintPreview(item, hints);
  const cleanValue = value.trim();
  if (!hint) {
    return "";
  }

  if (!cleanValue) {
    return hint;
  }

  if (materialItemAnswerMatches(item, cleanValue)) {
    return "";
  }

  const hintPrefix = hint.replace(/\.\.\.$/, "");
  if (hintPrefix && cleanValue.toLowerCase().startsWith(hintPrefix.toLowerCase())) {
    return "";
  }

  if (hintPrefix.toLowerCase().startsWith(cleanValue.toLowerCase())) {
    const suffix = hintPrefix.slice(cleanValue.length);
    return suffix ? `${suffix}...` : "";
  }

  if (normalizeMaterialAnswer(hint) === normalizeMaterialAnswer(cleanValue)) {
    return "";
  }

  return hint;
}

export function materialManualInputVisualCharacters(value: string, hint: string, maxCharacters = 18, minCharacters = 4): number {
  const valueCharacters = Array.from(value.trim()).length;
  const hintCharacters = Array.from(hint.replace(/\.\.\.$/, "")).length;
  return Math.min(maxCharacters, Math.max(minCharacters, valueCharacters + hintCharacters + 1));
}

export function materialHintForExerciseItem(item: MaterialExerciseItem, block: MaterialEditorBlock, hintNumber: number): MaterialHintEntry {
  const answer = item.answer?.trim() ?? "";
  const policy = materialAssessmentForItem(block, item);
  const penalty = policy.hintPenalty ?? 0.15;
  const hintLimit = materialManualInputHintLimit(answer, policy.hintCount);
  const level = Math.min(Math.max(hintNumber, 1), hintLimit);
  const value = materialManualInputHintValue(answer, level, hintLimit, materialHintPrefixLength(item));
  const fullAnswerVisible = Boolean(answer) && normalizeMaterialAnswer(value) === normalizeMaterialAnswer(answer);
  const type = fullAnswerVisible ? "fullAnswer" : level === 1 ? "firstLetter" : "partialAnswer";
  return {
    at: new Date().toISOString(),
    label: fullAnswerVisible
      ? i18n.t("materials.renderer.answerHint", { value })
      : i18n.t("materials.renderer.hintValue", { level, value }),
    penalty,
    type,
    value,
  };
}

export function materialManualInputHintLimit(answer: string, configuredHintCount = MIN_MANUAL_INPUT_HINTS): number {
  const characterCount = Array.from(answer.trim().replace(/\s+/g, "")).length;
  if (characterCount <= 0) {
    return MIN_MANUAL_INPUT_HINTS;
  }

  const requestedHints = Math.round(Math.min(MAX_MANUAL_INPUT_HINTS, Math.max(MIN_MANUAL_INPUT_HINTS, configuredHintCount)));
  const lengthLimit = characterCount >= 7
    ? MAX_MANUAL_INPUT_HINTS
    : characterCount >= 4
      ? 4
      : MIN_MANUAL_INPUT_HINTS;
  return Math.min(requestedHints, lengthLimit);
}

export function materialManualInputHintValue(answer: string, level: number, hintLimit = MIN_MANUAL_INPUT_HINTS, hintPrefixLength = 0): string {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) {
    return "";
  }

  const cleanHintLimit = Math.max(MIN_MANUAL_INPUT_HINTS, hintLimit);
  const cleanLevel = Math.min(Math.max(level, 1), cleanHintLimit);
  const cleanPrefixLength = hintPrefixLength === 1 || hintPrefixLength === 2 ? hintPrefixLength : 0;
  return cleanAnswer
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) {
        return part;
      }
      const characters = Array.from(part);
      if (characters.length === 0) {
        return "";
      }
      const proportionalRevealCount = cleanLevel >= cleanHintLimit
        ? characters.length
        : Math.max(1, Math.min(characters.length, Math.ceil(characters.length * cleanLevel / cleanHintLimit)));
      const revealCount = cleanPrefixLength > 0 && cleanLevel === 1
        ? Math.min(characters.length, cleanPrefixLength)
        : Math.max(Math.min(characters.length, cleanPrefixLength), proportionalRevealCount);
      return characters.slice(0, revealCount).join("");
    })
    .join("");
}

function uniqueMaterialOptions(options: string[]): string[] {
  const result: string[] = [];
  options.forEach((option) => {
    const normalized = option.trim();
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  });
  return result;
}

function normalizeMaterialAnswer(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (isMaterialNormalizationTerm("noArticle", normalized)) {
    return "-";
  }
  return normalized;
}
