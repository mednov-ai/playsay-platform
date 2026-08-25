import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ZoomIn, ZoomOut } from "lucide-react";
import {
  appendMaterialAttempt,
  appendMaterialHint,
  canRequestManualInputHint,
  materialAnswerAttempts,
  materialAnswerContextForBlock,
  materialAnswerHints,
  materialAnswerStatus,
  materialHintForExerciseItem,
  materialItemAnswerMatches,
  materialAssetIdFromUrl,
  type MaterialAnswerBlock,
  type MaterialEditorBlock,
  type MaterialExerciseInteraction,
  type MaterialExerciseItem,
  type MaterialExerciseParticipant,
  type MaterialRenderMode,
  type MaterialWorksheetGroup,
  type MaterialWorksheetRegion,
} from "../../model/materialDocument";
import { useAppTranslation } from "../../../../shared/i18n";

type WorksheetAnswerProps = {
  answer?: MaterialAnswerBlock;
  assetUrls: Record<string, string>;
  block: MaterialEditorBlock;
  mode?: MaterialRenderMode;
  participants?: MaterialExerciseParticipant[];
  onInteractionChange?: (interaction: MaterialExerciseInteraction | null) => void;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
};

export function RenderedInteractiveWorksheet({
  answer,
  assetUrls,
  block,
  participants = [],
  onInteractionChange,
  onAnswerChange,
}: WorksheetAnswerProps) {
  const { t } = useAppTranslation();
  const [revealedCard, setRevealedCard] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<{ groupId: string; leftId: string } | null>(null);
  const [selectedBankWord, setSelectedBankWord] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const assetId = materialAssetIdFromUrl(block.sourceAsset);
  const background = assetId ? assetUrls[assetId] : undefined;
  const values = (answer?.items ?? {}) as Record<string, string>;
  const choiceItems = (answer?.choiceItems ?? {}) as Record<string, string[]>;
  const matching = (answer?.matches ?? {}) as Record<string, string>;
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);
  const groups = useMemo(() => [...(block.worksheetGroups ?? [])].sort((a, b) => a.order - b.order), [block.worksheetGroups]);
  const wordBank = useMemo(() => groups.flatMap((group) => group.type === "FILL_GAPS" ? group.wordBank ?? [] : []), [groups]);

  useEffect(() => () => onInteractionChange?.(null), [block.id, onInteractionChange]);

  function update(patch: MaterialAnswerBlock) {
    onAnswerChange?.(block.id, {
      ...answer,
      type: "interactiveWorksheet",
      context: materialAnswerContextForBlock(block),
      attempts,
      hints,
      ...patch,
    });
  }

  function setGapValue(group: MaterialWorksheetGroup, gap: NonNullable<MaterialWorksheetGroup["gaps"]>[number], value: string, check: boolean) {
    const item = worksheetGapItem(gap);
    update({
      items: { ...values, [gap.id]: value },
      attempts: check ? appendMaterialAttempt(attempts, gap.id, value, materialItemAnswerMatches(item, value)) : attempts,
    });
    if (group.gapMode === "WORD_BANK") setSelectedBankWord(null);
  }

  function requestGapHint(group: MaterialWorksheetGroup, gap: NonNullable<MaterialWorksheetGroup["gaps"]>[number]) {
    const item = worksheetGapItem(gap);
    const itemHints = hints[gap.id] ?? [];
    const status = materialAnswerStatus(item, values[gap.id], attempts[gap.id], itemHints, group.assessment, true);
    if (!canRequestManualInputHint(item, itemHints, status)) return;
    update({ hints: appendMaterialHint(hints, gap.id, materialHintForExerciseItem(item, block, itemHints.length + 1)) });
  }

  function chooseLeft(groupId: string, leftId: string) {
    const next = pendingMatch?.groupId === groupId && pendingMatch.leftId === leftId ? null : { groupId, leftId };
    setPendingMatch(next);
    onInteractionChange?.(next ? { blockId: block.id, kind: "matchingSelection", leftId, worksheetGroupId: groupId } : null);
  }

  function chooseRight(group: MaterialWorksheetGroup, rightId: string) {
    if (!pendingMatch || pendingMatch.groupId !== group.id || matchingLocked(group, attempts)) return;
    const correct = pendingMatch.leftId === rightId;
    update({
      matches: correct ? { ...matching, [pendingMatch.leftId]: rightId } : matching,
      attempts: appendMaterialAttempt(attempts, pendingMatch.leftId, rightId, correct),
    });
    if (correct) {
      setPendingMatch(null);
      onInteractionChange?.(null);
    }
  }

  function evaluateChoice(group: MaterialWorksheetGroup, question: NonNullable<MaterialWorksheetGroup["questions"]>[number]) {
    const selected = [...(choiceItems[question.id] ?? [])].sort();
    const correct = [...(question.correctOptionIds ?? [])].sort();
    update({ attempts: appendMaterialAttempt(attempts, question.id, selected.join("|"), arraysEqual(selected, correct)) });
  }

  return <div className="playsay-interactive-worksheet-shell">
    <div className="playsay-worksheet-zoom" role="group" aria-label={t("materials.worksheetAnswer.zoom")}>
      <button aria-label={t("materials.worksheetAnswer.zoomOut")} disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - .25))} type="button"><ZoomOut /></button>
      <output>{Math.round(zoom * 100)}%</output>
      <button aria-label={t("materials.worksheetAnswer.zoomIn")} disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + .25))} type="button"><ZoomIn /></button>
    </div>
    {wordBank.length > 0 ? <div className="playsay-worksheet-word-bank" aria-label={t("materials.renderer.wordBankLabel")}>
      {wordBank.map((word) => <button aria-pressed={selectedBankWord === word} data-selected={selectedBankWord === word || undefined} key={word} onClick={() => setSelectedBankWord((current) => current === word ? null : word)} type="button">{word}</button>)}
    </div> : null}
    <div className="playsay-interactive-worksheet-viewport"><div className="playsay-interactive-worksheet" style={{ aspectRatio: `${block.intrinsicWidth ?? 3}/${block.intrinsicHeight ?? 4}`, width: `${zoom * 100}%` }}>
      {background ? <img alt={block.alt ?? block.title} draggable={false} src={background} /> : <div className="playsay-worksheet-image-missing">{t("materials.renderer.assetsUnavailable")}</div>}
      <div className="playsay-worksheet-overlay" role="group" aria-label={block.title}>
        {groups.map((group, groupIndex) => <WorksheetGroup
          answer={answer}
          block={block}
          group={group}
          groupNumber={groupIndex + 1}
          key={group.id}
          matching={matching}
          pendingMatch={pendingMatch}
          participants={participants}
          revealedCard={revealedCard}
          selectedBankWord={selectedBankWord}
          values={values}
          choiceItems={choiceItems}
          onChooseLeft={chooseLeft}
          onChooseRight={chooseRight}
          onChoiceChange={(questionId, optionId) => {
            const selected = new Set(choiceItems[questionId] ?? []);
            if (selected.has(optionId)) selected.delete(optionId); else selected.add(optionId);
            update({ choiceItems: { ...choiceItems, [questionId]: [...selected] } });
          }}
          onChoiceEvaluate={evaluateChoice}
          onGapHint={requestGapHint}
          onGapValue={setGapValue}
          onRevealCard={(cardId) => setRevealedCard((current) => current === cardId ? null : cardId)}
        />)}
      </div>
    </div></div>
  </div>;
}

