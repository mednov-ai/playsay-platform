import { BookPlus, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import { createVocabularyEntry, suggestVocabularyTranslation, type CreateVocabularyEntry } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function VocabularyQuickAdd({ children, recipientSubjects = [], source }: { children: ReactNode; recipientSubjects?: string[]; source: Omit<CreateVocabularyEntry, "sourceText"> }) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [translation, setTranslation] = useState("");
  const [suggestion, setSuggestion] = useState<Awaited<ReturnType<typeof suggestVocabularyTranslation>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [addToAll, setAddToAll] = useState(false);

  useEffect(() => {
    function onSelection() {
      const selected = window.getSelection()?.toString().trim() ?? "";
      if (selected.length > 0 && selected.length <= 240) setSourceText(selected);
    }
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  async function suggest() {
    if (!sourceText.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await suggestVocabularyTranslation({ sourceText, context: source.context });
      setSuggestion(next);
      setTranslation(next.translation);
      if (!next.translation) setMessage(t("vocabulary.messages.translationUnavailable"));
    } catch {
      setMessage(t("vocabulary.messages.translationUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!sourceText.trim()) return;
    setBusy(true);
    try {
      const owners = addToAll && recipientSubjects.length > 0 ? recipientSubjects : [source.ownerSubject];
      await Promise.all(owners.map((ownerSubject) => createVocabularyEntry({ ...source, ownerSubject, sourceText, translation, partOfSpeech: suggestion?.partOfSpeech, example: suggestion?.example, exampleTranslation: suggestion?.exampleTranslation, translationState: translation ? "CONFIRMED" : "MISSING" })));
      setMessage(t("vocabulary.messages.saved"));
      setSourceText("");
      setTranslation("");
      setSuggestion(null);
    } catch {
      setMessage(t("vocabulary.messages.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return <div className="relative">
    {children}
    <Button className="mt-2" onClick={() => setOpen(true)} type="button" variant="outline"><BookPlus className="h-4 w-4" />{t("vocabulary.actions.add")}</Button>
    {open ? <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" role="dialog" aria-label={t("vocabulary.quickAdd.title")}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold">{t("vocabulary.quickAdd.title")}</h2><Button aria-label={t("common.close")} onClick={() => setOpen(false)} type="button" variant="outline"><X className="h-4 w-4" /></Button></div>
        <label className="grid gap-1 text-sm font-bold">{t("vocabulary.fields.word")}<input className="playsay-input" maxLength={240} onChange={(event) => setSourceText(event.target.value)} value={sourceText} /></label>
        <label className="mt-3 grid gap-1 text-sm font-bold">{t("vocabulary.fields.translation")}<input className="playsay-input" maxLength={500} onChange={(event) => setTranslation(event.target.value)} value={translation} /></label>
        {recipientSubjects.length > 1 ? <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input checked={addToAll} onChange={(event) => setAddToAll(event.target.checked)} type="checkbox" />{t("vocabulary.fields.allParticipants")}</label> : null}
        {message ? <p className="mt-3 text-sm font-semibold text-muted-foreground">{message}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy || !sourceText.trim()} onClick={() => void suggest()} type="button" variant="outline">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{t("vocabulary.actions.suggest")}</Button><Button disabled={busy || !sourceText.trim()} onClick={() => void save()} type="button">{t("vocabulary.actions.save")}</Button></div>
      </div>
    </div> : null}
  </div>;
}
