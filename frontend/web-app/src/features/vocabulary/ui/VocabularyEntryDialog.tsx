import { Loader2, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "../../../components/ui/button";
import {
  createVocabularyEntry,
  suggestVocabularyTranslation,
  type CreateVocabularyEntry,
  type TranslationSuggestion,
  type TranslationVariant,
  type VocabularyEntry,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

const automaticTranslationDelayMs = 450;

export function useVocabularyEntryFormController({
  active,
  onSaved,
  recipientSubjects = [],
  source,
}: {
  active: boolean;
  onSaved?: (entries: VocabularyEntry[]) => void;
  recipientSubjects?: string[];
  source: Omit<CreateVocabularyEntry, "sourceText">;
}) {
  const { t } = useAppTranslation();
  const requestSerial = useRef(0);
  const translationAbortController = useRef<AbortController | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [translation, setTranslation] = useState("");
  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState<TranslationSuggestion | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TranslationVariant | null>(null);
  const [translating, setTranslating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [addToAll, setAddToAll] = useState(false);

  const changeSourceText = useCallback((value: string) => {
    requestSerial.current += 1;
    translationAbortController.current?.abort();
    translationAbortController.current = null;
    setSourceText(value);
    setTranslation("");
    setSuggestion(null);
    setSelectedVariant(null);
    setTranslating(false);
    setMessage("");
  }, []);

  useEffect(() => {
    if (active) return undefined;
    function onSelection() {
      const selected = window.getSelection()?.toString().trim() ?? "";
      if (selected.length > 0 && selected.length <= 240) changeSourceText(selected);
    }
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [active, changeSourceText]);

  const translate = useCallback(async (clarification: string, previousTranslations: string[]) => {
    const cleanSourceText = sourceText.trim();
    if (!cleanSourceText) return;
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    translationAbortController.current?.abort();
    const abortController = new AbortController();
    translationAbortController.current = abortController;
    setTranslating(true);
    setMessage("");
    try {
      const next = await suggestVocabularyTranslation({
        sourceText: cleanSourceText,
        context: source.context,
        instruction: clarification.trim() || undefined,
        previousTranslations,
      }, abortController.signal);
      if (requestSerial.current !== serial) return;
      const variants = normalizedVariants(next);
      setSuggestion({ ...next, variants });
      const firstVariant = variants[0] ?? null;
      setSelectedVariant(firstVariant);
      setTranslation(firstVariant?.translation ?? "");
      if (!firstVariant) setMessage(t("vocabulary.messages.translationUnavailable"));
    } catch {
      if (requestSerial.current === serial) setMessage(t("vocabulary.messages.translationUnavailable"));
    } finally {
      if (requestSerial.current === serial) {
        translationAbortController.current = null;
        setTranslating(false);
      }
    }
  }, [source.context, sourceText, t]);

  useEffect(() => {
    if (!active || !sourceText.trim()) return undefined;
    const timer = window.setTimeout(() => void translate("", []), automaticTranslationDelayMs);
    return () => window.clearTimeout(timer);
  }, [active, sourceText, translate]);

  function selectVariant(variant: TranslationVariant) {
    setSelectedVariant(variant);
    setTranslation(variant.translation);
  }

  function regenerate() {
    const previousTranslations = [
      ...(suggestion?.variants.map((variant) => variant.translation) ?? []),
      translation,
    ].map((value) => value.trim()).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
    void translate(instruction, previousTranslations);
  }

  async function save() {
    if (!sourceText.trim()) return;
    setSaving(true);
    try {
      const owners = addToAll && recipientSubjects.length > 0 ? recipientSubjects : [source.ownerSubject];
      const savedEntries = await Promise.all(owners.map((ownerSubject) => createVocabularyEntry({
        ...source,
        ownerSubject,
        sourceText,
        translation,
        partOfSpeech: selectedVariant?.partOfSpeech ?? undefined,
        example: selectedVariant?.example ?? undefined,
        exampleTranslation: selectedVariant?.exampleTranslation ?? undefined,
        translationState: translation ? "CONFIRMED" : "MISSING",
      })));
      changeSourceText("");
      setInstruction("");
      setMessage(t("vocabulary.messages.saved"));
      onSaved?.(savedEntries);
    } catch {
      setMessage(t("vocabulary.messages.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function cancelPending() {
    requestSerial.current += 1;
    translationAbortController.current?.abort();
    translationAbortController.current = null;
    setTranslating(false);
  }

  return {
    addToAll,
    cancelPending,
    changeSourceText,
    instruction,
    message,
    regenerate,
    save,
    saving,
    selectVariant,
    selectedVariant,
    setAddToAll,
    setInstruction,
    setTranslation,
    sourceText,
    suggestion,
    translating,
    translation,
  };
}

type VocabularyEntryFormController = ReturnType<typeof useVocabularyEntryFormController>;

export function VocabularyEntryForm({
  controller,
  inputRef,
  recipientSubjects = [],
}: {
  controller: VocabularyEntryFormController;
  inputRef?: RefObject<HTMLInputElement>;
  recipientSubjects?: string[];
}) {
  const { t } = useAppTranslation();
  const {
    addToAll,
    changeSourceText,
    instruction,
    message,
    regenerate,
    save,
    saving,
    selectVariant,
    selectedVariant,
    setAddToAll,
    setInstruction,
    setTranslation,
    sourceText,
    suggestion,
    translating,
    translation,
  } = controller;

  return (
    <div className="playsay-vocabulary-entry-form">
      <label className="grid gap-1 text-sm font-bold">
        {t("vocabulary.fields.word")}
        <input
          className="playsay-input"
          maxLength={240}
          onChange={(event) => changeSourceText(event.target.value)}
          ref={inputRef}
          value={sourceText}
        />
      </label>
      {translating ? <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin text-primary" />{t("vocabulary.messages.translating")}</p> : null}
      {suggestion?.variants.length ? <div className="mt-4">
        <p className="text-sm font-extrabold">{t("vocabulary.variants.title")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{suggestion.variants.map((variant, index) => <button
          aria-pressed={selectedVariant === variant}
          className={`rounded-xl border p-3 text-left transition ${selectedVariant === variant ? "border-primary bg-primary/5" : "border-border bg-white hover:border-primary/50"}`}
          key={`${variant.translation}-${variant.example ?? index}`}
          onClick={() => selectVariant(variant)}
          type="button"
        >
          <span className="font-extrabold text-primary">{variant.translation}</span>
          {variant.partOfSpeech ? <span className="ml-2 text-xs font-bold text-muted-foreground">{variant.partOfSpeech}</span> : null}
          {variant.example ? <span className="mt-1 block text-sm">{variant.example}</span> : null}
          {variant.exampleTranslation ? <span className="mt-1 block text-xs text-muted-foreground">{variant.exampleTranslation}</span> : null}
        </button>)}</div>
      </div> : null}
      <label className="mt-3 grid gap-1 text-sm font-bold">{t("vocabulary.fields.translation")}<input className="playsay-input" maxLength={500} onChange={(event) => setTranslation(event.target.value)} value={translation} /></label>
      <label className="mt-3 grid gap-1 text-sm font-bold">{t("vocabulary.fields.aiInstruction")}<textarea className="playsay-input min-h-20 resize-y" maxLength={500} onChange={(event) => setInstruction(event.target.value)} placeholder={t("vocabulary.fields.aiInstructionPlaceholder")} value={instruction} /></label>
      {recipientSubjects.length > 1 ? <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input checked={addToAll} onChange={(event) => setAddToAll(event.target.checked)} type="checkbox" />{t("vocabulary.fields.allParticipants")}</label> : null}
      {message ? <p className="mt-3 text-sm font-semibold text-muted-foreground" role="status">{message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={saving || translating || !sourceText.trim()} onClick={regenerate} type="button" variant="outline">{translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{t("vocabulary.actions.regenerate")}</Button>
        <Button disabled={saving || translating || !sourceText.trim()} onClick={() => void save()} type="button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("vocabulary.actions.save")}</Button>
      </div>
    </div>
  );
}

export function VocabularyEntryDialog({
  onClose,
  onSaved,
  open,
  recipientSubjects = [],
  source,
}: {
  onClose: () => void;
  onSaved?: (entries: VocabularyEntry[]) => void;
  open: boolean;
  recipientSubjects?: string[];
  source: Omit<CreateVocabularyEntry, "sourceText">;
}) {
  const { t } = useAppTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useVocabularyEntryFormController({
    active: open,
    onSaved,
    recipientSubjects,
    source,
  });

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function close() {
    controller.cancelPending();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-label={t("vocabulary.quickAdd.title")} aria-modal="true">
      <div className="my-auto w-full max-w-xl rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{t("vocabulary.quickAdd.title")}</h2>
          <Button aria-label={t("common.actions.close")} onClick={close} type="button" variant="outline"><X className="h-4 w-4" /></Button>
        </div>
        <VocabularyEntryForm controller={controller} inputRef={inputRef} recipientSubjects={recipientSubjects} />
      </div>
    </div>
  );
}

export function normalizedVariants(suggestion: TranslationSuggestion): TranslationVariant[] {
  if ((suggestion.variants ?? []).length > 0) return suggestion.variants;
  return suggestion.translation ? [{
    translation: suggestion.translation,
    partOfSpeech: suggestion.partOfSpeech,
    example: suggestion.example,
    exampleTranslation: suggestion.exampleTranslation,
  }] : [];
}