function WorksheetGroup({
  answer, block, choiceItems, group, groupNumber, matching, pendingMatch, participants, revealedCard, selectedBankWord, values,
  onChooseLeft, onChooseRight, onChoiceChange, onChoiceEvaluate, onGapHint, onGapValue, onRevealCard,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  choiceItems: Record<string, string[]>;
  group: MaterialWorksheetGroup;
  groupNumber: number;
  matching: Record<string, string>;
  pendingMatch: { groupId: string; leftId: string } | null;
  participants: MaterialExerciseParticipant[];
  revealedCard: string | null;
  selectedBankWord: string | null;
  values: Record<string, string>;
  onChooseLeft: (groupId: string, leftId: string) => void;
  onChooseRight: (group: MaterialWorksheetGroup, rightId: string) => void;
  onChoiceChange: (questionId: string, optionId: string) => void;
  onChoiceEvaluate: (group: MaterialWorksheetGroup, question: NonNullable<MaterialWorksheetGroup["questions"]>[number]) => void;
  onGapHint: (group: MaterialWorksheetGroup, gap: NonNullable<MaterialWorksheetGroup["gaps"]>[number]) => void;
  onGapValue: (group: MaterialWorksheetGroup, gap: NonNullable<MaterialWorksheetGroup["gaps"]>[number], value: string, check: boolean) => void;
  onRevealCard: (cardId: string) => void;
}) {
  const { t } = useAppTranslation();
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);

  if (group.type === "FILL_GAPS") return <>{group.gaps?.map((gap, index) => {
    const item = worksheetGapItem(gap);
    const explicitCheck = group.gapMode === "TYPED" || group.gapMode === "FORM_TRANSFORM";
    const status = materialAnswerStatus(item, values[gap.id], attempts[gap.id], hints[gap.id] ?? [], group.assessment, explicitCheck);
    const accessibleNumber = `${groupNumber}.${index + 1}`;
    const common = { "aria-label": t("materials.worksheetAnswer.gapNumber", { number: accessibleNumber }), "data-status": status.kind, disabled: status.locked || status.correct, style: regionStyle(gap.region) };
    if (group.gapMode === "SINGLE_CHOICE") return <select {...common} key={gap.id} onChange={(event) => onGapValue(group, gap, event.target.value, true)} value={values[gap.id] ?? ""}><option value="" />{gap.options?.map((option) => <option key={option}>{option}</option>)}</select>;
    if (group.gapMode === "WORD_BANK") return <button {...common} aria-describedby={`${gap.id}-status`} key={gap.id} onClick={() => selectedBankWord && onGapValue(group, gap, selectedBankWord, true)} type="button"><span>{values[gap.id] || t("materials.worksheetAnswer.placeWord")}</span><span className="playsay-visually-hidden" id={`${gap.id}-status`} role="status">{status.label}</span></button>;
    return <span className="playsay-worksheet-gap-input" key={gap.id} style={regionStyle(gap.region)}>
      <input aria-label={t("materials.worksheetAnswer.gapNumber", { number: accessibleNumber })} data-status={status.kind} disabled={status.locked || status.correct} onChange={(event) => onGapValue(group, gap, event.target.value, false)} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); onGapValue(group, gap, event.currentTarget.value, true); } }} placeholder={group.gapMode === "FORM_TRANSFORM" ? gap.baseForm : undefined} value={values[gap.id] ?? ""} />
      <button aria-label={t("materials.renderer.checkAnswer")} disabled={status.locked || status.correct || !values[gap.id]?.trim()} onClick={() => onGapValue(group, gap, values[gap.id] ?? "", true)} type="button"><Check /></button>
      {canRequestManualInputHint(item, hints[gap.id] ?? [], status) ? <button aria-label={t("materials.renderer.hintProgress", { current: (hints[gap.id]?.length ?? 0) + 1, total: gap.hintCount ?? group.assessment?.hintCount ?? 3 })} onClick={() => onGapHint(group, gap)} type="button">?</button> : null}
      <span className="playsay-visually-hidden" role="status">{status.label}</span>
    </span>;
  })}</>;

  if (group.type === "MATCHING_PAIRS") {
    const locked = matchingLocked(group, attempts);
    return <>{group.pairs?.flatMap((pair, pairIndex) => {
      const solved = matching[pair.id] === pair.id;
      const remote = participants.find((participant) => participant.interaction.kind === "matchingSelection" && participant.interaction.blockId === block.id && participant.interaction.leftId === pair.id && participant.interaction.worksheetGroupId === group.id);
      const leftLabel = pair.left.text ?? pair.left.imageAlt ?? t("materials.worksheetAnswer.pairLeft", { number: pairIndex + 1 });
      const rightLabel = pair.right.text ?? pair.right.imageAlt ?? t("materials.worksheetAnswer.pairRight", { number: pairIndex + 1 });
      return [
        <button aria-label={`${t("materials.worksheetAnswer.pairLeft", { number: pairIndex + 1 })}: ${leftLabel}`} aria-pressed={pendingMatch?.groupId === group.id && pendingMatch.leftId === pair.id} className="worksheet-match-hotspot" data-live-active={remote ? "true" : undefined} data-status={solved ? "solved" : pendingMatch?.leftId === pair.id ? "selected" : "empty"} disabled={locked || solved} key={`${pair.id}-left`} onClick={() => onChooseLeft(group.id, pair.id)} style={{ ...regionStyle(pair.left.region), ...(remote ? { "--playsay-live-color": remote.color } as CSSProperties : {}) }} title={remote?.name} type="button"><span>{pairIndex + 1}</span></button>,
        <button aria-label={`${t("materials.worksheetAnswer.pairRight", { number: pairIndex + 1 })}: ${rightLabel}`} className="worksheet-match-hotspot" data-status={solved ? "solved" : "empty"} disabled={locked || solved} key={`${pair.id}-right`} onClick={() => onChooseRight(group, pair.id)} style={regionStyle(pair.right.region)} type="button"><span>{String.fromCharCode(65 + pairIndex)}</span></button>,
      ];
    })}<span className="playsay-visually-hidden" aria-live="polite">{locked ? t("materials.worksheetAnswer.matchingLocked") : ""}</span></>;
  }

  if (group.type === "MULTIPLE_CHOICE") return <>{group.questions?.flatMap((question, questionIndex) => {
    const selected = new Set(choiceItems[question.id] ?? []);
    const currentAttempts = attempts[question.id] ?? [];
    const latest = currentAttempts.at(-1);
    const maxAttempts = group.assessment?.maxAttempts ?? block.assessment?.maxAttempts ?? 3;
    const locked = latest?.correct === true || currentAttempts.filter((attempt) => attempt.correct === false).length >= maxAttempts;
    const status = latest?.correct === true ? "correct" : latest?.correct === false ? (locked ? "locked" : "wrong") : selected.size ? "draft" : "empty";
    return [
      ...question.options.map((option, optionIndex) => <button aria-label={t("materials.worksheetAnswer.choiceOption", { question: questionIndex + 1, option: optionIndex + 1 })} aria-pressed={selected.has(option.id)} className="worksheet-choice-hotspot" data-status={status} disabled={locked} key={option.id} onClick={() => onChoiceChange(question.id, option.id)} style={option.region ? regionStyle(option.region) : undefined} type="button"><span>{option.text || optionIndex + 1}</span></button>),
      <button aria-label={t("materials.worksheetAnswer.checkChoice", { number: questionIndex + 1 })} className="worksheet-choice-check" disabled={locked || selected.size === 0} key={`${question.id}-check`} onClick={() => onChoiceEvaluate(group, question)} style={question.promptRegion ? regionStyle(question.promptRegion) : undefined} type="button"><Check /><span className="playsay-visually-hidden" role="status">{choiceStatusLabel(status, t)}</span></button>,
    ];
  })}</>;

  return <>{group.cards?.map((card) => {
    if (!card.front.region) return null;
    const revealed = revealedCard === card.id;
    return <button aria-expanded={revealed} aria-label={t("materials.worksheetAnswer.flashcard", { number: card.order + 1 })} className="flashcard" key={card.id} onClick={() => onRevealCard(card.id)} style={regionStyle(card.front.region)} type="button"><span>{card.front.kind === "TEXT" ? card.front.text : card.order + 1}</span>{revealed ? <span className="playsay-worksheet-card-reveal" role="status">{card.back.kind === "TEXT" ? card.back.text : t("materials.worksheetAnswer.imageBack")}</span> : null}</button>;
  })}</>;
}

