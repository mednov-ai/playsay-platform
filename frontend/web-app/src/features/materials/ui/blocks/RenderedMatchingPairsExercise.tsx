import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Sparkles } from "lucide-react";
import {
  DEFAULT_MATCHING_PAIR_MAX_ERRORS,
  appendMaterialAttempt,
  emptyMaterialMatchingPairs,
  materialAnswerAttempts,
  materialAnswerHints,
  materialAnswerMatchOrder,
  materialAnswerMatches,
  materialAssetIdFromUrl,
  materialMatchingPairTargetKind,
  matchingEffectiveMaxErrors,
  matchingRightOptionsForMode,
  resolveMaterialImageUrl,
  type MaterialAnswerBlock,
  type MaterialEditorBlock,
  type MaterialMatchingPair,
  type MaterialRenderMode,
} from "../../model/materialDocument";
import { MarkdownInline } from "../markdown/RenderedMarkdown";
import { useAppTranslation } from "../../../../shared/i18n";

export function RenderedMatchingPairsExercise({
  answer,
  assetUrls,
  block,
  mode,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  assetUrls: Record<string, string>;
  block: MaterialEditorBlock;
  mode: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const { t } = useAppTranslation();
  const pairs = block.pairs ?? emptyMaterialMatchingPairs;
  const rightOptions = useMemo(() => matchingRightOptionsForMode(pairs, mode), [mode, pairs]);
  const [activeLeftId, setActiveLeftId] = useState<string | null>(null);
  const [hoveredRightId, setHoveredRightId] = useState<string | null>(null);
  const [wrongFlashRightId, setWrongFlashRightId] = useState<string | null>(null);
  const matches = materialAnswerMatches(answer);
  const attempts = materialAnswerAttempts(answer);
  const matchOrder = materialAnswerMatchOrder(answer);
  const solvedPairs = materialMatchingSolvedPairs(pairs, matches, matchOrder);
  const solvedPairIds = new Set(solvedPairs.map((pair) => pair.id));
  const unresolvedLeftPairs = pairs.filter((pair) => !solvedPairIds.has(pair.id));
  const unresolvedRightOptions = rightOptions.filter((pair) => !solvedPairIds.has(pair.id));
  const maxErrors = matchingEffectiveMaxErrors(
    block.assessment?.maxErrors ?? block.assessment?.maxAttempts ?? DEFAULT_MATCHING_PAIR_MAX_ERRORS,
    pairs.length,
  );
  const matchingLocked = maxErrors > 0 && materialMatchingIncorrectAttemptCount(attempts) >= maxErrors;

  useEffect(() => {
    if (activeLeftId && solvedPairIds.has(activeLeftId)) {
      setActiveLeftId(null);
    }
  }, [activeLeftId, solvedPairIds]);

  function connectPair(rightId: string) {
    if (!activeLeftId || matchingLocked) {
      return;
    }

    const nextAnswer = materialMatchingAnswerAfterSelection(answer, pairs, activeLeftId, rightId);
    onAnswerChange?.(block.id, nextAnswer);
    if (activeLeftId !== rightId) {
      setWrongFlashRightId(rightId);
      window.setTimeout(() => setWrongFlashRightId((current) => (current === rightId ? null : current)), 650);
      return;
    }
    setActiveLeftId(null);
  }

  if (pairs.length === 0) {
    return (
      <div className="playsay-match-empty">
        <Link2 className="h-5 w-5 text-primary" />
        <span>{t("materials.matching.empty")}</span>
      </div>
    );
  }

  return (
    <div className="playsay-matching-exercise">
      <div className="playsay-match-columns">
        <div className="playsay-match-column" data-side="left">
          {unresolvedLeftPairs.map((leftPair, index) => {
            return (
              <div className="playsay-match-left-control" key={leftPair.id}>
                <button
                  aria-label={t("materials.matching.chooseLeftAria", { index: index + 1 })}
                  className="playsay-match-word"
                  data-active={activeLeftId === leftPair.id ? "true" : "false"}
                  data-status={matchingLocked ? "locked" : "empty"}
                  disabled={matchingLocked}
                  onClick={() => setActiveLeftId((current) => (current === leftPair.id ? null : leftPair.id))}
                  type="button"
                >
                  <MarkdownInline className="playsay-match-markdown" value={leftPair.left} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="playsay-match-column" data-side="right">
          {unresolvedRightOptions.map((pair, index) => {
          return (
              <button
                aria-label={pairTargetKindLabel(pair, t, index)}
                className="playsay-match-picture"
                data-flash={wrongFlashRightId === pair.id ? "wrong" : "none"}
                data-hovered={hoveredRightId === pair.id ? "true" : "false"}
                data-kind={materialMatchingPairTargetKind(pair).toLowerCase()}
                key={pair.id}
                disabled={matchingLocked}
                onClick={() => connectPair(pair.id)}
                onMouseEnter={() => setHoveredRightId(pair.id)}
                onMouseLeave={() => setHoveredRightId((current) => (current === pair.id ? null : current))}
                type="button"
              >
                <MatchingPairTarget pair={pair} assetUrls={assetUrls} optionIndex={index} />
              </button>
            );
          })}
        </div>
      </div>

      {solvedPairs.length > 0 ? (
        <div className="playsay-match-solved" aria-label={t("materials.matching.solvedPairs")}>
          {solvedPairs.map((pair, index) => (
            <div className="playsay-match-solved-pair" key={pair.id}>
              <span className="playsay-match-solved-index">{index + 1}</span>
              <span className="playsay-match-solved-card">
                <MarkdownInline className="playsay-match-markdown" value={pair.left} />
              </span>
              <span className="playsay-match-solved-card" data-side="right">
                <MatchingPairTarget pair={pair} assetUrls={assetUrls} optionIndex={index} />
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function materialMatchingAnswerAfterSelection(
  answer: MaterialAnswerBlock | undefined,
  pairs: MaterialMatchingPair[],
  leftId: string,
  rightId: string,
): MaterialAnswerBlock {
  const pairIds = new Set(pairs.map((pair) => pair.id));
  if (!pairIds.has(leftId) || !pairIds.has(rightId)) {
    return answer ?? { type: "matchingPairs", matches: {}, matchOrder: [] };
  }

  const matches = materialAnswerMatches(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);
  const matchOrder = materialAnswerMatchOrder(answer);
  const correct = leftId === rightId;
  const nextMatches = correct ? { ...matches, [leftId]: rightId } : matches;
  const nextOrder = correct && !matchOrder.includes(leftId)
    ? [...matchOrder, leftId]
    : matchOrder;

  return {
    type: "matchingPairs",
    matches: nextMatches,
    matchOrder: nextOrder,
    attempts: appendMaterialAttempt(attempts, leftId, rightId, correct),
    hints,
  };
}

export function materialMatchingSolvedPairs(
  pairs: MaterialMatchingPair[],
  matches: Record<string, string>,
  matchOrder: string[],
): MaterialMatchingPair[] {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const orderedIds = [
    ...matchOrder,
    ...Object.keys(matches),
  ];
  const seen = new Set<string>();
  return orderedIds.flatMap((id) => {
    if (seen.has(id) || matches[id] !== id) {
      return [];
    }
    seen.add(id);
    const pair = pairById.get(id);
    return pair ? [pair] : [];
  });
}

export function materialMatchingIncorrectAttemptCount(
  attempts: ReturnType<typeof materialAnswerAttempts>,
): number {
  return Object.values(attempts).reduce((total, itemAttempts) => (
    total + itemAttempts.filter((attempt) => attempt.correct === false).length
  ), 0);
}

function MatchingPairTarget({
  assetUrls,
  optionIndex,
  pair,
}: {
  assetUrls: Record<string, string>;
  optionIndex: number;
  pair: MaterialMatchingPair;
}) {
  const { t } = useAppTranslation();
  const pairTargetKind = materialMatchingPairTargetKind(pair);
  const assetId = materialAssetIdFromUrl(pair.imageUrl);
  const imageUrl = pairTargetKind === "IMAGE" ? resolveMaterialImageUrl(pair.imageUrl, assetUrls) : undefined;
  const hasPendingAsset = Boolean(pairTargetKind === "IMAGE" && assetId && !imageUrl);

  if (pairTargetKind === "IMAGE") {
    return (
      <span className="playsay-match-target" data-kind="image">
        {imageUrl ? (
          <img alt={pair.imageAlt || pair.right} src={imageUrl} />
        ) : (
          <span className="playsay-match-generated-thumb" aria-hidden="true">
            {hasPendingAsset ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          </span>
        )}
        {!imageUrl ? (
          <small>{hasPendingAsset ? t("materials.renderer.loadingImage") : pair.imagePrompt || pair.imageAlt || pair.right}</small>
        ) : null}
      </span>
    );
  }

  return (
    <span className="playsay-match-target" data-kind="text">
      <MarkdownInline
        className="playsay-match-text-target playsay-match-markdown"
        value={pair.right || t("materials.renderer.pictureAria", { index: optionIndex + 1 })}
      />
    </span>
  );
}

function pairTargetKindLabel(
  pair: MaterialMatchingPair,
  t: ReturnType<typeof useAppTranslation>["t"],
  index: number,
): string {
  if (materialMatchingPairTargetKind(pair) === "IMAGE") {
    return t("materials.renderer.pictureAria", { index: index + 1 });
  }
  return pair.right;
}
