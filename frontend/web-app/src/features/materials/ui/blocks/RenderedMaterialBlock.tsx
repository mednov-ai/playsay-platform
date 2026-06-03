import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ImageIcon, Video } from "lucide-react";
import { createMaterialVideoPlayback, type MaterialVideoPlayback } from "../../../../shared/api/playsay";
import {
  materialAnswerContextForBlock,
  materialAnswerText,
  materialAssetIdFromUrl,
  materialBlockContextLabel,
  resolveMaterialImageUrl,
  type MaterialAnswerBlock,
  type MaterialEditorBlock,
  type MaterialRenderMode,
} from "../../model/materialDocument";
import { RenderedMarkdown, MarkdownInline } from "../markdown/RenderedMarkdown";
import { materialVideoEmbedFrame } from "../media/videoEmbed";
import { MaterialImageInlineTools, MaterialImagePromptPopover } from "./MaterialImageInlineTools";
import { RenderedChoiceExercise } from "./RenderedChoiceExercise";
import { RenderedFillGapExercise } from "./RenderedFillGapExercise";
import { RenderedMatchingPairsExercise } from "./RenderedMatchingPairsExercise";
import { useAppTranslation } from "../../../../shared/i18n";

export function RenderedMaterialBlock({
  answer,
  assetTags,
  assetUrls,
  block,
  mode,
  onAnswerChange,
  onAssetTagsChange,
  onBlockPatchCommit,
  onBlockPatch,
  materialId,
}: {
  answer?: MaterialAnswerBlock;
  assetTags: Record<string, string[]>;
  assetUrls: Record<string, string>;
  block: MaterialEditorBlock;
  materialId?: string;
  mode: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  onAssetTagsChange?: (assetId: string, tags: string[]) => void | Promise<void>;
  onBlockPatchCommit?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatch?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
}) {
  const { t } = useAppTranslation();
  const [videoPlayback, setVideoPlayback] = useState<MaterialVideoPlayback | null>(null);
  const contextLabel = materialBlockContextLabel(block);

  useEffect(() => {
    let active = true;
    const provider = (block.provider ?? "").toUpperCase();
    if (block.type !== "videoEmbed" || provider !== "YOUTUBE" || !materialId || materialId === "preview") {
      setVideoPlayback(null);
      return () => {
        active = false;
      };
    }

    createMaterialVideoPlayback(materialId, { blockId: block.id })
      .then((decision) => {
        if (active) {
          setVideoPlayback(decision);
        }
      })
      .catch(() => {
        if (active) {
          setVideoPlayback(null);
        }
      });

    return () => {
      active = false;
    };
  }, [block.id, block.provider, block.type, materialId]);

  const blockSection = (children: ReactNode, className = "playsay-render-block") => (
    <section
      className={className}
      data-playsay-block-id={block.id}
      data-playsay-block-type={block.type}
      data-playsay-context-label={contextLabel}
    >
      <span className="playsay-visually-hidden">{contextLabel}</span>
      {children}
    </section>
  );

  switch (block.type) {
    case "text":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedMarkdown value={block.body} />
        </>,
      );
    case "videoEmbed":
      {
        const frame = materialVideoEmbedFrame(block, videoPlayback);
        return blockSection(
          <>
            <h4>{block.title}</h4>
            {frame?.kind === "RF_RELAY" ? (
              <div className="playsay-video-embed">
                <video controls preload="metadata" src={frame.src} title={frame.title}>
                  {t("materials.renderer.videoPlaybackUnsupported")}
                </video>
              </div>
            ) : frame ? (
              <div className="playsay-video-embed">
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  src={frame.src}
                  title={frame.title}
                />
              </div>
            ) : (
              <div className="playsay-video-embed-placeholder">
                <Video className="h-5 w-5 text-primary" />
                <span>{block.provider ?? "VIDEO"}</span>
                <small>{block.url || t("materials.renderer.videoLinkPlaceholder")}</small>
              </div>
            )}
          </>,
        );
      }
    case "image":
    case "generatedImage":
      {
        const assetId = materialAssetIdFromUrl(block.url);
        const imageUrl = resolveMaterialImageUrl(block.url, assetUrls);
        const imageHeight = block.height ? `${block.height}px` : undefined;
        return blockSection(
          <>
            <h4>{block.title}</h4>
            {imageUrl ? (
              <figure
                className="playsay-rendered-image"
                data-editable={mode === "teacherPreview" && Boolean(onBlockPatch) ? "true" : "false"}
                style={{ "--playsay-image-height": imageHeight } as CSSProperties}
              >
                <img alt={block.caption || block.prompt || block.title} src={imageUrl} />
                {mode === "teacherPreview" ? (
                  <MaterialImageInlineTools
                    assetId={assetId}
                    block={block}
                    onAssetTagsChange={onAssetTagsChange}
                    onResizeCommit={(height) => onBlockPatchCommit?.(block.id, { height })}
                    onResize={(height) => onBlockPatch?.(block.id, { height })}
                    tags={assetId ? assetTags[assetId] ?? [] : []}
                  />
                ) : null}
                {block.caption ? <figcaption><RenderedMarkdown className="playsay-caption-markdown" value={block.caption} /></figcaption> : null}
              </figure>
            ) : (
              <figure className="playsay-image-placeholder">
                <ImageIcon className="h-6 w-6 text-primary" />
                <figcaption><RenderedMarkdown className="playsay-caption-markdown" value={block.caption || block.prompt || block.url || t("materials.renderer.imageFallback")} /></figcaption>
                {mode === "teacherPreview" ? (
                  <MaterialImagePromptPopover block={block} />
                ) : null}
              </figure>
            )}
          </>,
        );
      }
    case "flashcards":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <div className="playsay-flashcards">
            {(block.cards ?? []).map((card) => (
              <article key={card.id}>
                <strong><MarkdownInline value={card.front} /></strong>
                <span><MarkdownInline value={card.back} /></span>
                {card.example ? <small><MarkdownInline value={card.example} /></small> : null}
              </article>
            ))}
          </div>
        </>,
      );
    case "fillGaps":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedFillGapExercise answer={answer} block={block} onAnswerChange={onAnswerChange} />
        </>,
        "playsay-render-block playsay-render-block-fill-gaps",
      );
    case "multipleChoice":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedChoiceExercise answer={answer} block={block} onAnswerChange={onAnswerChange} />
        </>,
      );
    case "matchingPairs":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedMatchingPairsExercise
            answer={answer}
            assetUrls={assetUrls}
            block={block}
            mode={mode}
            onAnswerChange={onAnswerChange}
          />
        </>,
      );
    case "freeWriting":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedMarkdown value={block.prompt} />
          <textarea
            className="playsay-student-answer"
            onChange={(event) => onAnswerChange?.(block.id, {
              type: "freeWriting",
              text: event.target.value,
              context: materialAnswerContextForBlock(block),
            })}
            placeholder={t("materials.renderer.studentAnswerPlaceholder")}
            value={materialAnswerText(answer)}
          />
        </>,
      );
    case "speakingPrompt":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedMarkdown value={block.prompt} />
        </>,
        "playsay-render-block playsay-speaking-prompt",
      );
    case "drawingArea":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <div className="playsay-drawing-area" style={{ minHeight: block.height ?? 220 }} />
        </>,
      );
    default:
      return null;
  }
}
