import { useEffect, useState, type ReactNode } from "react";
import { FileText, Minimize2 } from "lucide-react";
import { fetchMaterialAssetObjectUrl, fetchMaterialAssets, fetchMaterialAssetText, type LessonMaterial, type LessonMaterialAsset } from "../../../shared/api/playsay";
import {
  MaterialAnswerBlock,
  MaterialAnswerState,
  MaterialEditorBlock,
  MaterialHtmlGameSync,
  MaterialRenderMode,
  defaultMaterialPage,
  editorDocumentFromJson,
  formatMaterialScore,
  materialAssetTagsMap,
  materialAssetIdFromUrl,
  materialDocumentAssetIds,
  resolveMaterialImageUrl,
} from "../model/materialDocument";
import { RenderedMaterialBlock } from "./blocks/RenderedMaterialBlock";
import { HtmlGameFrame } from "./blocks/HtmlGameFrame";
import { useAppTranslation } from "../../../shared/i18n";

export function LessonMaterialDocumentView({
  activePageId,
  allowVideoFullscreen,
  answers = {},
  canControlPages = false,
  material,
  mode = "classroom",
  onActivePageIdChange,
  onAnswerChange,
  onAssetTagsChange,
  onBlockPatchCommit,
  onBlockPatch,
  score,
  showScoreBadge = true,
  htmlGameSync,
  onPresentationModeChange,
}: {
  activePageId?: string | null;
  allowVideoFullscreen?: boolean;
  answers?: MaterialAnswerState;
  canControlPages?: boolean;
  material: LessonMaterial;
  mode?: MaterialRenderMode;
  onActivePageIdChange?: (pageId: string) => void;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  onAssetTagsChange?: (assetId: string, tags: string[]) => Promise<LessonMaterialAsset | null>;
  onBlockPatchCommit?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatch?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  score?: number | null;
  showScoreBadge?: boolean;
  htmlGameSync?: MaterialHtmlGameSync;
  onPresentationModeChange?: (mode: "default" | "html-game-focus" | "image-focus") => void;
}) {
  const { t } = useAppTranslation();
  const document = editorDocumentFromJson(material.document);
  const [internalActivePageId, setInternalActivePageId] = useState<string | null>(null);
  const selectedPageId = activePageId ?? internalActivePageId;
  const page = document.pages.find((item) => item.id === selectedPageId) ?? document.pages[0] ?? defaultMaterialPage(material.title);
  const assetIds = materialDocumentAssetIds(document);
  const assetKey = assetIds.join("|");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [htmlAssets, setHtmlAssets] = useState<Record<string, string>>({});
  const [assetTags, setAssetTags] = useState<Record<string, string[]>>({});
  const [focusedBlock, setFocusedBlock] = useState<{ kind: "htmlGame" | "image"; blockId: string } | null>(null);
  const [launchedGameIds, setLaunchedGameIds] = useState<Set<string>>(() => new Set());
  const numericScore = typeof score === "number" && Number.isFinite(score) ? score : null;
  const videoFullscreenAllowed = allowVideoFullscreen ?? mode === "teacherPreview";
  const pagePickerVisible = document.pages.length > 1;
  const pagePickerEnabled = canControlPages || activePageId === undefined;
  const isStaticImagePage = page.layout === "STATIC_IMAGE";
  const isHtmlGamePage = page.layout === "HTML_GAME";
  const allBlocks = document.pages.flatMap((item) => item.blocks);
  const focusedBlockValue = focusedBlock ? allBlocks.find((block) => block.id === focusedBlock.blockId) ?? null : null;

  useEffect(() => {
    setInternalActivePageId(null);
    setFocusedBlock(null);
    setLaunchedGameIds(new Set());
  }, [material.id]);

  useEffect(() => {
    if (focusedBlock && !page.blocks.some((block) => block.id === focusedBlock.blockId)) {
      setFocusedBlock(null);
    }
  }, [focusedBlock, page.blocks]);

  useEffect(() => {
    onPresentationModeChange?.(focusedBlock === null
      ? "default"
      : focusedBlock.kind === "htmlGame"
        ? "html-game-focus"
        : "image-focus");
  }, [focusedBlock, onPresentationModeChange]);

  useEffect(() => () => onPresentationModeChange?.("default"), [onPresentationModeChange]);

  useEffect(() => {
    let active = true;
    const objectUrls = new Set<string>();

    if (material.id === "preview" || assetKey.length === 0) {
      setAssetUrls({});
      setHtmlAssets({});
      setAssetTags({});
      return () => {
        active = false;
      };
    }

    fetchMaterialAssets(material.id)
      .then(async (assets) => {
        const entries = await Promise.all(assets.map(async (asset) => {
          if (asset.kind === "HTML_GAME") {
            return null;
          }
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

        const htmlEntries = await Promise.all(assets
          .filter((asset) => asset.kind === "HTML_GAME" && asset.contentUrl?.trim())
          .map(async (asset) => [asset.id, await fetchMaterialAssetText(material.id, asset.id)] as const));

        if (active) {
          setAssetUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)));
          setHtmlAssets(Object.fromEntries(htmlEntries));
          setAssetTags(materialAssetTagsMap(assets));
        }
      })
      .catch(() => {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls.clear();
        if (active) {
          setAssetUrls({});
          setHtmlAssets({});
          setAssetTags({});
        }
      });

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, [assetKey, material.id, material.updatedAt]);

  function requestBlockFocus(kind: "htmlGame" | "image", blockId: string) {
    if (kind === "htmlGame") {
      setLaunchedGameIds((current) => new Set(current).add(blockId));
    }
    setFocusedBlock({ kind, blockId });
  }

  function closeBlockFocus() {
    const blockId = focusedBlock?.blockId;
    setFocusedBlock(null);
    if (blockId) {
      window.requestAnimationFrame(() => {
        Array.from(globalThis.document.querySelectorAll<HTMLElement>("[data-playsay-launcher-for]"))
          .find((element) => element.dataset.playsayLauncherFor === blockId)
          ?.focus();
      });
    }
  }

  return (
    <div
      className={`playsay-rendered-material${isStaticImagePage ? " playsay-static-image-page" : ""}`}
      data-playsay-layout={page.layout}
      data-playsay-page-id={page.id}
      data-presentation-kind={focusedBlock?.kind}
    >
      {showScoreBadge && numericScore !== null ? (
        <div className="playsay-material-score-badge">
          <span>{material.cefrLevel}</span>
          <strong>{formatMaterialScore(numericScore)}</strong>
        </div>
      ) : null}
      {!isStaticImagePage && !isHtmlGamePage ? (
        <div className="playsay-task-kicker">
          <FileText className="h-4 w-4 text-primary" />
          {material.title}
        </div>
      ) : null}
      {pagePickerVisible ? (
        <nav className="playsay-page-picker" aria-label={t("materials.renderer.pagePicker")}>
          {document.pages.map((item, index) => (
            <button
              aria-label={t("materials.renderer.selectPage", { number: index + 1, title: item.title })}
              className="playsay-page-picker-button"
              data-active={item.id === page.id ? "true" : "false"}
              disabled={!pagePickerEnabled}
              key={item.id}
              onClick={() => {
                if (onActivePageIdChange) {
                  onActivePageIdChange(item.id);
                } else {
                  setInternalActivePageId(item.id);
                }
              }}
              type="button"
            >
              <span>{index + 1}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </nav>
      ) : null}
      {!isStaticImagePage && !isHtmlGamePage ? <h3>{page.title}</h3> : null}
      {!isStaticImagePage && !isHtmlGamePage && material.description ? <p className="playsay-task-subtitle">{material.description}</p> : null}
      <div
        className={`playsay-material-blocks${isStaticImagePage ? " playsay-material-blocks-static-image" : ""}${isHtmlGamePage ? " playsay-material-blocks-html-game" : ""}`}
      >
        {page.blocks.map((block) => (
          <RenderedMaterialBlock
            allowVideoFullscreen={videoFullscreenAllowed}
            answer={answers[block.id]}
            assetTags={assetTags}
            assetUrls={assetUrls}
            block={block}
            key={block.id}
            materialId={material.id}
            mode={mode}
            onAnswerChange={onAnswerChange}
            onAssetTagsChange={async (assetId, tags) => {
              setAssetTags((current) => ({ ...current, [assetId]: tags }));
              await onAssetTagsChange?.(assetId, tags);
            }}
            onBlockPatchCommit={onBlockPatchCommit}
            onBlockPatch={onBlockPatch}
            onRequestFocus={requestBlockFocus}
            pageLayout={page.layout}
          />
        ))}
      </div>
      <div
        aria-hidden={focusedBlock === null ? "true" : undefined}
        className="playsay-material-focus-stack"
        data-active={focusedBlock === null ? "false" : "true"}
        data-kind={focusedBlock?.kind}
      >
        {focusedBlock ? (
        <button
          aria-label={focusedBlock.kind === "htmlGame" ? t("materials.renderer.closeGame") : t("materials.renderer.closeImage")}
          className="playsay-material-focus-close"
          data-testid="material-focus-close"
          onClick={closeBlockFocus}
          title={focusedBlock.kind === "htmlGame" ? t("materials.renderer.closeGame") : t("materials.renderer.closeImage")}
          type="button"
        >
          <Minimize2 className="h-5 w-5" />
        </button>
        ) : null}
        {allBlocks.filter((block) => block.type === "htmlGame" && launchedGameIds.has(block.id)).map((block) => {
          const assetId = materialAssetIdFromUrl(block.url);
          const active = focusedBlock?.kind === "htmlGame" && focusedBlock.blockId === block.id;
          return (
            <div className="playsay-material-focused-game" data-active={active ? "true" : "false"} key={block.id}>
              <HtmlGameFrame
                blockId={block.id}
                fillAvailable={active}
                height={block.height ?? 640}
                html={assetId ? htmlAssets[assetId] : undefined}
                sync={htmlGameSync}
                title={block.title}
              />
            </div>
          );
        })}
        {focusedBlock?.kind === "image" && focusedBlockValue && (focusedBlockValue.type === "image" || focusedBlockValue.type === "generatedImage") ? (
          <figure className="playsay-material-focused-image" data-playsay-annotation-anchor="true">
            {resolveMaterialImageUrl(focusedBlockValue.url, assetUrls) ? (
              <img
                alt={focusedBlockValue.alt || focusedBlockValue.caption || focusedBlockValue.prompt || focusedBlockValue.title}
                src={resolveMaterialImageUrl(focusedBlockValue.url, assetUrls)}
              />
            ) : null}
          </figure>
        ) : null}
      </div>
    </div>
  );
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
  testId,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      aria-label={label}
      className="playsay-annotation-button"
      data-active={active ? "true" : "false"}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
