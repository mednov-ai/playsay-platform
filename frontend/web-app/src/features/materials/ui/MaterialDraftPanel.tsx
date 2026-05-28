import { Globe2, Paperclip, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { formatFileSize, type MaterialDraftSourceImage } from "../model/materialDocument";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialDraftPanel({
  canGenerateDraft,
  canGenerateUrlDraft,
  disabled,
  draftImage,
  draftImageMessage,
  draftPrompt,
  draftUrl,
  onDraftFromUrl,
  onDraftImageChange,
  onGenerateDraft,
  onRemoveDraftImage,
  onUpdateDraftPrompt,
  onUpdateDraftUrl,
}: {
  canGenerateDraft: boolean;
  canGenerateUrlDraft: boolean;
  disabled: boolean;
  draftImage: MaterialDraftSourceImage | null;
  draftImageMessage: string | null;
  draftPrompt: string;
  draftUrl: string;
  onDraftFromUrl: () => void;
  onDraftImageChange: (file: File | null) => void;
  onGenerateDraft: () => void;
  onRemoveDraftImage: () => void;
  onUpdateDraftPrompt: (value: string) => void;
  onUpdateDraftUrl: (value: string) => void;
}) {
  const { t } = useAppTranslation();

  return (
    <div className="rounded-2xl border border-border bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
        <Wand2 className="h-4 w-4 text-primary" />
        {t("materials.draft.title")}
      </div>
      <textarea
        className="playsay-input min-h-28 resize-none py-3"
        disabled={disabled}
        maxLength={4_000}
        onChange={(event) => onUpdateDraftPrompt(event.target.value)}
        placeholder={t("materials.draft.promptPlaceholder")}
        value={draftPrompt}
      />
      <label className="mt-2 block">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
          <Globe2 className="h-3.5 w-3.5 text-primary" />
          {t("materials.draft.externalPage")}
        </span>
        <input
          className="playsay-input"
          disabled={disabled}
          maxLength={2_000}
          onChange={(event) => onUpdateDraftUrl(event.target.value)}
          placeholder="https://..."
          type="url"
          value={draftUrl}
        />
      </label>
      <label className="mt-2 block">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5 text-primary" />
          {t("materials.draft.photoOrScan")}
        </span>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="playsay-file-input"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = "";
            onDraftImageChange(file);
          }}
          type="file"
        />
      </label>
      {draftImage ? (
        <div className="playsay-draft-image-preview">
          <img alt="" src={draftImage.dataUrl} />
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold">{draftImage.fileName}</div>
            <div className="text-xs font-bold text-muted-foreground">
              {formatFileSize(draftImage.originalSize)} · {t("materials.draft.preparedForAi")}
            </div>
          </div>
          <Button disabled={disabled} onClick={onRemoveDraftImage} type="button" variant="outline">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
      {draftImageMessage ? (
        <div className="mt-2 rounded-xl border border-border bg-muted/60 p-2 text-xs font-bold text-muted-foreground">
          {draftImageMessage}
        </div>
      ) : null}
      <Button
        className="mt-2 w-full"
        disabled={disabled || !canGenerateDraft}
        onClick={onGenerateDraft}
        type="button"
      >
        <Sparkles className="h-4 w-4" />
        {t("materials.draft.generate")}
      </Button>
      <Button
        className="mt-2 w-full"
        disabled={disabled || !canGenerateUrlDraft}
        onClick={onDraftFromUrl}
        type="button"
        variant="outline"
      >
        <Globe2 className="h-4 w-4" />
        {t("materials.draft.fromUrl")}
      </Button>
    </div>
  );
}
