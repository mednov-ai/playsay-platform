import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Loader2, Sparkles } from "lucide-react";
import {
  emptyMaterialMatchingPairs,
  materialAnswerAttempts,
  materialAnswerHints,
  materialAnswerMatches,
  materialAssetIdFromUrl,
  materialMatchingPairTargetKind,
  materialMatchingStatus,
  matchingRightOptionsForMode,
  resolveMaterialImageUrl,
  type MaterialAnswerBlock,
  type MaterialEditorBlock,
  type MaterialRenderMode,
} from "../../model/materialDocument";
import { MarkdownInline } from "../markdown/RenderedMarkdown";
import { appendMaterialAttempt } from "./RenderedFillGapExercise";
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
  const matches = materialAnswerMatches(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);
  const matchesKey = Object.entries(matches).map(([leftId, rightId]) => `${leftId}:${rightId}`).sort().join("|");
  const [lines, setLines] = useState<Array<{ id: string; x1: number; x2: number; y1: number; y2: number }>>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    function updateLines() {
      const container = containerRef.current;
      if (!container) {
        setLines([]);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const nextLines = Object.entries(matches).flatMap(([leftId, rightId]) => {
        const leftNode = leftRefs.current[leftId];
        const rightNode = rightRefs.current[rightId];
        if (!leftNode || !rightNode) {
          return [];
        }

        const leftRect = leftNode.getBoundingClientRect();
        const rightRect = rightNode.getBoundingClientRect();
        return [{
          id: leftId,
          x1: leftRect.right - containerRect.left,
          y1: leftRect.top + leftRect.height / 2 - containerRect.top,
          x2: rightRect.left - containerRect.left,
          y2: rightRect.top + rightRect.height / 2 - containerRect.top,
        }];
      });
      setLines(nextLines);
    }

    updateLines();
    window.addEventListener("resize", updateLines);
    return () => window.removeEventListener("resize", updateLines);
  }, [matchesKey, rightOptions]);

  function connectPair(rightId: string) {
    if (!activeLeftId) {
      return;
    }

    onAnswerChange?.(block.id, {
      type: "matchingPairs",
      matches: {
        ...matches,
        [activeLeftId]: rightId,
      },
      attempts: appendMaterialAttempt(attempts, activeLeftId, rightId, activeLeftId === rightId),
      hints,
    });
    setActiveLeftId(null);
  }

  if (pairs.length === 0) {
    return (
      <div className="playsay-match-empty">
        <Link2 className="h-5 w-5 text-primary" />
        <span>Matching pairs</span>
      </div>
    );
  }

  return (
    <div className="playsay-matching-exercise" ref={containerRef}>
      <svg className="playsay-match-lines" aria-hidden="true">
        {lines.map((line) => (
          <line key={line.id} x1={line.x1} x2={line.x2} y1={line.y1} y2={line.y2} />
        ))}
      </svg>
      <div className="playsay-match-rows">
        {pairs.map((leftPair, index) => {
          const pair = rightOptions[index] ?? leftPair;
          const pairTargetKind = materialMatchingPairTargetKind(pair);
          const assetId = materialAssetIdFromUrl(pair.imageUrl);
          const imageUrl = pairTargetKind === "IMAGE" ? resolveMaterialImageUrl(pair.imageUrl, assetUrls) : undefined;
          const hasPendingAsset = Boolean(pairTargetKind === "IMAGE" && assetId && !imageUrl);
          const connected = Object.values(matches).includes(pair.id);
          return (
            <div className="playsay-match-row" key={leftPair.id}>
              <button
                className="playsay-match-word"
                data-active={activeLeftId === leftPair.id ? "true" : "false"}
                data-connected={matches[leftPair.id] ? "true" : "false"}
                data-status={materialMatchingStatus(leftPair.id, matches[leftPair.id], attempts[leftPair.id], block.assessment)}
                onClick={() => setActiveLeftId((current) => (current === leftPair.id ? null : leftPair.id))}
                ref={(node) => { leftRefs.current[leftPair.id] = node; }}
                type="button"
              >
                <MarkdownInline className="playsay-match-markdown" value={leftPair.left} />
              </button>
              <button
                aria-label={pairTargetKind === "IMAGE" ? t("materials.renderer.pictureAria", { index: index + 1 }) : pair.right}
                className="playsay-match-picture"
                data-connected={connected ? "true" : "false"}
                data-kind={pairTargetKind.toLowerCase()}
                onClick={() => connectPair(pair.id)}
                ref={(node) => { rightRefs.current[pair.id] = node; }}
                type="button"
              >
                {pairTargetKind === "IMAGE" ? (
                  <>
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
                  </>
                ) : (
                  <MarkdownInline className="playsay-match-text-target playsay-match-markdown" value={pair.right} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
