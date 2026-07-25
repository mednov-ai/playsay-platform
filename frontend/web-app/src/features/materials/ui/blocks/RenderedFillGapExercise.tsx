import { type CSSProperties, type DragEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, KeyRound } from "lucide-react";
import { i18n, useAppTranslation } from "../../../../shared/i18n";
import {
  appendMaterialHint,
  appendMaterialAttempt,
  canRequestManualInputHint,
  longestMaterialInputText,
  materialAssessmentForItem,
  materialAnswerAttempts,
  materialAnswerContextForBlock,
  materialAnswerHints,
  materialAnswerItems,
  materialAnswerOptionIds,
  materialAnswerStatus,
  materialExerciseOptions,
  materialExerciseItemKey,
  materialFillGapWordBankOptions,
  materialFillGapMode,
  materialHintForExerciseItem,
  materialItemAnswerMatches,
  materialManualInputHintLimit,
  materialManualInputVisualCharacters,
  materialWordBankUsedOptionIds,
  omitMaterialAnswerKey,
  splitFillGapPrompt,
  type MaterialAnswerBlock,
  type MaterialEditorBlock,
  type MaterialExerciseInteraction,
  type MaterialExerciseParticipant,
  type MaterialExerciseItem,
  type MaterialHintEntry,
} from "../../model/materialDocument";
import { MaterialAnswerTools, MaterialAttemptBar } from "./MaterialAnswerControls";
import { MarkdownInline } from "../markdown/RenderedMarkdown";

export function RenderedFillGapExercise({
  answer,
  block,
  participants = [],
  onInteractionChange,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  participants?: MaterialExerciseParticipant[];
  onInteractionChange?: (interaction: MaterialExerciseInteraction | null) => void;
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
  const remoteWordBankInteractions = participants.filter((participant) => (
    participant.interaction.blockId === block.id && participant.interaction.kind === "wordBankDrag"
  ));

  useEffect(() => () => onInteractionChange?.(null), [block.id, onInteractionChange]);

  function publishWordBankInteraction(optionId: string, targetItemKey?: string) {
    onInteractionChange?.({
      blockId: block.id,
      kind: "wordBankDrag",
      optionId,
      ...(targetItemKey ? { targetItemKey } : {}),
    });
  }

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
    onInteractionChange?.(null);
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
            const remoteParticipants = remoteWordBankInteractions.filter((participant) => (
              participant.interaction.kind === "wordBankDrag" && participant.interaction.optionId === option.id
            ));
            const remoteParticipant = remoteParticipants[0];
            return (
              <button
                aria-pressed={selected}
                className="playsay-word-bank-chip"
                data-selected={selected || undefined}
                data-live-active={remoteParticipant ? "true" : undefined}
                data-option-id={option.id}
                disabled={used}
                draggable={!used}
                key={option.id}
                onClick={() => {
                  const nextOptionId = selected ? null : option.id;
                  setSelectedWordBankOptionId(nextOptionId);
                  if (nextOptionId) {
                    publishWordBankInteraction(nextOptionId);
                  } else {
                    onInteractionChange?.(null);
                  }
                }}
                onDragEnd={() => {
                  setSelectedWordBankOptionId(null);
                  onInteractionChange?.(null);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", option.id);
                  event.dataTransfer.effectAllowed = "move";
                  setSelectedWordBankOptionId(option.id);
                  publishWordBankInteraction(option.id);
                }}
                style={remoteParticipant ? { "--playsay-live-color": remoteParticipant.color } as CSSProperties : undefined}
                title={remoteParticipants.length > 0
                  ? `${remoteParticipants.map((participant) => participant.name).join(", ")}: ${option.value}`
                  : used
                    ? t("materials.renderer.wordBankOptionUsed", { value: option.value })
                    : t("materials.renderer.wordBankOptionTitle", { value: option.value })}
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
          const remoteTargetParticipants = remoteWordBankInteractions.filter((participant) => (
            participant.interaction.kind === "wordBankDrag" && participant.interaction.targetItemKey === itemKey
          ));
          const remoteTargetParticipant = remoteTargetParticipants[0];

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
                      data-live-active={remoteTargetParticipant ? "true" : undefined}
                      data-item-key={itemKey}
                      disabled={status.locked || status.correct}
                      onClick={() => {
                        if (selectedWordBankOption) {
                          assignWordBankOption(itemKey, item, selectedWordBankOption.id);
                          onInteractionChange?.(null);
                        }
                      }}
                      onDragEnter={() => {
                        if (selectedWordBankOptionId) {
                          publishWordBankInteraction(selectedWordBankOptionId, itemKey);
                        }
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (selectedWordBankOptionId) {
                          publishWordBankInteraction(selectedWordBankOptionId, itemKey);
                        }
                      }}
                      onDrop={(event) => handleWordBankDrop(event, itemKey, item)}
                      style={remoteTargetParticipant ? { "--playsay-live-color": remoteTargetParticipant.color } as CSSProperties : undefined}
                      title={remoteTargetParticipants.length > 0
                        ? remoteTargetParticipants.map((participant) => participant.name).join(", ")
                        : selectedWordBankOption
                          ? t("materials.renderer.wordBankPlaceSelected", { value: selectedWordBankOption.value })
                          : t("materials.renderer.wordBankDropTitle")}
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
