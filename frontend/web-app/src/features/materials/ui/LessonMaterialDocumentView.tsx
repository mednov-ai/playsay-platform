import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, FileText, Loader2, Minimize2, RefreshCw } from "lucide-react";
import { fetchMaterialAssetObjectUrl, fetchMaterialAssets, fetchMaterialAssetText, type LessonMaterial, type LessonMaterialAsset } from "../../../shared/api/playsay";
import {
  MaterialAnswerBlock,
  MaterialAnswerState,
  MaterialEditorBlock,
  MaterialHtmlGameSync,
  MaterialExternalActivitySync,
  MaterialExerciseInteraction,
  MaterialExerciseParticipant,
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
import { ExternalActivityFrame } from "./blocks/ExternalActivityFrame";
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
  exerciseParticipants = [],
  onExerciseInteractionChange,
  onAssetTagsChange,
  onBlockPatchCommit,
  onBlockPatch,
  score,
  showScoreBadge = true,
  htmlGameSync,
  externalActivitySync,
  onPresentationModeChange,
  sharedImageFocusBlockId,
}: {
  activePageId?: string | null;
  allowVideoFullscreen?: boolean;
  answers?: MaterialAnswerState;
  canControlPages?: boolean;
  material: LessonMaterial;
  mode?: MaterialRenderMode;
  onActivePageIdChange?: (pageId: string) => void;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  exerciseParticipants?: MaterialExerciseParticipant[];
  onExerciseInteractionChange?: (interaction: MaterialExerciseInteraction | null) => void;
  onAssetTagsChange?: (assetId: string, tags: string[]) => Promise<LessonMaterialAsset | null>;
  onBlockPatchCommit?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatch?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  score?: number | null;
  showScoreBadge?: boolean;
  htmlGameSync?: MaterialHtmlGameSync;
  externalActivitySync?: MaterialExternalActivitySync;
  onPresentationModeChange?: (
    mode: "default" | "html-game-focus" | "image-focus" | "external-activity-focus",
    blockId?: string,
  ) => void;
  sharedImageFocusBlockId?: string | null;
}) {
  const { t } = useAppTranslation();
  const document = useMemo(
    () => editorDocumentFromJson(material.document),
    [material.document],
  );
  const [internalActivePageId, setInternalActivePageId] = useState<string | null>(null);
  const selectedPageId = activePageId ?? internalActivePageId;
  const page = document.pages.find((item) => item.id === selectedPageId) ?? document.pages[0] ?? defaultMaterialPage(material.title);
  const assetIds = materialDocumentAssetIds(document);
  const assetKey = assetIds.join("|");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [htmlAssets, setHtmlAssets] = useState<Record<string, string>>({});
  const [assetTags, setAssetTags] = useState<Record<string, string[]>>({});
  const [assetLoadState, setAssetLoadState] = useState<"idle" | "loading" | "ready" | "partial-error" | "error">("idle");
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  const [focusedBlock, setFocusedBlock] = useState<{ kind: "htmlGame" | "image" | "externalActivity"; blockId: string } | null>(null);
  const onPresentationModeChangeRef = useRef(onPresentationModeChange);
  const [launchedGameIds, setLaunchedGameIds] = useState<Set<string>>(() => new Set());
  const numericScore = typeof score === "number" && Number.isFinite(score) ? score : null;
  const videoFullscreenAllowed = allowVideoFullscreen ?? mode === "teacherPreview";
  const pagePickerVisible = document.pages.length > 1;
  const pagePickerEnabled = canControlPages || activePageId === undefined;
  const isStaticImagePage = page.layout === "STATIC_IMAGE";
  const isHtmlGamePage = page.layout === "HTML_GAME";
  const allBlocks = useMemo(() => document.pages.flatMap((item) => item.blocks), [document.pages]);
  const focusedBlockValue = focusedBlock ? allBlocks.find((block) => block.id === focusedBlock.blockId) ?? null : null;
  const presentedHtmlGameBlockId = htmlGameSync?.presentedBlockId ?? null;
  const presentedExternalActivityBlockId = externalActivitySync?.active?.visible ? externalActivitySync.active.blockId : null;
  onPresentationModeChangeRef.current = onPresentationModeChange;

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
    if (!htmlGameSync) {
      return;
    }
    if (!presentedHtmlGameBlockId) {
      setFocusedBlock((current) => current?.kind === "htmlGame" ? null : current);
      return;
    }
    const presentedBlock = allBlocks.find((block) => block.id === presentedHtmlGameBlockId && block.type === "htmlGame");
    if (!presentedBlock) {
      return;
    }
    setLaunchedGameIds((current) => current.has(presentedHtmlGameBlockId)
      ? current
      : new Set(current).add(presentedHtmlGameBlockId));
    setFocusedBlock((current) => current?.kind === "htmlGame" && current.blockId === presentedHtmlGameBlockId
      ? current
      : { kind: "htmlGame", blockId: presentedHtmlGameBlockId });
  }, [allBlocks, htmlGameSync, presentedHtmlGameBlockId]);

  useEffect(() => {
    if (!presentedExternalActivityBlockId) {
      setFocusedBlock((current) => current?.kind === "externalActivity" ? null : current);
      return;
    }
    const block = allBlocks.find((candidate) => candidate.id === presentedExternalActivityBlockId && candidate.type === "externalActivity");
    if (block) setFocusedBlock({ kind: "externalActivity", blockId: block.id });
  }, [allBlocks, presentedExternalActivityBlockId]);

  useEffect(() => {
    if (sharedImageFocusBlockId === undefined) return;
    if (sharedImageFocusBlockId === null) {
      setFocusedBlock((current) => current?.kind === "image" ? null : current);
      return;
    }
    const block = allBlocks.find((candidate) => (
      candidate.id === sharedImageFocusBlockId
      && (candidate.type === "image" || candidate.type === "generatedImage")
    ));
    if (block) setFocusedBlock({ kind: "image", blockId: block.id });
  }, [allBlocks, sharedImageFocusBlockId]);

  useEffect(() => {
    onPresentationModeChangeRef.current?.(focusedBlock === null
      ? "default"
      : focusedBlock.kind === "htmlGame"
        ? "html-game-focus"
        : focusedBlock.kind === "externalActivity"
          ? "external-activity-focus"
          : "image-focus", focusedBlock?.blockId);
  }, [focusedBlock]);

  useEffect(() => () => onPresentationModeChangeRef.current?.("default"), []);

  useEffect(() => {
    let active = true;
    const objectUrls = new Set<string>();

    if (material.id === "preview" || assetKey.length === 0) {
      setAssetUrls({});
      setHtmlAssets({});
      setAssetTags({});
      setAssetLoadState("idle");
      return () => {
        active = false;
      };
    }

    setAssetUrls({});
    setHtmlAssets({});
    setAssetTags({});
    setAssetLoadState("loading");
    fetchMaterialAssets(material.id)
      .then(async (assets) => {
        const referencedAssetIds = new Set(assetIds);
        const referencedAssets = assets.filter((asset) => referencedAssetIds.has(asset.id));
        const settledEntries = await Promise.allSettled(referencedAssets.map(async (asset) => {
          if (asset.kind === "HTML_GAME") {
            if (!asset.contentUrl?.trim()) {
              throw new Error("missing-html-game-content");
            }
            return {
              id: asset.id,
              kind: "html" as const,
              value: await fetchMaterialAssetText(material.id, asset.id),
            };
          }
          const externalUrl = asset.externalUrl?.trim();
          if (externalUrl) {
            return { id: asset.id, kind: "image" as const, value: externalUrl };
          }
          if (!asset.contentUrl?.trim()) {
            throw new Error("missing-material-asset-content");
          }

          const objectUrl = await fetchMaterialAssetObjectUrl(material.id, asset.id);
          if (!active) {
            URL.revokeObjectURL(objectUrl);
            throw new Error("material-asset-load-cancelled");
          }
          objectUrls.add(objectUrl);
          return { id: asset.id, kind: "image" as const, value: objectUrl };
        }));

        const fulfilledEntries = settledEntries.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
        const imageEntries = fulfilledEntries
          .filter((entry) => entry.kind === "image")
          .map((entry) => [entry.id, entry.value] as const);
        const htmlEntries = fulfilledEntries
          .filter((entry) => entry.kind === "html")
          .map((entry) => [entry.id, entry.value] as const);
        const resolvedIds = new Set(fulfilledEntries.map((entry) => entry.id));
        const failedCount = assetIds.filter((assetId) => !resolvedIds.has(assetId)).length;

        if (active) {
          setAssetUrls(Object.fromEntries(imageEntries));
          setHtmlAssets(Object.fromEntries(htmlEntries));
          setAssetTags(materialAssetTagsMap(assets));
          setAssetLoadState(failedCount === 0 ? "ready" : fulfilledEntries.length > 0 ? "partial-error" : "error");
        }
      })
      .catch(() => {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls.clear();
        if (active) {
          setAssetUrls({});
          setHtmlAssets({});
          setAssetTags({});
          setAssetLoadState("error");
        }
      });

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, [assetKey, assetReloadVersion, material.id, material.updatedAt]);

  function requestBlockFocus(kind: "htmlGame" | "image" | "externalActivity", blockId: string) {
    if (kind === "htmlGame") {
      setLaunchedGameIds((current) => new Set(current).add(blockId));
      htmlGameSync?.setPresentedBlock(blockId);
    }
    if (kind === "externalActivity") {
      const block = allBlocks.find((candidate) => candidate.id === blockId && candidate.type === "externalActivity");
      if (!block) return;
      if (!externalActivitySync) {
        if (block.url) window.open(block.url, "_blank", "noopener,noreferrer");
        return;
      }
      externalActivitySync.open(block);
    }
    setFocusedBlock({ kind, blockId });
  }

  function closeBlockFocus() {
    const blockId = focusedBlock?.blockId;
    if (focusedBlock?.kind === "htmlGame") {
      htmlGameSync?.setPresentedBlock(null);
    }
    if (focusedBlock?.kind === "externalActivity") {
      externalActivitySync?.collapse();
    }
    setFocusedBlock(null);
    if (blockId) {
      window.requestAnimationFrame(() => {
        Array.from(globalThis.document.querySelectorAll<HTMLElement>("[data-playsay-launcher-for]"))
          .find((element) => element.dataset.playsayLauncherFor === blockId)
          ?.focus();
      });
    }
  }

  useEffect(() => {
    if (!focusedBlock) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBlockFocus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedBlock]);

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
      {assetLoadState === "loading" ? (
        <div aria-live="polite" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("materials.renderer.assetsLoading")}
        </div>
      ) : null}
      {assetLoadState === "partial-error" || assetLoadState === "error" ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-bold" role="alert">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            {assetLoadState === "partial-error"
              ? t("materials.renderer.assetsPartiallyUnavailable")
              : t("materials.renderer.assetsUnavailable")}
          </span>
          <button
            className="inline-flex items-center gap-1.5 font-extrabold text-primary underline"
            onClick={() => setAssetReloadVersion((current) => current + 1)}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            {t("materials.renderer.retryAssets")}
          </button>
        </div>
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
            assetsLoading={assetLoadState === "loading"}
            assetTags={assetTags}
            assetUrls={assetUrls}
            block={block}
            key={block.id}
            materialId={material.id}
            mode={mode}
            onAnswerChange={onAnswerChange}
            exerciseParticipants={exerciseParticipants}
            onExerciseInteractionChange={onExerciseInteractionChange}
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
          aria-label={focusedBlock.kind === "htmlGame"
            ? t("materials.renderer.closeGame")
            : focusedBlock.kind === "externalActivity"
              ? t("materials.renderer.closeExternalActivity")
              : t("materials.renderer.closeImage")}
          className="playsay-material-focus-close"
          data-testid="material-focus-close"
          onClick={closeBlockFocus}
          title={focusedBlock.kind === "htmlGame"
            ? t("materials.renderer.closeGame")
            : focusedBlock.kind === "externalActivity"
              ? t("materials.renderer.closeExternalActivity")
              : t("materials.renderer.closeImage")}
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
        {focusedBlock?.kind === "externalActivity" && focusedBlockValue?.type === "externalActivity" && externalActivitySync ? (
          <ExternalActivityFrame block={focusedBlockValue} sync={externalActivitySync} />
        ) : null}
        {focusedBlock?.kind === "image" && focusedBlockValue && (focusedBlockValue.type === "image" || focusedBlockValue.type === "generatedImage") ? (
          <figure className="playsay-material-focused-image" data-playsay-annotation-anchor="true">
            {resolveMaterialImageUrl(focusedBlockValue.url, assetUrls) ? (
              <img
                alt={focusedBlockValue.alt || focusedBlockValue.caption || focusedBlockValue.prompt || focusedBlockValue.title}
                data-playsay-annotation-anchor-id={focusedBlockValue.id}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                src={resolveMaterialImageUrl(focusedBlockValue.url, assetUrls)}
              />
            ) : null}
          </figure>
        ) : null}
      </div>
    </div>
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
