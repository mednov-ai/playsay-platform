import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, Loader2, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  defaultObjectiveAssessmentPolicy,
  formatFlashcards,
  formatMaterialVideoClipTime,
  isObjectiveMaterialBlockType,
  materialBlockLabel,
  normalizeMaterialVideoClip,
  parseMaterialVideoClipTime,
  parseFlashcards,
  type MaterialAssetLibraryItem,
  type MaterialEditorBlock,
} from "../model/materialDocument";
import { ExerciseItemsEditor } from "./ExerciseItemsEditor";
import { materialBlockIcon } from "./materialBlockIcon";
import { MatchingPairsEditor } from "./MatchingPairsEditor";
import { useAppTranslation } from "../../../shared/i18n";
import { resolveMaterialExternalActivity, type MaterialHtmlGameEnrichment } from "../../../shared/api/playsay";
import { isEnglishHtmlGameTitle } from "../model/htmlGameTitle";

export function MaterialBlockEditor({
  active,
  assetLibrary,
  block,
  canMoveDown,
  canMoveUp,
  canSuggestAcceptedAnswers,
  collapsed,
  currentMaterialId,
  disabled,
  index,
  htmlGameEnrichment,
  onActivate,
  onMoveDown,
  onMoveUp,
  onRegenerateHtmlGameIcon,
  onPreview,
  onPreviewEnd,
  onRemove,
  onSuggestAcceptedAnswers,
  onToggleCollapsed,
  onUpdate,
  onUploadAsset,
}: {
  active: boolean;
  assetLibrary: MaterialAssetLibraryItem[];
  block: MaterialEditorBlock;
  canMoveDown: boolean;
  canMoveUp: boolean;
  canSuggestAcceptedAnswers: boolean;
  collapsed: boolean;
  currentMaterialId: string | null;
  disabled: boolean;
  index: number;
  htmlGameEnrichment?: MaterialHtmlGameEnrichment;
  onActivate: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRegenerateHtmlGameIcon: () => void;
  onPreview: () => void;
  onPreviewEnd: () => void;
  onRemove: () => void;
  onSuggestAcceptedAnswers?: (blockId: string, itemIds: string[]) => void;
  onToggleCollapsed: () => void;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
  onUploadAsset: (kind: "image" | "htmlGame", file: File) => Promise<void>;
}) {
  const { t } = useAppTranslation();
  const [flashcardsSource, setFlashcardsSource] = useState(() => formatFlashcards(block.cards));
  const [videoClipStartSource, setVideoClipStartSource] = useState(() => formatMaterialVideoClipTime(block.videoClip?.startSeconds));
  const [videoClipEndSource, setVideoClipEndSource] = useState(() => formatMaterialVideoClipTime(block.videoClip?.endSeconds));
  const [uploading, setUploading] = useState(false);
  const [resolvingExternalActivity, setResolvingExternalActivity] = useState(false);
  const [externalActivityError, setExternalActivityError] = useState(false);
  const collapseLabel = collapsed ? t("materials.blockEditor.expandBlock") : t("materials.blockEditor.collapseBlock");
  const summary = materialBlockSummary(block, t);
  const invalidHtmlGameTitle = block.type === "htmlGame"
    && block.gameTitleSource === "USER"
    && !isEnglishHtmlGameTitle(block.title);

  useEffect(() => {
    setFlashcardsSource(formatFlashcards(block.cards));
  }, [block.id, block.type]);

  useEffect(() => {
    setVideoClipStartSource(formatMaterialVideoClipTime(block.videoClip?.startSeconds));
    setVideoClipEndSource(formatMaterialVideoClipTime(block.videoClip?.endSeconds));
  }, [block.id, block.videoClip?.endSeconds, block.videoClip?.startSeconds]);

  function commitVideoClip(boundary: "startSeconds" | "endSeconds", value: string) {
    const seconds = parseMaterialVideoClipTime(value);
    const nextClip = { ...(block.videoClip ?? {}) };
    if (seconds === undefined) {
      delete nextClip[boundary];
    } else {
      nextClip[boundary] = seconds;
    }
    const normalizedClip = normalizeMaterialVideoClip(nextClip);
    setVideoClipStartSource(formatMaterialVideoClipTime(normalizedClip?.startSeconds));
    setVideoClipEndSource(formatMaterialVideoClipTime(normalizedClip?.endSeconds));
    onUpdate({ videoClip: normalizedClip });
  }

  async function uploadAsset(kind: "image" | "htmlGame", file: File | undefined) {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      await onUploadAsset(kind, file);
    } finally {
      setUploading(false);
    }
  }

  async function resolveExternalActivity() {
    if (!block.url?.trim()) return;
    setResolvingExternalActivity(true);
    setExternalActivityError(false);
    try {
      const resolved = await resolveMaterialExternalActivity(block.url);
      onUpdate({
        url: resolved.normalizedUrl,
        provider: resolved.provider,
        externalActivitySupportLevel: resolved.supportLevel,
      });
    } catch {
      setExternalActivityError(true);
    } finally {
      setResolvingExternalActivity(false);
    }
  }

  return (
    <article
      className="playsay-material-editor-block rounded-xl border border-border bg-white p-3"
      data-active={active ? "true" : "false"}
      data-collapsed={collapsed ? "true" : "false"}
      onClick={onActivate}
      onFocusCapture={() => {
        onActivate();
        onPreview();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onPreviewEnd();
        }
      }}
      onMouseEnter={onPreview}
      onMouseLeave={onPreviewEnd}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-black text-muted-foreground">
              {index + 1}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-2 py-1 text-xs font-black text-primary">
              {materialBlockIcon(block.type)}
              {materialBlockLabel(block.type)}
            </span>
          </div>
          {collapsed ? (
            <button className="playsay-material-block-summary" onClick={onToggleCollapsed} type="button">
              <strong>{block.title}</strong>
              <span>{summary}</span>
            </button>
          ) : (
            <input
              aria-label={t("materials.blockEditor.blockTitle")}
              aria-invalid={invalidHtmlGameTitle}
              className="mt-2 w-full border-0 bg-transparent p-0 text-base font-black outline-none"
              disabled={disabled}
              maxLength={160}
              onChange={(event) => onUpdate({
                title: event.target.value,
                ...(block.type === "htmlGame" ? { gameTitleSource: "USER" as const } : {}),
              })}
              value={block.title}
            />
          )}
          {!collapsed && invalidHtmlGameTitle ? (
            <p className="mt-1 text-xs font-bold text-destructive" role="alert">
              {t("materials.blockEditor.gameTitleEnglishOnly")}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            aria-label={t("materials.editor.moveBlockUp", { index: index + 1 })}
            className="h-8 w-8 px-0"
            disabled={disabled || !canMoveUp}
            onClick={onMoveUp}
            title={t("materials.editor.moveBlockUp", { index: index + 1 })}
            type="button"
            variant="outline"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            aria-label={t("materials.editor.moveBlockDown", { index: index + 1 })}
            className="h-8 w-8 px-0"
            disabled={disabled || !canMoveDown}
            onClick={onMoveDown}
            title={t("materials.editor.moveBlockDown", { index: index + 1 })}
            type="button"
            variant="outline"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            aria-expanded={!collapsed}
            aria-label={collapseLabel}
            className="h-8 w-8 px-0"
            onClick={onToggleCollapsed}
            title={collapseLabel}
            type="button"
            variant="outline"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button className="h-8 px-2 text-xs" disabled={disabled} onClick={onRemove} type="button" variant="outline">
            <Trash2 className="h-4 w-4" />
            {t("materials.actions.delete")}
          </Button>
        </div>
      </div>

      <div aria-hidden={collapsed} className={collapsed ? "hidden" : "mt-2 grid gap-2"}>
        {block.type === "videoEmbed" ? (
          <>
            <div className="playsay-material-field-grid" data-layout="video-source">
              <FormField label={t("materials.blockEditor.platform")}>
                <select
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => onUpdate({ provider: event.target.value })}
                  value={block.provider ?? "YOUTUBE"}
                >
                  <option value="YOUTUBE">YouTube</option>
                  <option value="VK">VK</option>
                  <option value="RUTUBE">Rutube</option>
                </select>
              </FormField>
              <FormField label={t("materials.blockEditor.link")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => onUpdate({ url: event.target.value })}
                  placeholder={t("materials.blockEditor.linkPlaceholder")}
                  value={block.url ?? ""}
                />
              </FormField>
            </div>
            <div className="playsay-material-field-grid rounded-lg border border-border bg-muted/20 p-2" data-layout="video-clip">
              <FormField label={t("materials.blockEditor.videoClipStart")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  inputMode="numeric"
                  onBlur={(event) => commitVideoClip("startSeconds", event.currentTarget.value)}
                  onChange={(event) => setVideoClipStartSource(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder={t("materials.blockEditor.videoClipStartPlaceholder")}
                  value={videoClipStartSource}
                />
              </FormField>
              <FormField label={t("materials.blockEditor.videoClipEnd")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  inputMode="numeric"
                  onBlur={(event) => commitVideoClip("endSeconds", event.currentTarget.value)}
                  onChange={(event) => setVideoClipEndSource(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder={t("materials.blockEditor.videoClipEndPlaceholder")}
                  value={videoClipEndSource}
                />
              </FormField>
              <small className="playsay-material-field-grid-span text-xs font-bold text-muted-foreground">
                {t("materials.blockEditor.videoClipHint")}
              </small>
            </div>
          </>
        ) : null}

        {block.type === "image" || block.type === "generatedImage" ? (
          <div className="playsay-material-field-grid" data-layout="image">
            <FormField label={block.type === "generatedImage" ? t("materials.blockEditor.prompt") : t("materials.blockEditor.imageUrl")}>
              {block.type === "generatedImage" ? (
                <textarea
                  className="playsay-input min-h-20 resize-y py-3"
                  disabled={disabled}
                  onChange={(event) => onUpdate({ prompt: event.target.value })}
                  placeholder={t("materials.blockEditor.generatedImagePromptPlaceholder")}
                  value={block.prompt ?? ""}
                />
              ) : (
                <div className="grid gap-2">
                  <input
                    className="playsay-input"
                    disabled={disabled || uploading}
                    onChange={(event) => onUpdate({ url: event.target.value })}
                    placeholder={t("materials.blockEditor.linkPlaceholder")}
                    value={block.url ?? ""}
                  />
                  <label className="playsay-inline-upload">
                    <input
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      className="sr-only"
                      disabled={disabled || uploading}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void uploadAsset("image", file);
                      }}
                      type="file"
                    />
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? t("materials.blockEditor.uploading") : t("materials.blockEditor.uploadImage")}
                  </label>
                </div>
              )}
            </FormField>
            <FormField label={t("materials.blockEditor.imageSize")}>
              <select
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate({ imageSize: event.target.value as NonNullable<MaterialEditorBlock["imageSize"]> })}
                value={block.imageSize ?? "MEDIUM"}
              >
                <option value="SMALL">{t("materials.blockEditor.imageSizeSmall")}</option>
                <option value="MEDIUM">{t("materials.blockEditor.imageSizeMedium")}</option>
                <option value="LARGE">{t("materials.blockEditor.imageSizeLarge")}</option>
                <option value="FULL">{t("materials.blockEditor.imageSizeFull")}</option>
              </select>
            </FormField>
            <FormField label={t("materials.blockEditor.caption")}>
              <textarea
                className="playsay-input min-h-20 resize-y py-3"
                disabled={disabled}
                onChange={(event) => onUpdate({ caption: event.target.value })}
                value={block.caption ?? ""}
              />
            </FormField>
          </div>
        ) : null}

        {block.type === "externalActivity" ? (
          <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3">
            <FormField label={t("materials.blockEditor.externalActivityUrl")}>
              <div className="playsay-material-external-row">
                <input
                  className="playsay-input min-w-0 flex-1"
                  disabled={disabled || resolvingExternalActivity}
                  maxLength={2048}
                  onChange={(event) => {
                    setExternalActivityError(false);
                    onUpdate({
                      url: event.target.value,
                      provider: "EXPERIMENTAL",
                      externalActivitySupportLevel: "EXPERIMENTAL",
                    });
                  }}
                  placeholder={t("materials.blockEditor.linkPlaceholder")}
                  type="url"
                  value={block.url ?? ""}
                />
                <Button
                  disabled={disabled || resolvingExternalActivity || !block.url?.trim()}
                  onClick={() => void resolveExternalActivity()}
                  type="button"
                  variant="outline"
                >
                  {resolvingExternalActivity ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {resolvingExternalActivity
                    ? t("materials.blockEditor.validatingExternalActivity")
                    : t("materials.blockEditor.validateExternalActivity")}
                </Button>
              </div>
            </FormField>
            {externalActivityError ? (
              <p className="flex items-center gap-2 text-xs font-bold text-destructive" role="alert">
                <AlertTriangle className="h-4 w-4" />
                {t("materials.blockEditor.externalActivityInvalid")}
              </p>
            ) : block.url ? (
              <p className="text-xs font-bold text-muted-foreground">
                {block.externalActivitySupportLevel === "GUARANTEED"
                  ? t("materials.blockEditor.externalActivityGuaranteed", { provider: block.provider ?? "" })
                  : t("materials.blockEditor.externalActivityExperimental")}
              </p>
            ) : null}
            <p className="text-xs font-semibold text-muted-foreground">{t("materials.blockEditor.externalActivityHint")}</p>
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t("materials.blockEditor.externalActivityPrivacy")}
            </p>
          </div>
        ) : null}

        {block.type === "htmlGame" ? (
          <div className="playsay-material-field-grid gap-3" data-layout="html-game">
            <FormField label={t("materials.blockEditor.htmlGameFile")}>
              <div className="grid gap-2">
                <div className="playsay-asset-reference">{block.url || t("materials.blockEditor.htmlGameEmpty")}</div>
                <label className="playsay-inline-upload">
                  <input
                    accept="text/html,.html"
                    className="sr-only"
                    disabled={disabled || uploading}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      void uploadAsset("htmlGame", file);
                    }}
                    type="file"
                  />
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? t("materials.blockEditor.uploading") : t("materials.blockEditor.uploadHtmlGame")}
                </label>
              </div>
            </FormField>
            <FormField label={t("materials.blockEditor.gameHeight")}>
              <input
                className="playsay-input"
                disabled={disabled}
                max={800}
                min={360}
                onChange={(event) => onUpdate({ height: Number(event.target.value) })}
                type="number"
                value={block.height ?? 640}
              />
            </FormField>
            <div className="playsay-game-icon-enrichment playsay-material-field-grid-span" data-status={htmlGameEnrichment?.status ?? "IDLE"}>
              <span className="playsay-game-icon-enrichment-symbol">
                {htmlGameEnrichment && ["PENDING", "RUNNING", "RETRY"].includes(htmlGameEnrichment.status)
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Sparkles className="h-4 w-4" />}
              </span>
              <div>
                <strong>{t("materials.blockEditor.gameIconTitle")}</strong>
                <small>{htmlGameEnrichment?.status === "FAILED"
                  ? t("materials.blockEditor.gameIconFailed")
                  : htmlGameEnrichment && ["PENDING", "RUNNING", "RETRY"].includes(htmlGameEnrichment.status)
                    ? t("materials.blockEditor.gameIconGenerating")
                    : block.gameIconUrl
                      ? t("materials.blockEditor.gameIconReady")
                      : t("materials.blockEditor.gameIconHint")}</small>
              </div>
              <Button
                disabled={disabled || uploading || !block.url || Boolean(htmlGameEnrichment && ["PENDING", "RUNNING"].includes(htmlGameEnrichment.status))}
                onClick={onRegenerateHtmlGameIcon}
                type="button"
                variant="outline"
              >
                <RefreshCw className="h-4 w-4" />
                {t("materials.blockEditor.regenerateGameIcon")}
              </Button>
            </div>
          </div>
        ) : null}

        {block.type === "flashcards" ? (
          <textarea
            className="playsay-input min-h-28 resize-y py-3"
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              setFlashcardsSource(value);
              onUpdate({ cards: parseFlashcards(value, block.cards) });
            }}
            value={flashcardsSource}
          />
        ) : null}

        {block.type === "fillGaps" || block.type === "multipleChoice" ? (
          <ExerciseItemsEditor
            block={block}
            canSuggestAcceptedAnswers={canSuggestAcceptedAnswers}
            disabled={disabled}
            onSuggestAcceptedAnswers={onSuggestAcceptedAnswers}
            onUpdate={onUpdate}
          />
        ) : null}

        {block.type === "matchingPairs" ? (
          <MatchingPairsEditor
            assetLibrary={assetLibrary}
            block={block}
            currentMaterialId={currentMaterialId}
            disabled={disabled}
            onUpdate={onUpdate}
          />
        ) : null}

        {isObjectiveMaterialBlockType(block.type) && block.type !== "fillGaps" && block.type !== "matchingPairs" ? (
          <div className="playsay-material-field-grid rounded-lg border border-border bg-muted/20 p-2" data-layout="assessment">
            <FormField label={t("materials.blockEditor.weight")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={0.1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, weight: Number(event.target.value) } })}
                step={0.1}
                type="number"
                value={block.assessment?.weight ?? 1}
              />
            </FormField>
            <FormField label={t("materials.blockEditor.attempts")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={1}
                max={10}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, maxAttempts: Number(event.target.value) } })}
                type="number"
                value={block.assessment?.maxAttempts ?? 3}
              />
            </FormField>
            <FormField label={t("materials.blockEditor.attemptPenalty")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={0}
                max={1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, attemptPenalty: Number(event.target.value) } })}
                step={0.05}
                type="number"
                value={block.assessment?.attemptPenalty ?? 0.3}
              />
            </FormField>
            <FormField label={t("materials.blockEditor.hintPenalty")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={0}
                max={1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, hintPenalty: Number(event.target.value) } })}
                step={0.05}
                type="number"
                value={block.assessment?.hintPenalty ?? 0.15}
              />
            </FormField>
          </div>
        ) : null}

        {block.type === "text" || block.type === "freeWriting" || block.type === "speakingPrompt" ? (
          <textarea
            className="playsay-input min-h-28 resize-y py-3"
            disabled={disabled}
            onChange={(event) => onUpdate(block.type === "text" ? { body: event.target.value } : { prompt: event.target.value })}
            value={block.type === "text" ? block.body ?? "" : block.prompt ?? ""}
          />
        ) : null}

        {block.type === "drawingArea" ? (
          <FormField label={t("materials.blockEditor.drawingHeight")}>
            <input
              className="playsay-input"
              disabled={disabled}
              max={800}
              min={120}
              onChange={(event) => onUpdate({ height: Number(event.target.value) })}
              type="number"
              value={block.height ?? 240}
            />
          </FormField>
        ) : null}
      </div>
    </article>
  );
}

