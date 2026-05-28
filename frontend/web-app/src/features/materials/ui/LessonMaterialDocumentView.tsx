import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  CheckCircle2,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  Sparkles,
  Video,
} from "lucide-react";
import { fetchMaterialAssetObjectUrl, fetchMaterialAssets, type LessonMaterial, type LessonMaterialAsset } from "../../../shared/api/playsay";
import {
  MAX_MANUAL_INPUT_HINTS,
  MaterialAnswerBlock,
  MaterialAnswerState,
  MaterialAnswerStatus,
  MaterialAttemptEntry,
  MaterialEditorBlock,
  MaterialExerciseItem,
  MaterialHintEntry,
  MaterialMatchingPair,
  MaterialRenderMode,
  MaterialVideoEmbedFrame,
  clampNumber,
  cleanMaterialAssessment,
  defaultMaterialPage,
  defaultObjectiveAssessmentPolicy,
  emptyMaterialMatchingPairs,
  editorDocumentFromJson,
  formatMaterialScore,
  materialAnswerAttempts,
  materialAnswerHints,
  materialAnswerItems,
  materialAnswerMatches,
  materialAnswerText,
  materialAnswerContextForBlock,
  materialAnswerStatus,
  materialAssetIdFromUrl,
  materialAssetTagsMap,
  materialBlockContextLabel,
  materialDocumentAssetIds,
  materialItemAnswerMatches,
  materialMaxScore,
  materialMatchingPairTargetKind,
  materialMatchingStatus,
  resolveMaterialImageUrl,
} from "../model/materialDocument";

export function LessonMaterialDocumentView({
  answers = {},
  material,
  mode = "classroom",
  onAnswerChange,
  onAssetTagsChange,
  onBlockPatchCommit,
  onBlockPatch,
  score,
}: {
  answers?: MaterialAnswerState;
  material: LessonMaterial;
  mode?: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  onAssetTagsChange?: (assetId: string, tags: string[]) => Promise<LessonMaterialAsset | null>;
  onBlockPatchCommit?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatch?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  score?: number | null;
}) {
  const document = editorDocumentFromJson(material.document);
  const page = document.pages[0] ?? defaultMaterialPage(material.title);
  const maxScore = materialMaxScore(material.scoringRubric);
  const assetIds = materialDocumentAssetIds(document);
  const assetKey = assetIds.join("|");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [assetTags, setAssetTags] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let active = true;
    const objectUrls = new Set<string>();

    if (material.id === "preview" || assetKey.length === 0) {
      setAssetUrls({});
      setAssetTags({});
      return () => {
        active = false;
      };
    }

    fetchMaterialAssets(material.id)
      .then(async (assets) => {
        const entries = await Promise.all(assets.map(async (asset) => {
          const externalUrl = asset.externalUrl?.trim();
          if (externalUrl) {
            return [asset.id, externalUrl] as const;
          }

          if (!asset.contentUrl?.trim()) {
            return null;
          }

          const objectUrl = await fetchMaterialAssetObjectUrl(material.id, asset.id);
          if (!active) {
            URL.revokeObjectURL(objectUrl);
            return null;
          }
          objectUrls.add(objectUrl);
          return [asset.id, objectUrl] as const;
        }));

        if (active) {
          setAssetUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)));
          setAssetTags(materialAssetTagsMap(assets));
        }
      })
      .catch(() => {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls.clear();
        if (active) {
          setAssetUrls({});
          setAssetTags({});
        }
      });

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, [assetKey, material.id, material.updatedAt]);

  return (
    <div className="playsay-rendered-material">
      <div className="playsay-material-score-badge">
        <span>{material.cefrLevel}</span>
        <strong>{formatMaterialScore(score ?? maxScore)}</strong>
      </div>
      <div className="playsay-task-kicker">
        <FileText className="h-4 w-4 text-primary" />
        {material.title}
      </div>
      <h3>{page.title}</h3>
      {material.description ? <p className="playsay-task-subtitle">{material.description}</p> : null}
      <div className="playsay-material-blocks">
        {page.blocks.map((block) => (
          <RenderedMaterialBlock
            answer={answers[block.id]}
            assetTags={assetTags}
            assetUrls={assetUrls}
            block={block}
            key={block.id}
            mode={mode}
            onAnswerChange={onAnswerChange}
            onAssetTagsChange={async (assetId, tags) => {
              setAssetTags((current) => ({ ...current, [assetId]: tags }));
              await onAssetTagsChange?.(assetId, tags);
            }}
            onBlockPatchCommit={onBlockPatchCommit}
            onBlockPatch={onBlockPatch}
          />
        ))}
      </div>
    </div>
  );
}

