import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { CircleAlert, ExternalLink, Gamepad2, ImageIcon, Maximize2, Play, Video } from "lucide-react";
import { createMaterialVideoPlayback, type MaterialVideoPlayback } from "../../../../shared/api/playsay";
import {
  clampNumber,
  materialAnswerContextForBlock,
  materialAnswerText,
  materialAssetIdFromUrl,
  materialBlockContextLabel,
  resolveMaterialImageUrl,
  type MaterialAnswerBlock,
  type MaterialEditorBlock,
  type MaterialEditorPage,
  type MaterialExerciseInteraction,
  type MaterialExerciseParticipant,
  type MaterialRenderMode,
  type MaterialVideoSync,
} from "../../model/materialDocument";
import { RenderedMarkdown, MarkdownInline } from "../markdown/RenderedMarkdown";
import { PlaySayRelayVideoPlayer } from "../media/PlaySayRelayVideoPlayer";
import { YouTubeSyncedPlayer } from "../media/YouTubeSyncedPlayer";
import { materialVideoEmbedFrame } from "../media/videoEmbed";
import { MaterialImageInlineTools, MaterialImagePromptPopover } from "./MaterialImageInlineTools";
import { RenderedChoiceExercise } from "./RenderedChoiceExercise";
import { RenderedFillGapExercise } from "./RenderedFillGapExercise";
import { RenderedMatchingPairsExercise } from "./RenderedMatchingPairsExercise";
import { useAppTranslation } from "../../../../shared/i18n";

type MaterialVideoQuality = "LOW" | "MEDIUM" | "HIGH";

