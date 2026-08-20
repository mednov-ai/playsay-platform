import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pin, Save, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  createVocabularySelectionRecipe,
  fetchVocabularySelectionRecipes,
  previewRecommendedVocabularyPractice,
  startSelfVocabularyPractice,
  type VocabularyPracticeMode,
  type VocabularyPracticeSession,
  type VocabularySelectionRecipe,
  type VocabularySkill,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

const availableSources = ["RECENT", "DUE", "FORGOTTEN", "DIFFICULT", "NEW", "FAVORITE", "FULL_DICTIONARY"] as const;
type SelectionSource = typeof availableSources[number];
const availableSkills: VocabularySkill[] = ["MEANING", "FORM", "SPELLING", "CONTEXT"];

export function StudentPracticeComposer({ onStart }: { onStart: (session: VocabularyPracticeSession) => void }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [sources, setSources] = useState<SelectionSource[]>(["DUE", "FORGOTTEN", "DIFFICULT", "NEW"]);
  const [mode, setMode] = useState<VocabularyPracticeMode>("BALANCED");
  const [wordLimit, setWordLimit] = useState(10);
  const [targetMinutes, setTargetMinutes] = useState(5);
  const [preferredSkills, setPreferredSkills] = useState<VocabularySkill[]>([]);
  const [pinnedEntryIds, setPinnedEntryIds] = useState<string[]>([]);
  const [excludedEntryIds, setExcludedEntryIds] = useState<string[]>([]);
  const [recipeName, setRecipeName] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");

  const settings = useMemo(() => ({
    delivery: "SELF" as const,
    excludedEntryIds,
    mode,
    pinnedEntryIds,
    selection: {
      match: "ANY" as const,
      maxNewItems: 3,
      preferredSkills,
      sources,
      targetMinutes,
    },
    wordLimit,
  }), [excludedEntryIds, mode, pinnedEntryIds, preferredSkills, sources, targetMinutes, wordLimit]);

  const recipesQuery = useQuery({
    queryFn: ({ signal }) => fetchVocabularySelectionRecipes(signal),
    queryKey: ["vocabulary-selection-recipes"],
    staleTime: 30_000,
  });
  const previewQuery = useQuery({
    queryFn: ({ signal }) => previewRecommendedVocabularyPractice(settings, signal),
    queryKey: ["vocabulary-self-preview", settings],
    enabled: sources.length > 0,
    staleTime: 15_000,
  });
  const saveRecipe = useMutation({
    mutationFn: () => createVocabularySelectionRecipe({
      excludedEntryIds,
      mode,
      name: recipeName.trim(),
      pinnedEntryIds,
      selection: settings.selection,
      wordLimit,
    }),
    onSuccess: (recipe) => {
      setRecipeName("");
      setSelectedRecipeId(recipe.id);
      void queryClient.invalidateQueries({ queryKey: ["vocabulary-selection-recipes"] });
    },
  });
  const startPractice = useMutation({
    mutationFn: async () => {
      const preview = previewQuery.data;
      if (!preview) throw new Error(t("vocabulary.practice.errors.preview"));
      return startSelfVocabularyPractice({
        planId: preview.planId,
        planRevision: preview.revision,
      });
    },
    onSuccess: (practice) => {
      const session = practice.sessions[0];
      if (session) onStart(session);
    },
  });
  const preview = previewQuery.data;
  const ownerPreview = preview?.owners[0];

  function toggleSource(source: SelectionSource) {
    setSelectedRecipeId("");
    setSources((current) => current.includes(source) ? current.filter((value) => value !== source) : [...current, source]);
  }

  function applyRecipe(recipe: VocabularySelectionRecipe | undefined) {
    if (!recipe) return;
    setSelectedRecipeId(recipe.id);
    setSources((recipe.selection.sources ?? []) as SelectionSource[]);
    setMode(recipe.mode ?? "BALANCED");
    setWordLimit(recipe.wordLimit ?? 10);
    setTargetMinutes(recipe.selection.targetMinutes ?? 5);
    setPreferredSkills(recipe.selection.preferredSkills ?? []);
    setPinnedEntryIds(recipe.pinnedEntryIds ?? []);
    setExcludedEntryIds(recipe.excludedEntryIds ?? []);
  }

  return (
    <section className="mt-6 grid gap-4" data-testid="student-practice-composer">
      <div className="rounded-2xl border border-primary/20 bg-[#fff7f0] p-4">
        <p className="flex items-center gap-2 font-black"><Sparkles className="h-5 w-5 text-primary" />{t("vocabulary.selfComposer.title")}</p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("vocabulary.selfComposer.description")}</p>
        {ownerPreview ? (
          <p className="mt-3 font-black text-primary" aria-live="polite">
            {t("vocabulary.selfComposer.preview", { items: ownerPreview.estimatedItemCount, minutes: preview?.estimatedMinutes ?? 0, words: ownerPreview.selectedCount })}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-black" htmlFor="vocabulary-saved-recipe">{t("vocabulary.selfComposer.saved")}</label>
        <select
          className="playsay-input"
          id="vocabulary-saved-recipe"
          onChange={(event) => applyRecipe(recipesQuery.data?.find((recipe) => recipe.id === event.target.value))}
          value={selectedRecipeId}
        >
          <option value="">{t("vocabulary.selfComposer.custom")}</option>
          {(recipesQuery.data ?? []).map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
        </select>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-black">{t("vocabulary.selfComposer.sources")}</legend>
        <div className="flex flex-wrap gap-2">
          {availableSources.map((source) => (
            <Button aria-pressed={sources.includes(source)} key={source} onClick={() => toggleSource(source)} type="button" variant={sources.includes(source) ? "default" : "outline"}>
              {sources.includes(source) ? <Check className="h-4 w-4" /> : null}{t(`vocabulary.selfComposer.source.${source}`)}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">
          {t("vocabulary.selfComposer.words", { count: wordLimit })}
          <input className="accent-primary" max={30} min={1} onChange={(event) => setWordLimit(Number(event.target.value))} type="range" value={wordLimit} />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          {t("vocabulary.selfComposer.minutes", { count: targetMinutes })}
          <input className="accent-primary" max={30} min={2} onChange={(event) => setTargetMinutes(Number(event.target.value))} type="range" value={targetMinutes} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["QUICK", "BALANCED", "WRITING"] as VocabularyPracticeMode[]).map((value) => (
          <Button key={value} onClick={() => setMode(value)} type="button" variant={mode === value ? "default" : "outline"}>{t(`vocabulary.practice.mode.${value}`)}</Button>
        ))}
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-black">{t("vocabulary.selfComposer.skills")}</legend>
        <p className="text-xs font-semibold text-muted-foreground">{t("vocabulary.selfComposer.skillsHint")}</p>
        <div className="flex flex-wrap gap-2">
          {availableSkills.map((skill) => (
            <Button
              aria-pressed={preferredSkills.includes(skill)}
              key={skill}
              onClick={() => setPreferredSkills((current) => current.includes(skill) ? current.filter((value) => value !== skill) : [...current, skill])}
              type="button"
              variant={preferredSkills.includes(skill) ? "default" : "outline"}
            >
              {t(`vocabulary.selfComposer.skill.${skill}`)}
            </Button>
          ))}
        </div>
      </fieldset>

      {ownerPreview?.selection?.length ? (
        <div className="grid gap-2">
          {ownerPreview.selection.map(({ entry, reason }) => (
            <article className="flex items-center gap-2 rounded-xl border border-border bg-white p-3" key={entry.id}>
              <div className="min-w-0 flex-1">
                <strong className="block truncate">{entry.sourceText}</strong>
                <span className="block truncate text-sm text-muted-foreground">{entry.translation}</span>
                <span className="text-xs font-black text-primary">{t(`vocabulary.practice.reason.${reason}`)}</span>
              </div>
              <Button aria-label={t("vocabulary.practice.builder.pin")} onClick={() => {
                setPinnedEntryIds((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id]);
                setExcludedEntryIds((current) => current.filter((id) => id !== entry.id));
              }} type="button" variant="outline"><Pin className="h-4 w-4" /></Button>
              <Button aria-label={t("vocabulary.practice.builder.exclude")} onClick={() => {
                setExcludedEntryIds((current) => current.includes(entry.id) ? current : [...current, entry.id]);
                setPinnedEntryIds((current) => current.filter((id) => id !== entry.id));
              }} type="button" variant="outline"><X className="h-4 w-4" /></Button>
            </article>
          ))}
        </div>
      ) : previewQuery.isFetching ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : (
        <p className="text-center text-sm font-semibold text-muted-foreground">{t("vocabulary.selfComposer.empty")}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label={t("vocabulary.selfComposer.recipeName")} className="playsay-input min-w-0 flex-1" onChange={(event) => setRecipeName(event.target.value)} placeholder={t("vocabulary.selfComposer.recipeName")} value={recipeName} />
        <Button disabled={!recipeName.trim() || saveRecipe.isPending} onClick={() => saveRecipe.mutate()} type="button" variant="outline"><Save className="h-4 w-4" />{t("vocabulary.selfComposer.save")}</Button>
      </div>
      <Button disabled={!ownerPreview?.selectedCount || startPractice.isPending} onClick={() => startPractice.mutate()} type="button">
        {startPractice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{t("vocabulary.today.start")}
      </Button>
      {previewQuery.isError || saveRecipe.isError || startPractice.isError ? <p aria-live="assertive" className="text-sm font-bold text-destructive">{t("vocabulary.practice.errors.preview")}</p> : null}
    </section>
  );
}
