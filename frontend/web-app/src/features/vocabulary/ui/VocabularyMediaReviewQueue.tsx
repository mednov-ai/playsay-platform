import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { fetchVocabularyMediaCandidates, reviewVocabularyMediaCandidate } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function VocabularyMediaReviewQueue() {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const candidates = useQuery({ queryKey: ["vocabulary-media-candidates"], queryFn: ({ signal }) => fetchVocabularyMediaCandidates(signal) });
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "APPROVE" | "REJECT" }) => reviewVocabularyMediaCandidate(id, { action, reasonCode: action === "REJECT" ? "WRONG_SENSE" : undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vocabulary-media-candidates"] }),
  });
  return (
    <details className="mt-5 rounded-2xl border border-border bg-background p-4">
      <summary className="cursor-pointer font-black"><ImageIcon className="mr-2 inline h-4 w-4" />{t("vocabulary.media.review.title")} ({candidates.data?.length ?? 0})</summary>
      <p className="mt-2 text-sm text-muted-foreground">{t("vocabulary.media.review.description")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {candidates.data?.map((candidate) => (
          <article className="rounded-xl border border-border p-3" key={candidate.id}>
            <strong>{t("vocabulary.media.review.sense", { id: candidate.senseId.slice(0, 8) })}</strong>
            <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
              <div><dt className="inline font-bold">{t("vocabulary.media.review.provenance")}: </dt><dd className="inline">{candidate.generatorType ?? candidate.origin} · {candidate.generatorModel ?? "—"} · {candidate.promptTemplateVersion ?? "—"}</dd></div>
              <div><dt className="inline font-bold">{t("vocabulary.media.review.safety")}: </dt><dd className="inline">{candidate.safetyState}</dd></div>
              <div><dt className="inline font-bold">{t("vocabulary.media.review.alt")}: </dt><dd className="inline">{candidate.altText.en ?? Object.values(candidate.altText)[0] ?? "—"}</dd></div>
            </dl>
            <div className="mt-3 flex gap-2">
              <Button disabled={review.isPending} onClick={() => review.mutate({ id: candidate.id, action: "APPROVE" })} type="button"><Check className="h-4 w-4" />{t("vocabulary.media.review.approve")}</Button>
              <Button disabled={review.isPending} onClick={() => review.mutate({ id: candidate.id, action: "REJECT" })} type="button" variant="outline"><X className="h-4 w-4" />{t("vocabulary.media.review.reject")}</Button>
            </div>
          </article>
        ))}
      </div>
      {candidates.isError || review.isError ? <p className="mt-3 text-sm font-bold text-destructive">{t("vocabulary.media.review.loadFailed")}</p> : null}
    </details>
  );
}