export function RenderedMaterialBlock({
  allowVideoFullscreen = false,
  answer,
  assetsLoading = false,
  assetTags,
  assetUrls,
  block,
  mode,
  onAnswerChange,
  exerciseParticipants = [],
  onExerciseInteractionChange,
  onAssetTagsChange,
  onBlockPatchCommit,
  onBlockPatch,
  onRequestFocus,
  pageLayout,
  materialId,
  videoSync,
}: {
  allowVideoFullscreen?: boolean;
  answer?: MaterialAnswerBlock;
  assetsLoading?: boolean;
  assetTags: Record<string, string[]>;
  assetUrls: Record<string, string>;
  block: MaterialEditorBlock;
  materialId?: string;
  videoSync?: MaterialVideoSync;
  mode: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  exerciseParticipants?: MaterialExerciseParticipant[];
  onExerciseInteractionChange?: (interaction: MaterialExerciseInteraction | null) => void;
  onAssetTagsChange?: (assetId: string, tags: string[]) => void | Promise<void>;
  onBlockPatchCommit?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatch?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onRequestFocus?: (kind: "htmlGame" | "image" | "externalActivity", blockId: string) => void;
  pageLayout?: MaterialEditorPage["layout"];
}) {
  const { t } = useAppTranslation();
  const [videoPlayback, setVideoPlayback] = useState<MaterialVideoPlayback | null>(null);
  const [videoQuality, setVideoQuality] = useState<MaterialVideoQuality>("MEDIUM");
  const [videoResumeAtSeconds, setVideoResumeAtSeconds] = useState<number | null>(null);
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

    setVideoPlayback({
      materialId,
      blockId: block.id,
      mode: "NEEDS_REVIEW",
      reason: "VIDEO_PLAYBACK_LOADING",
    });

    createMaterialVideoPlayback(materialId, { blockId: block.id, quality: videoQuality })
      .then((decision) => {
        if (active) {
          setVideoPlayback(decision);
        }
      })
      .catch(() => {
        if (active) {
          setVideoPlayback({
            materialId,
            blockId: block.id,
            mode: "BLOCKED",
            reason: "VIDEO_PLAYBACK_DECISION_FAILED",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [block.id, block.provider, block.type, materialId, videoQuality]);

  const blockSection = (children: ReactNode, className = "playsay-render-block") => (
    <section
      className={`${className}${pageLayout === "STATIC_IMAGE" ? " playsay-render-block-static-image" : ""}`}
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
        const originalVideoUrl = safeExternalVideoUrl(block.url);
        const videoHeight = block.height ? `${block.height}px` : undefined;
        const videoFrameStyle = { "--playsay-video-height": videoHeight } as CSSProperties;
        const isVideoResizable = mode === "teacherPreview" && Boolean(onBlockPatch);
        const videoAttribution = originalVideoUrl ? (
          <p className="playsay-video-attribution">
            <span>{t("materials.renderer.videoCopyright", { provider: videoProviderLabel(block.provider) ?? t("materials.renderer.videoProviderFallback") })}</span>
            <a href={originalVideoUrl} rel="noreferrer" target="_blank">
              {t("materials.renderer.videoOriginalLink")}
            </a>
          </p>
        ) : null;
        const reasonKey = frame?.reason ? `materials.renderer.videoRelayReasons.${frame.reason}` : "materials.renderer.videoRelayReasons.UNKNOWN";
        const reasonLabel = frame?.reason
          ? t(reasonKey, { defaultValue: t("materials.renderer.videoRelayReasons.UNKNOWN") })
          : t("materials.renderer.videoRelayReasons.UNKNOWN");
        return blockSection(
          <>
            <h4>{block.title}</h4>
            {frame?.kind === "RF_RELAY" ? (
              <>
                <div
                  className="playsay-video-embed"
                  data-playsay-video-playback-mode="RF_RELAY"
                  data-editable={isVideoResizable ? "true" : "false"}
                  style={videoFrameStyle}
                >
                  <PlaySayRelayVideoPlayer
                    allowFullscreen={allowVideoFullscreen}
                    blockId={block.id}
                    clip={block.videoClip}
                    onQualityChange={(quality, currentTimeSeconds) => {
                      setVideoResumeAtSeconds(currentTimeSeconds);
                      setVideoQuality(quality);
                    }}
                    quality={videoQuality}
                    resumeAtSeconds={videoResumeAtSeconds}
                    src={frame.src}
                    thumbnailUrl={frame.thumbnailUrl}
                    title={frame.title}
                    sync={videoSync}
                  />
                </div>
                {isVideoResizable ? (
                  <MaterialVideoResizeHandle
                    block={block}
                    onResize={(height) => onBlockPatch?.(block.id, { height })}
                    onResizeCommit={(height) => onBlockPatchCommit?.(block.id, { height })}
                  />
                ) : null}
                {videoAttribution}
              </>
            ) : frame?.kind === "PENDING" ? (
              <>
                <div
                  className="playsay-video-relay-pending"
                  data-playsay-video-playback-mode={frame.mode ?? "UNKNOWN"}
                  data-playsay-video-playback-reason={frame.reason ?? "UNKNOWN"}
                  role="status"
                >
                  <span aria-hidden="true" />
                  <small>{reasonLabel}</small>
                </div>
                {videoAttribution}
              </>
            ) : frame?.kind === "UNAVAILABLE" ? (
              <>
                <div
                  className="playsay-video-relay-unavailable"
                  data-playsay-video-playback-mode={frame.mode ?? "UNKNOWN"}
                  data-playsay-video-playback-reason={frame.reason ?? "UNKNOWN"}
                  role="status"
                >
                  <CircleAlert className="h-5 w-5 text-primary" />
                  <span>{t("materials.renderer.videoRelayUnavailable")}</span>
                  <small>{reasonLabel}</small>
                  {frame.reason ? <code>{t("materials.renderer.videoRelayReasonCode", { reason: frame.reason })}</code> : null}
                </div>
                {videoAttribution}
              </>
            ) : frame ? (
              <>
                <div
                  className="playsay-video-embed"
                  data-playsay-video-playback-mode="EMBED"
                  data-editable={isVideoResizable ? "true" : "false"}
                  style={videoFrameStyle}
                >
                  {(block.provider ?? "").toUpperCase() === "YOUTUBE" && videoSync ? (
                    <YouTubeSyncedPlayer
                      allowFullscreen={allowVideoFullscreen}
                      blockId={block.id}
                      src={frame.src}
                      sync={videoSync}
                      title={frame.title}
                    />
                  ) : (
                    <iframe
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen={allowVideoFullscreen}
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      src={frame.src}
                      title={frame.title}
                    />
                  )}
                </div>
                {isVideoResizable ? (
                  <MaterialVideoResizeHandle
                    block={block}
                    onResize={(height) => onBlockPatch?.(block.id, { height })}
                    onResizeCommit={(height) => onBlockPatchCommit?.(block.id, { height })}
                  />
                ) : null}
                {videoAttribution}
              </>
            ) : (
              <>
                <div className="playsay-video-embed-placeholder">
                  <Video className="h-5 w-5 text-primary" />
                  <span>{block.provider?.trim() || t("materials.renderer.videoProviderFallback")}</span>
                  <small>{block.url || t("materials.renderer.videoLinkPlaceholder")}</small>
                </div>
                {videoAttribution}
              </>
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
        const imageSize = block.imageSize ?? "MEDIUM";
        const objectFit = block.objectFit ?? (pageLayout === "STATIC_IMAGE" ? "contain" : undefined);
        const canFocusImage = Boolean(onRequestFocus)
          || pageLayout === "STATIC_IMAGE"
          || imageSize === "LARGE"
          || imageSize === "FULL";
        return blockSection(
          <>
            {pageLayout === "STATIC_IMAGE" ? null : <h4>{block.title}</h4>}
            {imageUrl ? (
              <figure
                className={`playsay-rendered-image${pageLayout === "STATIC_IMAGE" ? " playsay-rendered-image-static" : ""}`}
                data-playsay-annotation-anchor={pageLayout === "STATIC_IMAGE" ? "true" : undefined}
                data-editable={mode === "teacherPreview" && Boolean(onBlockPatch) ? "true" : "false"}
                data-image-size={imageSize}
                style={{ "--playsay-image-height": imageHeight, "--playsay-image-fit": objectFit } as CSSProperties}
              >
                <img
                  alt={block.alt || block.caption || block.prompt || block.title}
                  data-playsay-annotation-anchor-id={block.id}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  src={imageUrl}
                />
                {canFocusImage ? (
                  <button
                    aria-label={t("materials.renderer.expandImage", { title: block.title })}
                    className="playsay-material-focus-trigger"
                    data-testid={`material-image-focus-${block.id}`}
                    onClick={() => onRequestFocus?.("image", block.id)}
                    title={t("materials.renderer.expandImage", { title: block.title })}
                    type="button"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                ) : null}
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
                {pageLayout !== "STATIC_IMAGE" && block.caption ? <figcaption><RenderedMarkdown className="playsay-caption-markdown" value={block.caption} /></figcaption> : null}
              </figure>
            ) : (
              <figure className="playsay-image-placeholder">
                <ImageIcon className="h-6 w-6 text-primary" />
                <figcaption>
                  <RenderedMarkdown
                    className="playsay-caption-markdown"
                    value={block.caption
                      || block.prompt
                      || (assetId
                        ? assetsLoading
                          ? t("materials.renderer.imageLoading")
                          : t("materials.renderer.imageUnavailable")
                        : block.url || t("materials.renderer.imageFallback"))}
                  />
                </figcaption>
                {mode === "teacherPreview" ? (
                  <MaterialImagePromptPopover block={block} />
                ) : null}
              </figure>
            )}
          </>,
        );
      }
    case "htmlGame":
      {
        const gameIconUrl = resolveMaterialImageUrl(block.gameIconUrl, assetUrls);
        return blockSection(
          <button
            aria-label={t("materials.renderer.launchGame", { title: block.title })}
            className="playsay-html-game-app"
            data-playsay-launcher-for={block.id}
            data-testid={`html-game-launch-${block.id}`}
            onClick={() => onRequestFocus?.("htmlGame", block.id)}
            type="button"
          >
            <span className="playsay-html-game-app-icon">
              {gameIconUrl
                ? <img alt="" src={gameIconUrl} />
                : <Gamepad2 className="h-7 w-7" />}
            </span>
            <span className="playsay-html-game-app-copy">
              <strong>{block.title}</strong>
              <small>{t("materials.renderer.gameApplication")}</small>
            </span>
            <span className="playsay-html-game-app-launch"><Play className="h-4 w-4 fill-current" /></span>
          </button>,
          "playsay-render-block playsay-render-block-html-game",
        );
      }
    case "externalActivity":
      return blockSection(
        <button
          aria-label={t("materials.renderer.launchExternalActivity", { title: block.title })}
          className="playsay-html-game-app playsay-external-activity-app"
          data-testid={`external-activity-launch-${block.id}`}
          onClick={() => onRequestFocus?.("externalActivity", block.id)}
          type="button"
        >
          <span className="playsay-html-game-app-icon"><ExternalLink className="h-7 w-7" /></span>
          <span className="playsay-html-game-app-copy">
            <strong>{block.title}</strong>
            <small>{t("materials.renderer.externalActivityApplication", { provider: block.provider ?? "EXPERIMENTAL" })}</small>
          </span>
          <span className="playsay-html-game-app-launch"><Play className="h-4 w-4 fill-current" /></span>
        </button>,
        "playsay-render-block playsay-render-block-external-activity",
      );
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
          <RenderedFillGapExercise
            answer={answer}
            block={block}
            onAnswerChange={onAnswerChange}
            participants={exerciseParticipants}
            onInteractionChange={onExerciseInteractionChange}
          />
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
            participants={exerciseParticipants}
            onInteractionChange={onExerciseInteractionChange}
          />
        </>,
      );
    case "freeWriting":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedMarkdown value={block.prompt} />
          <RenderedFreeWritingAnswer
            answer={answer}
            block={block}
            materialId={materialId}
            onAnswerChange={onAnswerChange}
            placeholder={t("materials.renderer.studentAnswerPlaceholder")}
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

function RenderedFreeWritingAnswer({
  answer,
  block,
  materialId,
  onAnswerChange,
  placeholder,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  materialId?: string;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  placeholder: string;
}) {
  const externalText = materialAnswerText(answer);
  const resetKey = `${materialId ?? "preview"}:${block.id}`;
  const [draft, setDraft] = useState(externalText);
  const editingRef = useRef(false);
  const composingRef = useRef(false);
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      editingRef.current = false;
      composingRef.current = false;
      setDraft(externalText);
      return;
    }
    if (!editingRef.current && !composingRef.current) {
      setDraft(externalText);
    }
  }, [externalText, resetKey]);

  function publish(nextText: string) {
    onAnswerChange?.(block.id, {
      type: "freeWriting",
      text: nextText,
      context: materialAnswerContextForBlock(block),
    });
  }

  return (
    <textarea
      className="playsay-student-answer"
      data-playsay-native-input="true"
      onBlur={(event) => {
        editingRef.current = false;
        if (!composingRef.current) publish(event.currentTarget.value);
      }}
      onChange={(event) => {
        const nextText = event.currentTarget.value;
        setDraft(nextText);
        publish(nextText);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const nextText = event.currentTarget.value;
        setDraft(nextText);
        publish(nextText);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
        editingRef.current = true;
      }}
      onFocus={() => {
        editingRef.current = true;
      }}
      placeholder={placeholder}
      value={draft}
    />
  );
}

function MaterialVideoResizeHandle({
  block,
  onResize,
  onResizeCommit,
}: {
  block: MaterialEditorBlock;
  onResize?: (height: number) => void;
  onResizeCommit?: (height: number) => void;
}) {
  const { t } = useAppTranslation();

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    if (!onResize) {
      return;
    }

    const applyResize = onResize;
    event.preventDefault();
    const startY = event.clientY;
    const frame = event.currentTarget.previousElementSibling;
    const startHeight = block.height ?? frame?.getBoundingClientRect().height ?? 320;
    let latestHeight = Math.round(startHeight);

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      latestHeight = Math.round(clampNumber(startHeight + moveEvent.clientY - startY, 180, 720));
      applyResize(latestHeight);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      applyResize(latestHeight);
      onResizeCommit?.(latestHeight);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <button
      aria-label={t("materials.renderer.resizeVideo")}
      className="playsay-video-resize-handle"
      onPointerDown={startResize}
      title={t("materials.renderer.resizeVideo")}
      type="button"
    />
  );
}

function safeExternalVideoUrl(value?: string): string | null {
  const cleanValue = value?.trim();
  if (!cleanValue) {
    return null;
  }
  try {
    const url = new URL(cleanValue);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    try {
      const url = new URL(`https://${cleanValue}`);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }
}

function videoProviderLabel(value?: string): string | undefined {
  const provider = value?.trim().toUpperCase();
  if (provider === "YOUTUBE") {
    return "YouTube";
  }
  if (provider === "RUTUBE") {
    return "Rutube";
  }
  if (provider === "VK") {
    return "VK";
  }
  return provider || undefined;
}
