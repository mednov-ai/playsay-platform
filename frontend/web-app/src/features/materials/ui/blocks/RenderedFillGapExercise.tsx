import { type CSSProperties, type DragEvent, type KeyboardEvent, useMemo, useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import { i18n, useAppTranslation } from "../../../../shared/i18n";
import {
  MAX_MANUAL_INPUT_HINTS,
  appendMaterialAttempt,
  cleanMaterialAssessment,
  defaultObjectiveAssessmentPolicy,
  materialAnswerAttempts,
  materialAnswerContextForBlock,
  materialAnswerHints,
  materialAnswerItems,
  materialAnswerOptionIds,
  materialAnswerStatus,
  materialExerciseItemKey,
  materialFillGapMode,
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
    const nextAttempts = appendMaterialAttempt(attempts, itemKey, value, materialItemAnswerMatches(item, value, answerOptionId), answerOptionId);
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

  function requestHint(itemKey: string, item: MaterialExerciseItem) {
    const itemHints = hints[itemKey] ?? [];
    const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, true, answerOptionIds[itemKey]);
    if (!canRequestManualInputHint(item, itemHints, status)) {
      return;
    }

    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: answers,
      attempts,
      context: materialAnswerContextForBlock(block),
      hints: appendMaterialHint(hints, itemKey, materialHintForExerciseItem(item, block, itemHints.length + 1)),
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
      {(block.items ?? []).map((item, index) => {
        const itemKey = materialExerciseItemKey(item, index);
        const gapMode = materialFillGapMode(item);
        const options = materialExerciseOptions(item, block);
        const isWordBank = gapMode === "wordBank";
        const isManualInput = gapMode === "typed" && options.length === 0;
        const prompt = splitFillGapPrompt(item.prompt);
        const itemHints = hints[itemKey] ?? [];
        const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, isManualInput, answerOptionIds[itemKey]);
        const hintPreview = isManualInput ? materialManualInputHintPreview(item, itemHints) : "";
        const inlineHint = isManualInput ? materialManualInputInlineHint(item, itemHints, answers[itemKey] ?? "") : "";
        const canRequestHint = isManualInput && canRequestManualInputHint(item, itemHints, status);
        const selectedWordBankOption = selectedWordBankOptionId
          ? wordBankOptions.find((option) => option.id === selectedWordBankOptionId)
          : null;

        return (
          <div className="playsay-answer-row" data-input-mode={isWordBank ? "wordBank" : isManualInput ? "manual" : "select"} data-status={status.kind} key={itemKey}>
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
                  <MaterialAttemptBar status={status} />
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
                  <MaterialAttemptBar status={status} />
                </span>
              ) : (
                <span className="playsay-inline-answer-wrap">
                  <span className="playsay-inline-answer" data-status={status.kind}>
                    <input
                      aria-label={t("materials.renderer.gapNumber", { number: index + 1 })}
                      disabled={status.locked || status.correct}
                      onChange={(event) => updateItemValue(itemKey, event.target.value)}
                      onKeyDown={(event) => handleManualInputKeyDown(event, itemKey)}
                      placeholder={!answers[itemKey]?.trim() ? hintPreview || undefined : undefined}
                      value={answers[itemKey] ?? ""}
                    />
                    {inlineHint ? <span className="playsay-inline-hint-ghost">{inlineHint}</span> : null}
                    <button
                      aria-label={t("materials.renderer.checkAnswer")}
                      className="playsay-inline-check"
                      disabled={status.locked || status.correct || !answers[itemKey]?.trim()}
                      onClick={() => checkItem(itemKey)}
                      title={t("materials.renderer.checkAnswerTitle")}
                      type="button"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <MaterialAttemptBar status={status} />
                  <MaterialAnswerTools
                    canRequestHint={canRequestHint}
                    onHint={() => requestHint(itemKey, item)}
                    status={status}
                  />
                </span>
              )}
              {prompt.after ? <MarkdownInline value={prompt.after} /> : null}
            </label>
          </div>
        );
      })}
    </div>
  );
}

