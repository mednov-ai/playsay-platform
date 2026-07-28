import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { updateVocabularyEntry, type VocabularyEntry } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function VocabularyEntryEditDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: VocabularyEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useAppTranslation();
  const [translation, setTranslation] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [example, setExample] = useState("");
  const [exampleTranslation, setExampleTranslation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTranslation(entry?.translation ?? "");
    setPartOfSpeech(entry?.partOfSpeech ?? "");
    setExample(entry?.example ?? "");
    setExampleTranslation(entry?.exampleTranslation ?? "");
    setMessage(null);
  }, [entry?.id]);

  if (!entry) return null;
  const entryId = entry.id;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await updateVocabularyEntry(entryId, {
        example: example.trim(),
        exampleTranslation: exampleTranslation.trim(),
        partOfSpeech: partOfSpeech.trim(),
        translation: translation.trim(),
        translationState: translation.trim() ? "CONFIRMED" : "MISSING",
      });
      onSaved();
      onClose();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("vocabulary.messages.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-label={t("vocabulary.editDialog.title")} aria-modal="true">
      <section className="my-auto w-full max-w-xl rounded-2xl border border-border bg-background p-5 shadow-xl">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">{t("vocabulary.editDialog.title")}</h2>
            <p className="mt-1 truncate font-black text-primary">{entry.sourceText}</p>
          </div>
          <Button aria-label={t("common.actions.close")} onClick={onClose} type="button" variant="outline"><X className="h-4 w-4" /></Button>
        </header>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-bold">
            {t("vocabulary.fields.translation")}
            <input className="playsay-input" maxLength={500} onChange={(event) => setTranslation(event.target.value)} value={translation} />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            {t("vocabulary.editDialog.partOfSpeech")}
            <input className="playsay-input" maxLength={80} onChange={(event) => setPartOfSpeech(event.target.value)} value={partOfSpeech} />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            {t("vocabulary.editDialog.example")}
            <textarea className="playsay-input min-h-20 resize-y" maxLength={1000} onChange={(event) => setExample(event.target.value)} value={example} />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            {t("vocabulary.editDialog.exampleTranslation")}
            <textarea className="playsay-input min-h-20 resize-y" maxLength={1000} onChange={(event) => setExampleTranslation(event.target.value)} value={exampleTranslation} />
          </label>
        </div>
        {message ? <p aria-live="assertive" className="mt-3 text-sm font-bold text-destructive">{message}</p> : null}
        <Button className="mt-4 w-full" disabled={saving} onClick={() => void save()} type="button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("vocabulary.actions.save")}
        </Button>
      </section>
    </div>
  );
}
