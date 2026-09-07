import { useState } from "react";
import { FormField } from "../../../shared/ui/FormField";
import { useAppTranslation } from "../../../shared/i18n";
import { formatMaterialVideoClipTime, type MaterialEditorBlock } from "../model/materialDocument";
import { parseMaterialVideoDuration } from "../model/videoMeta";

export function MaterialVideoMetadataFields({ block, disabled, onUpdate }: {
  block: MaterialEditorBlock;
  disabled: boolean;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  const { t } = useAppTranslation();
  const [videoMetaDurationSource, setVideoMetaDurationSource] = useState(() => formatMaterialVideoClipTime(block.videoMeta?.durationSeconds));
  const [videoMetaEnglishConfirmed, setVideoMetaEnglishConfirmed] = useState(() => /^en(?:[-_]|$)/i.test(block.videoMeta?.language ?? ""));
  function commitManualVideoMeta(durationSource: string, englishConfirmed: boolean) {
    const durationSeconds = parseMaterialVideoDuration(durationSource);
    setVideoMetaDurationSource(durationSource);
    setVideoMetaEnglishConfirmed(englishConfirmed);
    onUpdate({
      videoMeta: durationSeconds !== undefined || englishConfirmed ? {
        sourceUrl: block.url?.trim() ?? "",
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
        ...(englishConfirmed ? { language: "en" } : {}),
        ...(durationSeconds !== undefined && englishConfirmed ? { validationStatus: "TEACHER_CONFIRMED" } : {}),
      } : undefined,
    });
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-2" data-layout="video-metadata">
      <strong className="text-sm">{t("materials.blockEditor.videoMetadataTitle")}</strong>
      <p className="text-xs font-bold text-muted-foreground">
        {t("materials.blockEditor.videoMetadataHint")}
      </p>
      <div className="playsay-material-field-grid">
        <FormField label={t("materials.blockEditor.videoDuration")}>
          <input
            aria-invalid={Boolean(videoMetaDurationSource) && parseMaterialVideoDuration(videoMetaDurationSource) === undefined}
            className="playsay-input"
            disabled={disabled}
            inputMode="numeric"
            onBlur={(event) => commitManualVideoMeta(event.currentTarget.value, videoMetaEnglishConfirmed)}
            onChange={(event) => commitManualVideoMeta(event.target.value, videoMetaEnglishConfirmed)}
            placeholder={t("materials.blockEditor.videoDurationPlaceholder")}
            value={videoMetaDurationSource}
          />
        </FormField>
        <label className="flex items-center gap-2 self-end rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold">
          <input
            checked={videoMetaEnglishConfirmed}
            disabled={disabled}
            onChange={(event) => commitManualVideoMeta(videoMetaDurationSource, event.target.checked)}
            type="checkbox"
          />
          {t("materials.blockEditor.videoEnglishAudio")}
        </label>
      </div>
      {videoMetaDurationSource && parseMaterialVideoDuration(videoMetaDurationSource) === undefined ? (
        <small className="text-xs text-destructive" role="alert">{t("materials.blockEditor.videoDurationInvalid")}</small>
      ) : (parseMaterialVideoDuration(videoMetaDurationSource) ?? 0) > 420 ? (
        <small className="text-xs text-destructive" role="alert">{t("materials.renderer.videoRelayReasons.YOUTUBE_DURATION_TOO_LONG")}</small>
      ) : null}
      {block.videoMeta?.validationStatus === "TEACHER_CONFIRMED" ? (
        <small className="text-xs font-bold text-success" role="status">
          {t("materials.blockEditor.videoMetadataConfirmed")}
        </small>
      ) : (
        <small className="text-xs font-bold text-muted-foreground">
          {t("materials.blockEditor.videoMetadataOptional")}
        </small>
      )}
    </div>
  );
}
