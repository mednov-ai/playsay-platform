import { BookOpenCheck, Check, Loader2, Pin, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  createVocabularyHomeworkAssignment,
  previewVocabularyPractice,
  type VocabularyPracticeMode,
  type VocabularyPracticePreview,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { vocabularyFeatures } from "../../../shared/config/vocabularyFeatures";

export function VocabularyPracticeDrawer({
  onClose,
  onCreated,
  open,
  ownerName,
  ownerSubject,
}: {
  onClose: () => void;
  onCreated: () => void;
  open: boolean;
  ownerName: string;
  ownerSubject: string;
}) {
  const { t } = useAppTranslation();
  const [mode, setMode] = useState<VocabularyPracticeMode>("BALANCED");
  const [wordLimit, setWordLimit] = useState(10);
  const [preview, setPreview] = useState<VocabularyPracticePreview | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    previewVocabularyPractice({
      delivery: "HOMEWORK",
      excludedEntryIds: excluded,
      mode,
      ownerSubjects: [ownerSubject],
      pinnedEntryIds: pinned,
      wordLimit,
    })
      .then((value) => { if (!cancelled) setPreview(value); })
      .catch((caught) => { if (!cancelled) setMessage(caught instanceof Error ? caught.message : t("vocabulary.practice.errors.preview")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [excluded.join("|"), mode, open, ownerSubject, pinned.join("|"), wordLimit]);

  if (!open) return null;
  const ownerPreview = preview?.owners[0];

  async function publish() {
    setPublishing(true);
    setMessage(null);
    try {
      await createVocabularyHomeworkAssignment({
        excludedEntryIds: excluded,
        mode,
        pinnedEntryIds: pinned,
        studentSubjects: [ownerSubject],
        title: t("vocabulary.practice.homeworkTitle", { name: ownerName }),
        wordLimit,
      });
      onCreated();
      onClose();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("vocabulary.practice.errors.publish"));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/35" role="dialog" aria-label={t("vocabulary.practice.builder.title")} aria-modal="true">
      <button aria-label={t("common.actions.close")} className="min-w-0 flex-1 cursor-default" onClick={onClose} type="button" />
      <section className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-[#fffdfa] p-4 shadow-2xl sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">{t("vocabulary.practice.builder.eyebrow")}</p>
            <h2 className="mt-1 text-2xl font-black">{t("vocabulary.practice.builder.title")}</h2>
            <p className="mt-1 font-semibold text-muted-foreground">{ownerName}</p>
          </div>
          <Button aria-label={t("common.actions.close")} onClick={onClose} type="button" variant="outline"><X className="h-4 w-4" /></Button>
        </header>

        <div className="mt-5 rounded-2xl border border-primary/20 bg-[#fff5ed] p-4">
          {loading && !preview ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
            <>
              <p className="text-lg font-black">
                {t("vocabulary.practice.builder.suggestion", {
                  minutes: preview?.estimatedMinutes ?? 0,
                  words: ownerPreview?.selectedCount ?? 0,
                })}
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("vocabulary.practice.builder.suggestionHint")}</p>
            </>
          )}
        </div>

        <section className="mt-5">
          <h3 className="font-black">{t("vocabulary.practice.builder.words")}</h3>
          <label className="mt-3 grid gap-1 text-sm font-bold">
            {t("vocabulary.practice.builder.wordLimit")}
            <input className="accent-primary" max={20} min={3} onChange={(event) => setWordLimit(Number(event.target.value))} type="range" value={wordLimit} />
            <span className="text-muted-foreground">{wordLimit}</span>
          </label>
          <div className="mt-3 grid gap-2">
            {ownerPreview?.entries.map((entry) => {
              const isPinned = pinned.includes(entry.id);
              const isExcluded = excluded.includes(entry.id);
              return (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-3" key={entry.id}>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate">{entry.sourceText}</strong>
                    <span className="block truncate text-sm font-semibold text-muted-foreground">{entry.translation}</span>
                  </div>
                  <Button
                    aria-label={t("vocabulary.practice.builder.pin")}
                    onClick={() => {
                      setPinned((current) => isPinned ? current.filter((id) => id !== entry.id) : [...current, entry.id]);
                      setExcluded((current) => current.filter((id) => id !== entry.id));
                    }}
                    type="button"
                    variant="outline"
                  >
                    {isPinned ? <Check className="h-4 w-4 text-primary" /> : <Pin className="h-4 w-4" />}
                  </Button>
                  <Button
                    aria-label={t("vocabulary.practice.builder.exclude")}
                    onClick={() => {
                      setExcluded((current) => isExcluded ? current.filter((id) => id !== entry.id) : [...current, entry.id]);
                      setPinned((current) => current.filter((id) => id !== entry.id));
                    }}
                    type="button"
                    variant="outline"
                  >
                    <X className={`h-4 w-4 ${isExcluded ? "text-destructive" : ""}`} />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="font-black">{t("vocabulary.practice.builder.mode")}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["QUICK", "BALANCED", "WRITING", "KEYBOARD"] as VocabularyPracticeMode[])
              .filter((value) => value !== "KEYBOARD" || vocabularyFeatures.key)
              .map((value) => (
              <Button data-active={mode === value ? "true" : "false"} key={value} onClick={() => setMode(value)} type="button" variant={mode === value ? "default" : "outline"}>
                {t(`vocabulary.practice.mode.${value}`)}
              </Button>
              ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-white p-4">
          <h3 className="font-black">{t("vocabulary.practice.builder.delivery")}</h3>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("vocabulary.practice.builder.homeworkDelivery")}</p>
        </section>

        {message ? <p aria-live="assertive" className="mt-4 text-sm font-bold text-destructive">{message}</p> : null}
        <Button className="mt-5 w-full" disabled={publishing || loading || (ownerPreview?.selectedCount ?? 0) === 0} onClick={() => void publish()} type="button">
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
          {t("vocabulary.practice.builder.publish")}
        </Button>
      </section>
    </div>
  );
}
