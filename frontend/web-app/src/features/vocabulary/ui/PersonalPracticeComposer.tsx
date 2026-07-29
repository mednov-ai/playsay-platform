import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Clock3, Loader2, Pin, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  fetchVocabularyDashboard,
  isApiStatus,
  previewVocabularyPractice,
  type VocabularyEntry,
  type VocabularyPracticeMode,
  type VocabularyPracticePreview,
  type VocabularyPracticeSettings,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { vocabularyFeatures } from "../../../shared/config/vocabularyFeatures";

export type PersonalPracticeOwner = {
  subject: string;
  name: string;
  username?: string | null;
  presence?: "PRESENT" | "ABSENT";
};

export function PersonalPracticeComposer({
  actionLabel,
  delivery,
  disabled = false,
  lessonId,
  onPublish,
  owners,
}: {
  actionLabel: string;
  delivery: "HOMEWORK" | "LIVE";
  disabled?: boolean;
  lessonId?: string;
  onPublish: (preview: VocabularyPracticePreview, settings: VocabularyPracticeSettings) => Promise<void>;
  owners: PersonalPracticeOwner[];
}) {
  const { t } = useAppTranslation();
  const [mode, setMode] = useState<VocabularyPracticeMode>("BALANCED");
  const [wordLimit, setWordLimit] = useState(10);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(() => (
    owners.filter((owner) => owner.presence !== "ABSENT").map((owner) => owner.subject)
  ));
  const [activeOwner, setActiveOwner] = useState(
    owners.find((owner) => owner.presence !== "ABSENT")?.subject ?? owners[0]?.subject ?? "",
  );
  const [pinnedByOwner, setPinnedByOwner] = useState<Record<string, string[]>>({});
  const [excludedByOwner, setExcludedByOwner] = useState<Record<string, string[]>>({});
  const [knownEntries, setKnownEntries] = useState<Record<string, VocabularyEntry>>({});
  const [search, setSearch] = useState("");
  const [debouncedSettings, setDebouncedSettings] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const planRef = useRef<{ id: string; revision: number } | null>(null);

  useEffect(() => {
    const available = new Set(owners.map((owner) => owner.subject));
    setSelectedSubjects((current) => {
      const retained = current.filter((subject) => available.has(subject));
      const additions = owners
        .filter((owner) => owner.presence !== "ABSENT" && !retained.includes(owner.subject))
        .map((owner) => owner.subject);
      return [...retained, ...additions];
    });
    if (!available.has(activeOwner)) setActiveOwner(owners[0]?.subject ?? "");
  }, [activeOwner, owners]);
  useEffect(() => {
    if (!selectedSubjects.includes(activeOwner)) setActiveOwner(selectedSubjects[0] ?? "");
  }, [activeOwner, selectedSubjects]);

  const ownerOverrides = useMemo(
    () => selectedSubjects.map((ownerSubject) => ({
      excludedEntryIds: excludedByOwner[ownerSubject] ?? [],
      ownerSubject,
      pinnedEntryIds: pinnedByOwner[ownerSubject] ?? [],
    })),
    [excludedByOwner, pinnedByOwner, selectedSubjects],
  );
  const settingsKey = JSON.stringify({ delivery, lessonId, mode, ownerOverrides, selectedSubjects, wordLimit });
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSettings(settingsKey), 300);
    return () => window.clearTimeout(timer);
  }, [settingsKey]);

  const previewQuery = useQuery({
    enabled: selectedSubjects.length > 0 && debouncedSettings === settingsKey,
    queryKey: ["vocabulary-practice-preview-v2", debouncedSettings],
    queryFn: async ({ signal }) => {
      const currentPlan = planRef.current;
      const input = {
        delivery,
        lessonId,
        mode,
        ownerOverrides,
        ownerSubjects: selectedSubjects,
        planId: currentPlan?.id,
        planRevision: currentPlan?.revision,
        wordLimit,
      };
      try {
        return await previewVocabularyPractice(input, signal);
      } catch (caught) {
        // An aborted browser request can still commit its server-side revision.
        // Recover with a fresh draft instead of leaving the composer on a stale 409.
        if (
          !currentPlan
          || (!isApiStatus(caught, 409) && !isApiStatus(caught, 410))
          || signal.aborted
        ) throw caught;
        planRef.current = null;
        return previewVocabularyPractice({ ...input, planId: undefined, planRevision: undefined }, signal);
      }
    },
    staleTime: 0,
  });
  const preview = previewQuery.data;
  useEffect(() => {
    if (!preview) return;
    planRef.current = { id: preview.planId, revision: preview.revision };
    setKnownEntries((current) => {
      const next = { ...current };
      preview.owners.forEach((owner) => owner.entries.forEach((entry) => { next[entry.id] = entry; }));
      return next;
    });
  }, [preview]);

  const searchQuery = useQuery({
    enabled: Boolean(activeOwner) && search.trim().length > 0,
    queryKey: ["vocabulary-dashboard-search", activeOwner, search.trim()],
    queryFn: ({ signal }) => fetchVocabularyDashboard(activeOwner, search.trim(), lessonId, signal),
    staleTime: 20_000,
  });
  useEffect(() => {
    const dashboard = searchQuery.data;
    if (!dashboard) return;
    setKnownEntries((current) => {
      const next = { ...current };
      dashboard.entries.forEach(({ entry }) => { next[entry.id] = entry; });
      return next;
    });
  }, [searchQuery.data]);

  const activePreview = preview?.owners.find((owner) => owner.ownerSubject === activeOwner);
  const selectedIds = new Set(activePreview?.entries.map((entry) => entry.id) ?? []);
  const pinned = pinnedByOwner[activeOwner] ?? [];
  const excluded = excludedByOwner[activeOwner] ?? [];
  const searchedEntries = searchQuery.data?.entries.map(({ entry }) => entry) ?? [];
  const exerciseDistribution = useMemo(() => {
    const totals = new Map<string, number>();
    preview?.owners.forEach((owner) => owner.exerciseDistribution?.forEach((part) => {
      totals.set(part.exerciseType, (totals.get(part.exerciseType) ?? 0) + part.count);
    }));
    return Array.from(totals, ([exerciseType, count]) => ({ exerciseType, count }));
  }, [preview]);
  const recommendation = useMemo(() => {
    const ownerPreviews = preview?.owners ?? [];
    return {
      items: Math.max(0, ...ownerPreviews.map((owner) => owner.estimatedItemCount)),
      minutes: preview?.estimatedMinutes ?? 0,
      words: Math.max(0, ...ownerPreviews.map((owner) => owner.selectedCount)),
    };
  }, [preview]);

  function updateOwnerIds(
    setter: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
    ownerSubject: string,
    updater: (current: string[]) => string[],
  ) {
    setter((current) => ({ ...current, [ownerSubject]: updater(current[ownerSubject] ?? []) }));
  }

  function pin(entry: VocabularyEntry) {
    setKnownEntries((current) => ({ ...current, [entry.id]: entry }));
    updateOwnerIds(setPinnedByOwner, activeOwner, (current) => current.includes(entry.id) ? current : [...current, entry.id]);
    updateOwnerIds(setExcludedByOwner, activeOwner, (current) => current.filter((id) => id !== entry.id));
  }

  function exclude(entry: VocabularyEntry) {
    setKnownEntries((current) => ({ ...current, [entry.id]: entry }));
    updateOwnerIds(setExcludedByOwner, activeOwner, (current) => current.includes(entry.id) ? current : [...current, entry.id]);
    updateOwnerIds(setPinnedByOwner, activeOwner, (current) => current.filter((id) => id !== entry.id));
  }

  async function publish() {
    if (!preview || preview.owners.every((owner) => owner.selectedCount === 0)) return;
    setPublishing(true);
    setMessage(null);
    try {
      await onPublish(preview, {
        delivery,
        lessonId,
        mode,
        ownerOverrides,
        ownerSubjects: selectedSubjects,
        planId: preview.planId,
        planRevision: preview.revision,
        wordLimit,
      });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("vocabulary.practice.errors.publish"));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="grid gap-4" data-testid="personal-practice-composer">
      <div className="rounded-2xl border border-primary/20 bg-[#fff5ed] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm"><Sparkles className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-black">
              {t(
                preview && preview.owners.length > 1
                  ? "vocabulary.practice.composer.groupRecommendation"
                  : "vocabulary.practice.composer.recommendation",
                recommendation,
              )}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs font-bold text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />{t("vocabulary.practice.composer.snapshot")}
            </p>
          </div>
          {previewQuery.isFetching ? <Loader2 aria-label={t("common.status.loading")} className="h-5 w-5 animate-spin text-primary" /> : null}
        </div>
        {exerciseDistribution.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {exerciseDistribution.map((part) => (
              <span className="rounded-full border border-primary/15 bg-white px-2.5 py-1 text-xs font-extrabold" key={part.exerciseType}>
                {t(`vocabulary.practice.exercise.${part.exerciseType}`)} · {part.count}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-black">{t("vocabulary.practice.composer.learners")}</p>
        {owners.map((owner) => {
          const selected = selectedSubjects.includes(owner.subject);
          return (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-white p-3" key={owner.subject}>
              <input
                checked={selected}
                className="h-4 w-4 accent-primary"
                onChange={() => setSelectedSubjects((current) => selected ? current.filter((item) => item !== owner.subject) : [...current, owner.subject])}
                type="checkbox"
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate">{owner.name}</strong>
                {owner.username ? <span className="block truncate text-xs font-bold text-muted-foreground">@{owner.username}</span> : null}
              </span>
              {owner.presence === "ABSENT" ? <span className="text-xs font-black text-muted-foreground">{t("vocabulary.practice.composer.absent")}</span> : null}
            </label>
          );
        })}
      </div>

      {selectedSubjects.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {owners.filter((owner) => selectedSubjects.includes(owner.subject)).map((owner) => (
            <Button className="min-h-9 shrink-0 px-3 py-1.5 text-sm" key={owner.subject} onClick={() => setActiveOwner(owner.subject)} type="button" variant={activeOwner === owner.subject ? "default" : "outline"}>
              {owner.name}
            </Button>
          ))}
        </div>
      ) : null}

      {activePreview ? (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-black">{t("vocabulary.practice.composer.composition")}</h3>
            <span className="text-xs font-extrabold text-muted-foreground">{activePreview.selectedCount}</span>
          </div>
          <div className="grid gap-2">
            {activePreview.selection?.map(({ entry, readinessWarnings, reason }) => (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-3" key={entry.id}>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate">{entry.sourceText}</strong>
                  <span className="block truncate text-sm font-semibold text-muted-foreground">{entry.translation}</span>
                  <span className="mt-1 block text-[11px] font-black uppercase tracking-wide text-primary">
                    {pinned.includes(entry.id) ? t("vocabulary.practice.composer.added") : t(`vocabulary.practice.reason.${reason}`)}
                  </span>
                  {readinessWarnings.map((warning) => (
                    <span className="mt-1 block text-xs font-bold text-[#9a5b18]" key={warning}>
                      {t(`vocabulary.practice.warning.${warning}`)}
                    </span>
                  ))}
                </div>
                <Button aria-label={t("vocabulary.practice.builder.pin")} className="h-9 w-9 px-0" onClick={() => pin(entry)} type="button" variant="outline">
                  {pinned.includes(entry.id) ? <Check className="h-4 w-4 text-primary" /> : <Pin className="h-4 w-4" />}
                </Button>
                <Button aria-label={t("vocabulary.practice.builder.exclude")} className="h-9 w-9 px-0" onClick={() => exclude(entry)} type="button" variant="outline">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {excluded.length ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/35 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{t("vocabulary.practice.composer.excluded")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {excluded.map((entryId) => (
                  <Button
                    key={entryId}
                    onClick={() => updateOwnerIds(setExcludedByOwner, activeOwner, (current) => current.filter((id) => id !== entryId))}
                    className="min-h-9 px-3 py-1.5 text-sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />{knownEntries[entryId]?.sourceText ?? t("vocabulary.practice.composer.word")}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            aria-label={t("vocabulary.practice.composer.search")}
            className="playsay-input pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("vocabulary.practice.composer.search")}
            value={search}
          />
        </label>
        {search.trim() ? (
          <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-white p-2">
            {searchedEntries.filter((entry) => !selectedIds.has(entry.id) || excluded.includes(entry.id)).map((entry) => (
              <button className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted" key={entry.id} onClick={() => pin(entry)} type="button">
                <span className="min-w-0 flex-1"><strong className="block truncate">{entry.sourceText}</strong><small className="block truncate text-muted-foreground">{entry.translation}</small></span>
                <Pin className="h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <details className="rounded-2xl border border-border bg-white p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between font-black">
          {t("vocabulary.practice.composer.settings")}<ChevronDown className="h-4 w-4" />
        </summary>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1 text-sm font-bold">
            {t("vocabulary.practice.builder.wordLimit")}
            <input className="accent-primary" max={20} min={1} onChange={(event) => setWordLimit(Number(event.target.value))} type="range" value={wordLimit} />
            <span className="text-muted-foreground">{wordLimit}</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["QUICK", "BALANCED", "WRITING", "KEYBOARD"] as VocabularyPracticeMode[])
              .filter((value) => value !== "KEYBOARD" || vocabularyFeatures.key)
              .map((value) => (
                <Button key={value} onClick={() => setMode(value)} type="button" variant={mode === value ? "default" : "outline"}>
                  {t(`vocabulary.practice.mode.${value}`)}
                </Button>
              ))}
          </div>
        </div>
      </details>

      {activePreview?.sampleItems?.length ? (
        <details className="rounded-2xl border border-border bg-white p-4">
          <summary className="cursor-pointer font-black">{t("vocabulary.practice.composer.previewTasks")}</summary>
          <ol className="mt-3 grid gap-2">
            {activePreview.sampleItems.map((item, index) => (
              <li className="rounded-xl bg-muted/45 p-3 text-sm" key={`${item.exerciseType}-${index}`}>
                <span className="font-black text-primary">{t(`vocabulary.practice.exercise.${item.exerciseType}`)}</span>
                <span className="mt-1 block font-semibold">{item.prompt || t("vocabulary.practice.composer.matchingPrompt")}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {previewQuery.error || message ? (
        <p aria-live="assertive" className="text-sm font-bold text-destructive">
          {message ?? (previewQuery.error instanceof Error ? previewQuery.error.message : t("vocabulary.practice.errors.preview"))}
        </p>
      ) : null}
      <Button
        className="w-full"
        disabled={disabled || publishing || previewQuery.isFetching || !preview || preview.owners.every((owner) => owner.selectedCount === 0)}
        onClick={() => void publish()}
        type="button"
      >
        {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {actionLabel}
      </Button>
    </section>
  );
}