function materialBlockSummary(block: MaterialEditorBlock, t: (key: string, values?: Record<string, unknown>) => string): string {
  switch (block.type) {
    case "text":
      return compactSummary(block.body) || t("materials.blockEditor.summaryEmpty");
    case "image":
    case "generatedImage":
      return compactSummary(block.caption || block.prompt || block.url) || t("materials.blockEditor.summaryImage");
    case "videoEmbed":
      return compactSummary(block.url) || t("materials.blockEditor.summaryVideo");
    case "htmlGame":
      return block.url ? t("materials.blockEditor.summaryGameReady") : t("materials.blockEditor.summaryGameEmpty");
    case "externalActivity":
      return block.url ? t("materials.blockEditor.summaryExternalReady") : t("materials.blockEditor.summaryExternalEmpty");
    case "flashcards":
      return t("materials.blockEditor.summaryCards", { count: block.cards?.length ?? 0 });
    case "matchingPairs":
      return t("materials.blockEditor.summaryPairs", { count: block.pairs?.length ?? 0 });
    case "fillGaps":
    case "multipleChoice":
      return t("materials.blockEditor.summaryItems", { count: block.items?.length ?? 0 });
    default:
      return compactSummary(block.prompt || block.body) || t("materials.blockEditor.summaryOpen");
  }
}

function compactSummary(value: string | undefined): string {
  const clean = value?.replace(/\s+/g, " ").trim() ?? "";
  return clean.length > 96 ? `${clean.slice(0, 93)}…` : clean;
}