function omitMaterialAnswerKey(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function MaterialAnswerTools({
  canRequestHint,
  onHint,
  status,
}: {
  canRequestHint: boolean;
  onHint: () => void;
  status: MaterialAnswerStatus;
}) {
  const { t } = useAppTranslation();
  const nextHintNumber = Math.min(status.hintsUsed + 1, MAX_MANUAL_INPUT_HINTS);
  if (!canRequestHint) {
    return null;
  }

  return (
    <div className="playsay-answer-tools">
      <button
        aria-label={t("materials.renderer.hintProgress", { current: nextHintNumber, total: MAX_MANUAL_INPUT_HINTS })}
        className="playsay-hint-button"
        onClick={onHint}
        title={t("materials.renderer.hintProgress", { current: nextHintNumber, total: MAX_MANUAL_INPUT_HINTS })}
        type="button"
      >
        <FileText className="h-3.5 w-3.5" />
        {nextHintNumber}/{MAX_MANUAL_INPUT_HINTS}
      </button>
    </div>
  );
}

export function MaterialAttemptBar({ status }: { status: MaterialAnswerStatus }) {
  const { t } = useAppTranslation();

  if (status.kind === "empty" || status.kind === "draft") {
    return null;
  }

  const maxAttempts = Math.max(1, status.maxAttempts);
  const redPercent = status.locked
    ? 100
    : Math.min(100, Math.max(0, (status.incorrectAttempts / maxAttempts) * 100));
  const label = status.locked
    ? t("materials.renderer.attemptsFinished", { used: status.incorrectAttempts, total: maxAttempts })
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
): boolean {
  return Boolean(item.answer?.trim()) && hints.length < MAX_MANUAL_INPUT_HINTS && !status.locked && !status.correct;
}

export function materialManualInputHintPreview(item: MaterialExerciseItem, hints: MaterialHintEntry[]): string {
  const latestHint = hints[hints.length - 1];
  if (latestHint?.value) {
    return latestHint.value;
  }
  if (hints.length === 0) {
    return "";
  }
  return materialProgressiveHintValue(item.answer ?? "", hints.length);
}

export function materialManualInputInlineHint(item: MaterialExerciseItem, hints: MaterialHintEntry[], value: string): string {
  const hint = materialManualInputHintPreview(item, hints);
  const cleanValue = value.trim();
  if (!hint || !cleanValue) {
    return "";
  }

  if (materialItemAnswerMatches(item, cleanValue)) {
    return "";
  }

  if (hint.toLowerCase().startsWith(cleanValue.toLowerCase()) && cleanValue.length < hint.length) {
    return hint.slice(cleanValue.length);
  }

  const hintPrefix = hint.replace(/\.\.\.$/, "");
  if (hintPrefix && cleanValue.toLowerCase().startsWith(hintPrefix.toLowerCase())) {
    return "";
  }

  if (normalizeMaterialAnswer(hint) === normalizeMaterialAnswer(cleanValue)) {
    return "";
  }

  return hint;
}

export function materialHintForExerciseItem(item: MaterialExerciseItem, block: MaterialEditorBlock, hintNumber: number): MaterialHintEntry {
  const answer = item.answer?.trim() ?? "";
  const penalty = cleanMaterialAssessment(block.assessment ?? defaultObjectiveAssessmentPolicy()).hintPenalty ?? 0.15;
  const level = Math.min(Math.max(hintNumber, 1), MAX_MANUAL_INPUT_HINTS);
  const value = materialProgressiveHintValue(answer, level);
  const type = level === 1 ? "firstLetter" : level === 2 ? "partialAnswer" : "fullAnswer";
  return {
    at: new Date().toISOString(),
    label: level >= MAX_MANUAL_INPUT_HINTS
      ? i18n.t("materials.renderer.answerHint", { value })
      : i18n.t("materials.renderer.hintValue", { level, value }),
    penalty,
    type,
    value,
  };
}

function materialProgressiveHintValue(answer: string, level: number): string {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) {
    return "";
  }
  if (level >= MAX_MANUAL_INPUT_HINTS) {
    return cleanAnswer;
  }

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
      const revealCount = level === 1 ? 1 : Math.min(characters.length, Math.max(2, Math.ceil(characters.length / 2)));
      const preview = characters.slice(0, revealCount).join("");
      return revealCount >= characters.length ? preview : `${preview}...`;
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
