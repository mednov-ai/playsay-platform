import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, ImageIcon, RefreshCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  fetchVocabularyEntryMedia,
  fetchVocabularyMediaBlob,
  regenerateVocabularyEntryMedia,
  reportVocabularyEntryMedia,
  updateVocabularyEntryMediaOverride,
  type VocabularyEntry,
  type VocabularyMediaView,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function VocabularyMediaCard({ entry }: { entry: VocabularyEntry }) {
  const { t, i18n } = useAppTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["vocabulary-media", entry.id] as const;
  const mediaQuery = useQuery({ queryKey, queryFn: ({ signal }) => fetchVocabularyEntryMedia(entry.id, signal), staleTime: 30_000, retry: 1 });
  const media = mediaQuery.data;
  const mutation = useMutation({
    mutationFn: (action: "hide" | "show" | "report" | "regenerate" | { alternative: string }) => {
      if (action === "hide") return updateVocabularyEntryMediaOverride(entry.id, { kind: "HIDE" });
      if (action === "show") return updateVocabularyEntryMediaOverride(entry.id, { kind: "DEFAULT" });
      if (action === "report" && media?.asset) return reportVocabularyEntryMedia(entry.id, media.asset.id);
      if (action === "regenerate") return regenerateVocabularyEntryMedia(entry.id);
      if (typeof action === "object") return updateVocabularyEntryMediaOverride(entry.id, { kind: "APPROVED_ALTERNATIVE", assetId: action.alternative });
      return Promise.resolve(media as VocabularyMediaView);
    },
    onSuccess: (next) => queryClient.setQueryData(queryKey, next),
  });
  const blobQuery = useQuery({
    queryKey: ["vocabulary-media-blob", media?.asset?.id],
    queryFn: ({ signal }) => fetchVocabularyMediaBlob(media!.asset!.contentUrl!, signal),
    enabled: Boolean(media?.asset?.contentUrl),
    staleTime: 10 * 60_000,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blobQuery.data) { setImageUrl(null); return; }
    const url = URL.createObjectURL(blobQuery.data);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blobQuery.data]);
  const language = i18n.resolvedLanguage?.split("-")[0] ?? "en";
  const alt = media?.asset?.altText[language] ?? media?.asset?.altText.en ?? t("vocabulary.media.altFallback", { word: entry.sourceText });

  return (
    <section className="vocabulary-media-card" aria-label={t("vocabulary.media.region", { word: entry.sourceText })}>
      <div className="vocabulary-media-card__viewport">
        {imageUrl ? <img alt={media?.asset?.decorative ? "" : alt} height={media?.asset?.height ?? 320} src={imageUrl} width={media?.asset?.width ?? 320} /> : (
          <div className="vocabulary-media-card__placeholder" role="status">
            {mediaQuery.isPending || media?.state === "GENERATING" ? <RefreshCcw aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <ImageIcon aria-hidden="true" className="h-5 w-5" />}
            <span>{stateLabel(media, mediaQuery.isError || blobQuery.isError, t)}</span>
          </div>
        )}
      </div>
      <div className="vocabulary-media-card__actions">
        {media?.asset ? (
          <>
            <Button aria-label={t("vocabulary.media.wrongAria", { word: entry.sourceText })} disabled={mutation.isPending} onClick={() => mutation.mutate("report")} type="button" variant="outline"><TriangleAlert className="h-4 w-4" />{t("vocabulary.media.wrong")}</Button>
            <Button aria-label={t("vocabulary.media.hideAria", { word: entry.sourceText })} disabled={mutation.isPending} onClick={() => mutation.mutate("hide")} type="button" variant="outline"><EyeOff className="h-4 w-4" />{t("vocabulary.media.hide")}</Button>
          </>
        ) : media?.hidden ? (
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate("show")} type="button" variant="outline">{t("vocabulary.media.show")}</Button>
        ) : null}
        {media?.senseId && media.imageability !== "NON_IMAGEABLE" && media.imageability !== "SUPPRESSED" ? (
          <Button disabled={mutation.isPending || media.generationPending} onClick={() => mutation.mutate("regenerate")} type="button" variant="outline"><RefreshCcw className="h-4 w-4" />{t("vocabulary.media.regenerate")}</Button>
        ) : null}
        {media?.alternatives.map((alternative) => (
          <Button key={alternative.id} onClick={() => mutation.mutate({ alternative: alternative.id })} type="button" variant="outline">{t("vocabulary.media.useAlternative")}</Button>
        ))}
      </div>
      {mutation.isError ? <p className="vocabulary-media-card__error" role="status">{t("vocabulary.media.actionFailed")}</p> : null}
    </section>
  );
}

function stateLabel(media: VocabularyMediaView | undefined, failed: boolean, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (failed) return t("vocabulary.media.inaccessible");
  if (!media) return t("vocabulary.media.loading");
  return t(`vocabulary.media.state.${media.state}`);
}