function RenderedMaterialBlock({
  answer,
  assetTags,
  assetUrls,
  block,
  mode,
  onAnswerChange,
  onAssetTagsChange,
  onBlockPatchCommit,
  onBlockPatch,
}: {
  answer?: MaterialAnswerBlock;
  assetTags: Record<string, string[]>;
  assetUrls: Record<string, string>;
  block: MaterialEditorBlock;
  mode: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  onAssetTagsChange?: (assetId: string, tags: string[]) => void | Promise<void>;
  onBlockPatchCommit?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatch?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
}) {
  const contextLabel = materialBlockContextLabel(block);
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
        const frame = materialVideoEmbedFrame(block);
        return blockSection(
          <>
            <h4>{block.title}</h4>
            {frame ? (
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
                <small>{block.url || "Ссылка на видео будет здесь"}</small>
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
                <figcaption><RenderedMarkdown className="playsay-caption-markdown" value={block.caption || block.prompt || block.url || "Изображение"} /></figcaption>
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
            placeholder="Ответ ученика"
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

function MaterialImageInlineTools({
  assetId,
  block,
  onAssetTagsChange,
  onResizeCommit,
  onResize,
  tags,
}: {
  assetId: string | null;
  block: MaterialEditorBlock;
  onAssetTagsChange?: (assetId: string, tags: string[]) => void | Promise<void>;
  onResizeCommit?: (height: number) => void;
  onResize?: (height: number) => void;
  tags: string[];
}) {
  function startResize(event: PointerEvent<HTMLButtonElement>) {
    if (!onResize) {
      return;
    }

    event.preventDefault();
    const resize = onResize;
    const startY = event.clientY;
    const startHeight = block.height ?? event.currentTarget.closest("figure")?.querySelector("img")?.getBoundingClientRect().height ?? 320;
    let latestHeight = Math.round(startHeight);

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      latestHeight = Math.round(clampNumber(startHeight + moveEvent.clientY - startY, 120, 720));
      resize(latestHeight);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      resize(latestHeight);
      onResizeCommit?.(latestHeight);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <div className="playsay-image-tools">
      <MaterialImagePromptPopover block={block} />
      {assetId ? (
        <MaterialAssetTags
          assetId={assetId}
          onChange={onAssetTagsChange}
          tags={tags}
        />
      ) : null}
      {onResize ? (
        <button
          aria-label="Изменить размер картинки"
          className="playsay-image-resize-handle"
          onPointerDown={startResize}
          title="Изменить размер картинки"
          type="button"
        />
      ) : null}
    </div>
  );
}

function MaterialImagePromptPopover({ block }: { block: MaterialEditorBlock }) {
  const [open, setOpen] = useState(false);
  const prompt = block.prompt?.trim() || block.caption?.trim() || block.title || "Сгенерировать картинку для этого блока.";

  return (
    <span className="playsay-image-prompt">
      <button
        aria-expanded={open}
        aria-label="Показать промпт картинки"
        className="playsay-image-prompt-button"
        onClick={() => setOpen((current) => !current)}
        title="Промпт картинки"
        type="button"
      >
        <Sparkles className="h-4 w-4" />
      </button>
      {open ? (
        <span className="playsay-image-prompt-popover" role="dialog">
          <strong>Промпт</strong>
          <span>{prompt}</span>
        </span>
      ) : null}
    </span>
  );
}

function MaterialAssetTags({
  assetId,
  onChange,
  tags,
}: {
  assetId: string;
  onChange?: (assetId: string, tags: string[]) => void | Promise<void>;
  tags: string[];
}) {
  const [draftTag, setDraftTag] = useState("");

  function commitTag(value: string) {
    const normalized = normalizeMaterialTag(value);
    if (!normalized || !onChange) {
      setDraftTag("");
      return;
    }
    void onChange(assetId, uniqueMaterialTags([...tags, normalized]));
    setDraftTag("");
  }

  function removeTag(tag: string) {
    if (!onChange) {
      return;
    }
    void onChange(assetId, tags.filter((current) => current !== tag));
  }

  return (
    <span className="playsay-image-tags" aria-label="Теги картинки">
      {tags.slice(0, 8).map((tag) => (
        <button
          className="playsay-image-tag"
          key={tag}
          onClick={() => removeTag(tag)}
          title="Убрать тег"
          type="button"
        >
          {tag}
        </button>
      ))}
      <input
        className="playsay-image-tag-input"
        disabled={!onChange}
        maxLength={40}
        onChange={(event) => setDraftTag(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitTag(draftTag);
          }
        }}
        placeholder="+ тег"
        value={draftTag}
      />
    </span>
  );
}

function materialVideoEmbedFrame(block: MaterialEditorBlock): MaterialVideoEmbedFrame | null {
  const provider = (block.provider ?? "").toUpperCase();
  if (provider === "YOUTUBE") {
    return youtubeEmbedFrame(block.url, block.title);
  }
  if (provider === "RUTUBE") {
    return rutubeEmbedFrame(block.url, block.title);
  }
  return null;
}

function youtubeEmbedFrame(value?: string, title = "YouTube video"): MaterialVideoEmbedFrame | null {
  const url = parseExternalUrl(value);
  if (!url) {
    return null;
  }

  const hostname = normalizedHostname(url);
  let videoId: string | null = null;
  if (hostname === "youtu.be") {
    videoId = sanitizedPathSegment(url.pathname.split("/").filter(Boolean)[0]);
  } else if (hostname === "youtube.com" || hostname === "youtube-nocookie.com" || hostname === "m.youtube.com" || hostname === "music.youtube.com") {
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts[0] === "watch") {
      videoId = sanitizedYoutubeId(url.searchParams.get("v"));
    } else if (["embed", "shorts", "live", "v"].includes(pathParts[0])) {
      videoId = sanitizedYoutubeId(pathParts[1]);
    }
  }

  if (!videoId) {
    return null;
  }

  const params = new URLSearchParams({ rel: "0" });
  const start = youtubeStartSeconds(url.searchParams.get("start") ?? url.searchParams.get("t"));
  if (start > 0) {
    params.set("start", String(start));
  }

  return {
    src: `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`,
    title: title || "YouTube video",
  };
}

function rutubeEmbedFrame(value?: string, title = "Rutube video"): MaterialVideoEmbedFrame | null {
  const url = parseExternalUrl(value);
  if (!url) {
    return null;
  }

  const hostname = normalizedHostname(url);
  if (hostname !== "rutube.ru") {
    return null;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const videoId = pathParts[0] === "play" && pathParts[1] === "embed"
    ? sanitizedPathSegment(pathParts[2])
    : pathParts[0] === "video"
      ? sanitizedPathSegment(pathParts[1])
      : null;
  if (!videoId) {
    return null;
  }

  return {
    src: `https://rutube.ru/play/embed/${videoId}`,
    title: title || "Rutube video",
  };
}

function parseExternalUrl(value?: string): URL | null {
  const cleanValue = value?.trim();
  if (!cleanValue) {
    return null;
  }

  try {
    return new URL(cleanValue);
  } catch {
    try {
      return new URL(`https://${cleanValue}`);
    } catch {
      return null;
    }
  }
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function sanitizedYoutubeId(value?: string | null): string | null {
  const cleanValue = value?.trim();
  if (!cleanValue || !/^[A-Za-z0-9_-]{6,32}$/.test(cleanValue)) {
    return null;
  }
  return cleanValue;
}

function sanitizedPathSegment(value?: string | null): string | null {
  const cleanValue = value?.trim();
  if (!cleanValue || !/^[A-Za-z0-9_-]{6,80}$/.test(cleanValue)) {
    return null;
  }
  return cleanValue;
}

function youtubeStartSeconds(value?: string | null): number {
  if (!value) {
    return 0;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (!match) {
    return 0;
  }
  return (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
}

function RenderedMarkdown({ className, value }: { className?: string; value?: string | null }) {
  const text = normalizeMarkdownText(value);
  if (!text) {
    return null;
  }

  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const children = renderMarkdownInline(heading[2], `heading-${index}`);
      nodes.push(heading[1].length === 1
        ? <h5 key={`heading-${index}`}>{children}</h5>
        : <h6 key={`heading-${index}`}>{children}</h6>);
      index += 1;
      continue;
    }

    const unorderedItems: string[] = [];
    while (index < lines.length) {
      const match = /^\s*[-*]\s+(.+)$/.exec(lines[index]);
      if (!match) {
        break;
      }
      unorderedItems.push(match[1]);
      index += 1;
    }
    if (unorderedItems.length > 0) {
      nodes.push(
        <ul key={`ul-${index}`}>
          {unorderedItems.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderMarkdownInline(item, `ul-${index}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const orderedItems: string[] = [];
    while (index < lines.length) {
      const match = /^\s*\d+\.\s+(.+)$/.exec(lines[index]);
      if (!match) {
        break;
      }
      orderedItems.push(match[1]);
      index += 1;
    }
    if (orderedItems.length > 0) {
      nodes.push(
        <ol key={`ol-${index}`}>
          {orderedItems.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderMarkdownInline(item, `ol-${index}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (!currentTrimmed || /^(#{1,3})\s+/.test(currentTrimmed) || /^\s*[-*]\s+/.test(current) || /^\s*\d+\.\s+/.test(current)) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      index += 1;
    }
    nodes.push(<p key={`p-${index}`}>{renderMarkdownLineBreaks(paragraphLines, `p-${index}`)}</p>);
  }

  return <div className={mergeClassName("playsay-markdown", className)}>{nodes}</div>;
}

function MarkdownInline({ className, value }: { className?: string; value?: string | null }) {
  const text = normalizeMarkdownText(value);
  if (!text) {
    return null;
  }

  return <span className={mergeClassName("playsay-markdown-inline", className)}>{renderMarkdownInline(text)}</span>;
}

function normalizeMarkdownText(value?: string | null): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function mergeClassName(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

function renderMarkdownLineBreaks(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, index) => {
    const nodes = renderMarkdownInline(line, `${keyPrefix}-${index}`);
    return index === lines.length - 1 ? nodes : [...nodes, <br key={`${keyPrefix}-br-${index}`} />];
  });
}

function renderMarkdownInline(value: string, keyPrefix = "inline"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let index = 0;
  let nodeIndex = 0;

  function pushText() {
    if (!buffer) {
      return;
    }
    nodes.push(buffer);
    buffer = "";
  }

  while (index < value.length) {
    if (value[index] === "`") {
      const end = value.indexOf("`", index + 1);
      if (end > index + 1) {
        pushText();
        nodes.push(<code key={`${keyPrefix}-code-${nodeIndex}`}>{value.slice(index + 1, end)}</code>);
        nodeIndex += 1;
        index = end + 1;
        continue;
      }
    }

    if (value.startsWith("**", index)) {
      const end = value.indexOf("**", index + 2);
      if (end > index + 2) {
        pushText();
        nodes.push(
          <strong key={`${keyPrefix}-strong-${nodeIndex}`}>
            {renderMarkdownInline(value.slice(index + 2, end), `${keyPrefix}-strong-${nodeIndex}`)}
          </strong>,
        );
        nodeIndex += 1;
        index = end + 2;
        continue;
      }
    }

    if (value[index] === "*" && value[index + 1] !== "*") {
      const end = value.indexOf("*", index + 1);
      if (end > index + 1) {
        pushText();
        nodes.push(
          <em key={`${keyPrefix}-em-${nodeIndex}`}>
            {renderMarkdownInline(value.slice(index + 1, end), `${keyPrefix}-em-${nodeIndex}`)}
          </em>,
        );
        nodeIndex += 1;
        index = end + 1;
        continue;
      }
    }

    buffer += value[index];
    index += 1;
  }

  pushText();
  return nodes;
}

function RenderedFillGapExercise({
  answer,
  block,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const answers = materialAnswerItems(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);

  function updateItemValue(itemKey: string, value: string) {
    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function checkItem(itemKey: string, value = answers[itemKey] ?? "") {
    const item = (block.items ?? []).find((candidate, index) => `${candidate.prompt}-${index}` === itemKey);
    const nextAttempts = appendMaterialAttempt(attempts, itemKey, value, materialItemAnswerMatches(item, value));
    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts: nextAttempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function requestHint(itemKey: string, item: MaterialExerciseItem) {
    const itemHints = hints[itemKey] ?? [];
    const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, true);
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

  function handleManualInputKeyDown(event: KeyboardEvent<HTMLInputElement>, itemKey: string) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    checkItem(itemKey, event.currentTarget.value);
  }

  return (
    <div className="playsay-fill-exercise">
      {(block.items ?? []).map((item, index) => {
        const itemKey = `${item.prompt}-${index}`;
        const options = materialExerciseOptions(item, block);
        const isManualInput = options.length === 0;
        const prompt = splitGapPrompt(item.prompt);
        const itemHints = hints[itemKey] ?? [];
        const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, isManualInput);
        const hintPreview = isManualInput ? materialManualInputHintPreview(item, itemHints) : "";
        const inlineHint = isManualInput ? materialManualInputInlineHint(item, itemHints, answers[itemKey] ?? "") : "";
        const canRequestHint = isManualInput && canRequestManualInputHint(item, itemHints, status);

        return (
          <div className="playsay-answer-row" data-input-mode={isManualInput ? "manual" : "select"} data-status={status.kind} key={itemKey}>
            <label>
              {prompt.before ? <MarkdownInline value={prompt.before} /> : null}
              {options.length > 0 ? (
                <span className="playsay-inline-answer-wrap">
                  <select
                    aria-label={`gap ${index + 1}`}
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
                    <option disabled hidden value="">Выбрать</option>
                    {options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <MaterialAttemptBar status={status} />
                </span>
              ) : (
                <span className="playsay-inline-answer-wrap">
                  <span className="playsay-inline-answer" data-status={status.kind}>
                    <input
                      aria-label={`gap ${index + 1}`}
                      disabled={status.locked || status.correct}
                      onChange={(event) => updateItemValue(itemKey, event.target.value)}
                      onKeyDown={(event) => handleManualInputKeyDown(event, itemKey)}
                      placeholder={!answers[itemKey]?.trim() ? hintPreview || undefined : undefined}
                      value={answers[itemKey] ?? ""}
                    />
                    {inlineHint ? <span className="playsay-inline-hint-ghost">{inlineHint}</span> : null}
                    <button
                      aria-label="Проверить ответ"
                      className="playsay-inline-check"
                      disabled={status.locked || status.correct || !answers[itemKey]?.trim()}
                      onClick={() => checkItem(itemKey)}
                      title="Проверить ответ (Enter)"
                      type="button"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <MaterialAttemptBar status={status} />
                </span>
              )}
              {prompt.after ? <MarkdownInline value={prompt.after} /> : null}
            </label>
            <MaterialAnswerTools
              canRequestHint={canRequestHint}
              onHint={() => requestHint(itemKey, item)}
              status={status}
            />
          </div>
        );
      })}
    </div>
  );
}

function RenderedChoiceExercise({
  answer,
  block,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const answers = materialAnswerItems(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);

  function updateItemValue(itemKey: string, value: string) {
    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function checkItem(itemKey: string, value = answers[itemKey] ?? "") {
    const item = (block.items ?? []).find((candidate, index) => `${candidate.prompt}-${index}` === itemKey);
    const nextAttempts = appendMaterialAttempt(attempts, itemKey, value, materialItemAnswerMatches(item, value));
    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts: nextAttempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function requestHint(itemKey: string, item: MaterialExerciseItem) {
    const itemHints = hints[itemKey] ?? [];
    const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, true);
    if (!canRequestManualInputHint(item, itemHints, status)) {
      return;
    }

    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: answers,
      attempts,
      context: materialAnswerContextForBlock(block),
      hints: appendMaterialHint(hints, itemKey, materialHintForExerciseItem(item, block, itemHints.length + 1)),
    });
  }

  function handleManualInputKeyDown(event: KeyboardEvent<HTMLInputElement>, itemKey: string) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    checkItem(itemKey, event.currentTarget.value);
  }

  return (
    <div className="playsay-choice-list">
      {(block.items ?? []).map((item, index) => {
        const itemKey = `${item.prompt}-${index}`;
        const options = materialExerciseOptions(item, block);
        const isManualInput = options.length === 0;
        const itemHints = hints[itemKey] ?? [];
        const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, isManualInput);
        const hintPreview = isManualInput ? materialManualInputHintPreview(item, itemHints) : "";
        const inlineHint = isManualInput ? materialManualInputInlineHint(item, itemHints, answers[itemKey] ?? "") : "";
        const canRequestHint = isManualInput && canRequestManualInputHint(item, itemHints, status);

        return (
          <div className="playsay-answer-row" data-input-mode={isManualInput ? "manual" : "select"} data-status={status.kind} key={itemKey}>
            <label className="playsay-choice-row" data-status={status.kind}>
              <MarkdownInline value={item.prompt} />
              {options.length > 0 ? (
                <span className="playsay-inline-answer-wrap">
                  <select
                    aria-label={`choice ${index + 1}`}
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
                    <option disabled hidden value="">Выбрать</option>
                    {options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <MaterialAttemptBar status={status} />
                </span>
              ) : (
                <span className="playsay-inline-answer-wrap">
                  <span className="playsay-inline-answer" data-status={status.kind}>
                    <input
                      aria-label={`choice ${index + 1}`}
                      className="playsay-inline-input"
                      disabled={status.locked || status.correct}
                      onChange={(event) => updateItemValue(itemKey, event.target.value)}
                      onKeyDown={(event) => handleManualInputKeyDown(event, itemKey)}
                      placeholder={!answers[itemKey]?.trim() ? hintPreview || undefined : undefined}
                      value={answers[itemKey] ?? ""}
                    />
                    {inlineHint ? <span className="playsay-inline-hint-ghost">{inlineHint}</span> : null}
                    <button
                      aria-label="Проверить ответ"
                      className="playsay-inline-check"
                      disabled={status.locked || status.correct || !answers[itemKey]?.trim()}
                      onClick={() => checkItem(itemKey)}
                      title="Проверить ответ (Enter)"
                      type="button"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <MaterialAttemptBar status={status} />
                </span>
              )}
            </label>
            <MaterialAnswerTools
              canRequestHint={canRequestHint}
              onHint={() => requestHint(itemKey, item)}
              status={status}
            />
          </div>
        );
      })}
    </div>
  );
}

function MaterialAnswerTools({
  canRequestHint,
  onHint,
  status,
}: {
  canRequestHint: boolean;
  onHint: () => void;
  status: MaterialAnswerStatus;
}) {
  const nextHintNumber = Math.min(status.hintsUsed + 1, MAX_MANUAL_INPUT_HINTS);
  if (!canRequestHint) {
    return null;
  }

  return (
    <div className="playsay-answer-tools">
      <button
        aria-label={`Подсказка ${nextHintNumber} из ${MAX_MANUAL_INPUT_HINTS}`}
        className="playsay-hint-button"
        onClick={onHint}
        title={`Подсказка ${nextHintNumber} из ${MAX_MANUAL_INPUT_HINTS}`}
        type="button"
      >
        <FileText className="h-3.5 w-3.5" />
        {nextHintNumber}/{MAX_MANUAL_INPUT_HINTS}
      </button>
    </div>
  );
}

function MaterialAttemptBar({ status }: { status: MaterialAnswerStatus }) {
  if (status.kind === "empty" || status.kind === "draft") {
    return null;
  }

  const maxAttempts = Math.max(1, status.maxAttempts);
  const redPercent = status.locked
    ? 100
    : Math.min(100, Math.max(0, (status.incorrectAttempts / maxAttempts) * 100));
  const label = status.locked
    ? `Попытки закончились: ${status.incorrectAttempts} из ${maxAttempts}`
    : status.correct
      ? `Ответ принят: ошибок до ответа ${status.incorrectAttempts} из ${maxAttempts}`
      : `Ошибок ${status.incorrectAttempts} из ${maxAttempts}`;
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

function RenderedMatchingPairsExercise({
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
  const pairs = block.pairs ?? emptyMaterialMatchingPairs;
  const rightOptions = mode === "teacherPreview" ? pairs : matchingRightOptions(pairs);
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
  }, [matchesKey, pairs]);

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
                aria-label={pairTargetKind === "IMAGE" ? `picture ${index + 1}` : pair.right}
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
                      <small>{hasPendingAsset ? "Загружаем картинку" : pair.imagePrompt || pair.imageAlt || pair.right}</small>
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

function matchingRightOptions(pairs: MaterialMatchingPair[]): MaterialMatchingPair[] {
  if (pairs.length <= 1) {
    return [...pairs];
  }

  const ordered = [...pairs].sort((left, right) => matchingPairSortKey(left) - matchingPairSortKey(right));

  for (let offset = 0; offset < ordered.length; offset += 1) {
    const candidate = rotateMatchingOptions(ordered, offset);
    if (candidate.every((pair, index) => pair.id !== pairs[index]?.id)) {
      return candidate;
    }
  }

  return rotateMatchingOptions(pairs, 1);
}

function matchingPairSortKey(pair: MaterialMatchingPair): number {
  return `${pair.id}:${pair.right}`.split("").reduce((hash, char) => (
    (hash * 31 + char.charCodeAt(0)) % 10_000
  ), 7);
}

function rotateMatchingOptions(pairs: MaterialMatchingPair[], offset: number): MaterialMatchingPair[] {
  if (pairs.length === 0) {
    return [];
  }
  const normalizedOffset = offset % pairs.length;
  return [...pairs.slice(normalizedOffset), ...pairs.slice(0, normalizedOffset)];
}

function materialExerciseOptions(item: MaterialExerciseItem, block: MaterialEditorBlock): string[] {
  const configuredOptions = uniqueMaterialOptions(item.options ?? []);
  if (configuredOptions.length > 0) {
    return configuredOptions;
  }

  const answer = normalizeMaterialAnswer(item.answer);
  const articleContext = `${block.title} ${block.body ?? ""} ${block.prompt ?? ""} ${item.prompt}`.toLowerCase();
  if (
    ["a", "an", "-"].includes(answer) ||
    articleContext.includes("article") ||
    articleContext.includes("артик")
  ) {
    return ["a", "an", "-"];
  }

  return [];
}

function appendMaterialAttempt(
  attempts: Record<string, MaterialAttemptEntry[]>,
  itemKey: string,
  value: string,
  correct: boolean,
): Record<string, MaterialAttemptEntry[]> {
  const cleanValue = value.trim();
  if (!cleanValue) {
    return attempts;
  }
  const current = attempts[itemKey] ?? [];
  const latest = current[current.length - 1];
  if (latest?.value === cleanValue) {
    return attempts;
  }
  return {
    ...attempts,
    [itemKey]: [
      ...current,
      {
        at: new Date().toISOString(),
        correct,
        value: cleanValue,
      },
    ],
  };
}

function appendMaterialHint(
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

function canRequestManualInputHint(
  item: MaterialExerciseItem,
  hints: MaterialHintEntry[],
  status: MaterialAnswerStatus,
): boolean {
  return Boolean(item.answer?.trim()) && hints.length < MAX_MANUAL_INPUT_HINTS && !status.locked && !status.correct;
}

function materialManualInputHintPreview(item: MaterialExerciseItem, hints: MaterialHintEntry[]): string {
  const latestHint = hints[hints.length - 1];
  if (latestHint?.value) {
    return latestHint.value;
  }
  if (hints.length === 0) {
    return "";
  }
  return materialProgressiveHintValue(item.answer ?? "", hints.length);
}

function materialManualInputInlineHint(item: MaterialExerciseItem, hints: MaterialHintEntry[], value: string): string {
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

function materialHintForExerciseItem(item: MaterialExerciseItem, block: MaterialEditorBlock, hintNumber: number): MaterialHintEntry {
  const answer = item.answer?.trim() ?? "";
  const penalty = cleanMaterialAssessment(block.assessment ?? defaultObjectiveAssessmentPolicy()).hintPenalty ?? 0.15;
  const level = Math.min(Math.max(hintNumber, 1), MAX_MANUAL_INPUT_HINTS);
  const value = materialProgressiveHintValue(answer, level);
  const type = level === 1 ? "firstLetter" : level === 2 ? "partialAnswer" : "fullAnswer";
  return {
    at: new Date().toISOString(),
    label: level >= MAX_MANUAL_INPUT_HINTS ? `Ответ: ${value}` : `Подсказка ${level}: ${value}`,
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

function splitGapPrompt(prompt: string): { before: string; after: string } {
  const match = prompt.match(/^(.*?)(___|__|…|\.\.\.)(.*)$/);
  if (!match) {
    return { before: prompt, after: "" };
  }

  return {
    before: match[1].trimEnd(),
    after: match[3].trimStart(),
  };
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

function uniqueMaterialTags(tags: string[]): string[] {
  const result: string[] = [];
  tags.forEach((tag) => {
    const normalized = normalizeMaterialTag(tag);
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  });
  return result.slice(0, 16);
}

function normalizeMaterialTag(value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return clean.length >= 2 && clean.length <= 40 ? clean : "";
}

function normalizeMaterialAnswer(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (["no article", "no article needed", "zero article", "нет артикля"].includes(normalized)) {
    return "-";
  }
  return normalized;
}

export function FallbackLessonDocument() {
  return (
    <>
      <div className="playsay-task-kicker">
        <FileText className="h-4 w-4 text-primary" />
        2. Let's chat
      </div>
      <h3>Make a guess and complete the descriptions below the pictures</h3>
      <p className="playsay-task-subtitle">The importance of food for travellers</p>

      <div className="playsay-task-cards">
        <TaskPictureCard caption="Travellers who think food is important" tone="mint" />
        <TaskPictureCard caption="Travellers who think food is not important" tone="yellow" />
      </div>

      <div className="playsay-fill-exercise">
        <label>
          I am in the
          <input aria-label="gap 1" defaultValue="" />
        </label>
        <label>
          I see a lot of
          <input aria-label="gap 2" defaultValue="" />
          around.
        </label>
        <label>
          I feel
          <input aria-label="gap 3" defaultValue="" />
          because the trip is exciting.
        </label>
      </div>
    </>
  );
}

export function AssignmentStub({
  active = false,
  tag,
  title,
}: {
  active?: boolean;
  tag: string;
  title: string;
}) {
  return (
    <article className="playsay-assignment-card" data-active={active ? "true" : "false"}>
      <div className="text-sm font-extrabold text-foreground">{title}</div>
      <div className="mt-2 inline-flex rounded-full border border-primary/15 bg-white px-2 py-1 text-xs font-extrabold text-primary">
        {tag}
      </div>
    </article>
  );
}

function TaskPictureCard({
  caption,
  tone,
}: {
  caption: string;
  tone: "mint" | "yellow";
}) {
  const toneClass = tone === "mint" ? "playsay-picture-card-mint" : "playsay-picture-card-yellow";

  return (
    <figure className={`playsay-picture-card ${toneClass}`}>
      <div className="playsay-picture-illustration">
        <div className="playsay-picture-face" />
        <div className="playsay-picture-plate" />
        <div className="playsay-picture-tower" />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function AnnotationToolButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="playsay-annotation-button"
      data-active={active ? "true" : "false"}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