function worksheetGapItem(gap: NonNullable<MaterialWorksheetGroup["gaps"]>[number]): MaterialExerciseItem {
  return {
    id: gap.id,
    prompt: gap.baseForm ?? "",
    answer: gap.answer ?? gap.acceptedAnswers?.[0],
    acceptedAnswers: gap.acceptedAnswers,
    baseForm: gap.baseForm,
    options: gap.options,
    hintCount: gap.hintCount,
    maxAttempts: gap.maxAttempts,
  };
}

function matchingLocked(group: MaterialWorksheetGroup, attempts: ReturnType<typeof materialAnswerAttempts>): boolean {
  const maxErrors = group.assessment?.maxErrors ?? group.assessment?.maxAttempts ?? 5;
  const pairIds = new Set(group.pairs?.map((pair) => pair.id) ?? []);
  const errors = Object.entries(attempts).reduce((count, [id, entries]) => count + (pairIds.has(id) ? entries.filter((entry) => entry.correct === false).length : 0), 0);
  return errors >= maxErrors;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function choiceStatusLabel(status: string, t: (key: string) => string): string {
  if (status === "correct") return t("materials.worksheetAnswer.statusAccepted");
  if (status === "wrong") return t("materials.worksheetAnswer.statusWrong");
  if (status === "locked") return t("materials.worksheetAnswer.statusLocked");
  return t("materials.answerStatus.check");
}

function regionStyle(region: MaterialWorksheetRegion): CSSProperties {
  return { left: `${region.x / 10}%`, top: `${region.y / 10}%`, width: `${region.width / 10}%`, height: `${region.height / 10}%` };
}
