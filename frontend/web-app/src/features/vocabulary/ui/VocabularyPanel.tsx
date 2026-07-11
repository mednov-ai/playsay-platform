import { Archive, BookOpen, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { archiveVocabularyEntry, fetchVocabularyEntries, type VocabularyEntry } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { VocabularyQuickAdd } from "./VocabularyQuickAdd";

export function VocabularyPanel() {
  const { t } = useAppTranslation();
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  async function load(value = query) { setLoading(true); try { setEntries(await fetchVocabularyEntries(value)); } finally { setLoading(false); } }
  useEffect(() => { void load(""); }, []);
  return <section className="rounded-3xl border border-border bg-white/90 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-black"><BookOpen className="h-6 w-6 text-primary" />{t("vocabulary.title")}</h1><p className="mt-1 text-sm font-semibold text-muted-foreground">{t("vocabulary.description")}</p></div><VocabularyQuickAdd source={{ sourceType: "MANUAL" }}><span /></VocabularyQuickAdd></div>
    <div className="mt-5 flex gap-2"><input className="playsay-input flex-1" onChange={(event) => setQuery(event.target.value)} placeholder={t("vocabulary.search")} value={query} /><Button onClick={() => void load()} type="button" variant="outline">{t("vocabulary.actions.search")}</Button></div>
    {loading ? <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" /> : entries.length === 0 ? <p className="mt-8 text-center font-semibold text-muted-foreground">{t("vocabulary.empty")}</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{entries.map((entry) => <article className="rounded-2xl border border-border bg-background p-4" key={entry.id}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">{entry.sourceText}</h2><p className="font-semibold text-primary">{entry.translation || t("vocabulary.translationMissing")}</p></div><Button aria-label={t("vocabulary.actions.archive")} onClick={async () => { await archiveVocabularyEntry(entry.id); await load(); }} type="button" variant="outline"><Archive className="h-4 w-4" /></Button></div>{entry.partOfSpeech ? <span className="mt-2 inline-block rounded-full bg-muted px-2 py-1 text-xs font-bold">{entry.partOfSpeech}</span> : null}{entry.example ? <p className="mt-3 text-sm text-muted-foreground">{entry.example}</p> : null}</article>)}</div>}
  </section>;
}
