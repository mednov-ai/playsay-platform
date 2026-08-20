import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, BookOpen, CalendarClock, Heart, Loader2, Pause, Pencil, Play, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  archiveVocabularyEntry,
  fetchVocabularyDashboard,
  fetchVocabularyLearners,
  fetchVocabularyPracticeHistory,
  startSelfVocabularyPractice,
  updateVocabularyEntry,
  type MeProfile,
  type VocabularyDashboard,
  type VocabularyLearnerSummary,
  type VocabularyLearningStage,
  type VocabularyPracticeSession,
  type VocabularyEntry,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { vocabularyFeatures } from "../../../shared/config/vocabularyFeatures";
import { VocabularyPracticeDrawer } from "./VocabularyPracticeDrawer";
import { VocabularyPracticePlayer } from "./VocabularyPracticePlayer";
import { VocabularyQuickAdd } from "./VocabularyQuickAdd";
import { VocabularyEntryEditDialog } from "./VocabularyEntryEditDialog";
import { StudentPracticeComposer } from "./StudentPracticeComposer";
import { VocabularyMediaCard } from "./VocabularyMediaCard";
import { VocabularyMediaReviewQueue } from "./VocabularyMediaReviewQueue";

type VocabularyTab = "TODAY" | "WORDS" | "HISTORY";
type EntryFilter = "ALL" | VocabularyLearningStage | "PAUSED" | "MISSING";
type StudentEntryFilter = "ALL" | "RECENT" | "DUE" | "FORGOTTEN" | "DIFFICULT" | "NEW" | "FAVORITE";

export function VocabularyPanel({ profile }: { profile: MeProfile | null }) {
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  return canManage ? <TeacherVocabularyPanel /> : <StudentVocabularyPanel />;
}

function TeacherVocabularyPanel() {
  const { t } = useAppTranslation();
  const [selected, setSelected] = useState<VocabularyLearnerSummary | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const learnersQuery = useQuery({
    queryFn: ({ signal }) => fetchVocabularyLearners(submittedQuery, signal),
    queryKey: ["vocabulary-learners", submittedQuery],
    staleTime: 20_000,
  });
  const learners = learnersQuery.data ?? [];

  if (selected) {
    return (
      <VocabularyOwnerWorkspace
        learner={selected}
        onBack={() => {
          setSelected(null);
          void learnersQuery.refetch();
        }}
      />
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-white/90 p-4 shadow-sm sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black"><BookOpen className="h-6 w-6 text-primary" />{t("vocabulary.teacher.title")}</h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("vocabulary.teacher.description")}</p>
      </header>
      <form className="mt-5 flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (submittedQuery === query.trim()) void learnersQuery.refetch();
        else setSubmittedQuery(query.trim());
      }}>
        <label className="sr-only" htmlFor="vocabulary-learner-search">{t("vocabulary.teacher.search")}</label>
        <input className="playsay-input min-w-0 flex-1" id="vocabulary-learner-search" onChange={(event) => setQuery(event.target.value)} placeholder={t("vocabulary.teacher.search")} value={query} />
        <Button aria-label={t("vocabulary.actions.search")} type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
      </form>
      {learnersQuery.isPending ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" /> : learnersQuery.isError ? (
        <p className="mt-6 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 font-semibold text-destructive">
          {learnersQuery.error instanceof Error ? learnersQuery.error.message : t("vocabulary.messages.loadFailed")}
        </p>
      ) : learners.length === 0 ? (
        <p className="mt-8 text-center font-semibold text-muted-foreground">{t("vocabulary.teacher.empty")}</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {learners.map((learner) => (
            <button className="rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:shadow-sm" key={learner.ownerSubject} onClick={() => setSelected(learner)} type="button">
              <span className="flex items-center gap-2 text-lg font-black"><UserRound className="h-5 w-5 text-primary" />{learner.ownerName}</span>
              {learner.ownerUsername ? <span className="mt-1 block text-xs font-bold text-muted-foreground">@{learner.ownerUsername}</span> : null}
              <span className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric value={learner.dueCount} label={t("vocabulary.stats.due")} tone="primary" />
                <Metric value={learner.learningCount} label={t("vocabulary.stats.learning")} />
                <Metric value={learner.masteredCount} label={t("vocabulary.stats.mastered")} />
              </span>
              <span className="mt-3 block text-xs font-bold text-muted-foreground">
                {learner.lastPracticedAt
                  ? t("vocabulary.teacher.lastPractice", { date: formatVocabularyDate(learner.lastPracticedAt) })
                  : t("vocabulary.teacher.neverPracticed")}
              </span>
              {learner.difficultCount > 0 ? (
                <span className="mt-2 inline-flex rounded-full bg-[#fff0ed] px-2 py-1 text-xs font-black text-[#a52a20]">
                  {t("vocabulary.stats.difficult", { count: learner.difficultCount })}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {vocabularyFeatures.generatedMedia ? <VocabularyMediaReviewQueue /> : null}
    </section>
  );
}

function VocabularyOwnerWorkspace({
  learner,
  onBack,
}: {
  learner: VocabularyLearnerSummary;
  onBack: () => void;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<EntryFilter>("ALL");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dashboardKey = ["vocabulary-dashboard", learner.ownerSubject, submittedQuery] as const;
  const historyKey = ["vocabulary-history", learner.ownerSubject] as const;
  const dashboardQuery = useQuery({
    queryFn: ({ signal }) => fetchVocabularyDashboard(learner.ownerSubject, submittedQuery, undefined, signal),
    queryKey: dashboardKey,
  });
  const historyQuery = useQuery({
    queryFn: ({ signal }) => fetchVocabularyPracticeHistory(learner.ownerSubject, undefined, signal),
    queryKey: historyKey,
  });
  const dashboard = dashboardQuery.data ?? null;
  const history = historyQuery.data ?? [];
  function refreshOwner() {
    void queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard", learner.ownerSubject] });
    void queryClient.invalidateQueries({ queryKey: historyKey });
    void queryClient.invalidateQueries({ queryKey: ["vocabulary-learners"] });
  }

  const entries = useMemo(() => dashboard?.entries.filter((item) => {
    if (filter === "ALL") return true;
    if (filter === "PAUSED") return item.entry.practicePaused;
    if (filter === "MISSING") return !item.entry.translation;
    return item.stage === filter;
  }) ?? [], [dashboard?.entries, filter]);

  return (
    <section className="rounded-3xl border border-border bg-white/90 p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button aria-label={t("vocabulary.practice.actions.back")} onClick={onBack} type="button" variant="outline"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black">{learner.ownerName}</h1>
            <p className="text-sm font-semibold text-muted-foreground">
              {learner.ownerUsername ? `@${learner.ownerUsername} · ` : ""}{t("vocabulary.teacher.studentVocabulary")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <VocabularyQuickAdd source={{ sourceType: "MANUAL", ownerSubject: learner.ownerSubject }}><span /></VocabularyQuickAdd>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Metric value={dashboard?.dueCount ?? learner.dueCount} label={t("vocabulary.stats.due")} tone="primary" />
        <Metric value={dashboard?.learningCount ?? learner.learningCount} label={t("vocabulary.stats.learning")} />
        <Metric value={dashboard?.masteredCount ?? learner.masteredCount} label={t("vocabulary.stats.mastered")} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-[#fff7f0] p-4">
        <div>
          <strong>{t("vocabulary.practice.builder.compactRecommendation", { count: dashboard?.dueCount ?? learner.dueCount })}</strong>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("vocabulary.practice.builder.suggestionHint")}</p>
        </div>
        {vocabularyFeatures.homework ? (
          <Button onClick={() => setDrawerOpen(true)} type="button"><Play className="h-4 w-4" />{t("vocabulary.practice.create")}</Button>
        ) : null}
      </div>

      <form className="mt-5 flex gap-2 border-t border-border pt-4" onSubmit={(event) => {
        event.preventDefault();
        if (submittedQuery === query.trim()) void dashboardQuery.refetch();
        else setSubmittedQuery(query.trim());
      }}>
        <input className="playsay-input min-w-0 flex-1" onChange={(event) => setQuery(event.target.value)} placeholder={t("vocabulary.search")} value={query} />
        <Button aria-label={t("vocabulary.actions.search")} type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2 pb-1">
        {(["ALL", "NEW", "LEARNING", "REVIEW", "MASTERED", "PAUSED", "MISSING"] as EntryFilter[]).map((value) => (
          <Button className="shrink-0" key={value} onClick={() => setFilter(value)} type="button" variant={filter === value ? "default" : "outline"}>{t(`vocabulary.filters.${value}`)}</Button>
        ))}
      </div>
      {dashboardQuery.isPending ? <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" /> : (
        <VocabularyWordGrid dashboard={dashboard} entries={entries} onChanged={refreshOwner} />
      )}
      <details className="mt-6 rounded-2xl border border-border bg-background p-4">
        <summary className="cursor-pointer font-black">{t("vocabulary.teacher.practiceTab")}</summary>
        <VocabularyHistory sessions={history} />
      </details>

      {vocabularyFeatures.homework ? (
        <VocabularyPracticeDrawer
          onClose={() => setDrawerOpen(false)}
          onCreated={refreshOwner}
          open={drawerOpen}
          ownerName={learner.ownerName}
          ownerSubject={learner.ownerSubject}
          ownerUsername={learner.ownerUsername}
        />
      ) : null}
    </section>
  );
}

function StudentVocabularyPanel() {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<VocabularyTab>(vocabularyFeatures.practice ? "TODAY" : "WORDS");
  const [session, setSession] = useState<VocabularyPracticeSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [wordFilter, setWordFilter] = useState<StudentEntryFilter>("ALL");
  const [wordQuery, setWordQuery] = useState("");
  const dashboardQuery = useQuery({
    queryFn: ({ signal }) => fetchVocabularyDashboard(undefined, "", undefined, signal),
    queryKey: ["vocabulary-dashboard", "self"],
  });
  const historyQuery = useQuery({
    queryFn: ({ signal }) => fetchVocabularyPracticeHistory(undefined, undefined, signal),
    queryKey: ["vocabulary-history", "self"],
  });
  const dashboard = dashboardQuery.data ?? null;
  const history = historyQuery.data ?? [];
  const visibleEntries = useMemo(() => {
    const normalized = wordQuery.trim().toLocaleLowerCase();
    const recentThreshold = Date.now() - 14 * 24 * 60 * 60 * 1_000;
    return (dashboard?.entries ?? []).filter((item) => {
      const matchesQuery = !normalized || item.entry.sourceText.toLocaleLowerCase().includes(normalized)
        || item.entry.translation?.toLocaleLowerCase().includes(normalized);
      if (!matchesQuery) return false;
      if (wordFilter === "ALL") return true;
      if (wordFilter === "RECENT") return Date.parse(item.entry.updatedAt) >= recentThreshold;
      if (wordFilter === "DUE") return item.overdue;
      if (wordFilter === "FORGOTTEN") return item.skills.some((skill) => skill.reviewReason === "LAPSED");
      if (wordFilter === "DIFFICULT") return item.skills.some((skill) => skill.reviewReason === "DIFFICULT" || (skill.difficultyScore ?? 0) >= 0.55);
      if (wordFilter === "NEW") return item.stage === "NEW";
      return item.entry.favorite === true;
    });
  }, [dashboard?.entries, wordFilter, wordQuery]);

  function refreshSelf() {
    void queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard", "self"] });
    void queryClient.invalidateQueries({ queryKey: ["vocabulary-history", "self"] });
  }

  async function startToday() {
    setStarting(true);
    try {
      const practice = await startSelfVocabularyPractice({ mode: "BALANCED", wordLimit: 10 });
      const own = practice.sessions[0] ?? null;
      setSession(own);
    } finally {
      setStarting(false);
    }
  }

  if (session) {
    return (
      <section>
        <Button className="mb-3" onClick={() => { setSession(null); refreshSelf(); }} type="button" variant="outline"><ArrowLeft className="h-4 w-4" />{t("vocabulary.practice.actions.back")}</Button>
        <VocabularyPracticePlayer initialSession={session} onSessionChange={setSession} />
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-white/90 p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><BookOpen className="h-6 w-6 text-primary" />{t("vocabulary.title")}</h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("vocabulary.description")}</p>
        </div>
        <VocabularyQuickAdd source={{ sourceType: "MANUAL" }}><span /></VocabularyQuickAdd>
      </header>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-border pb-3">
        {(["TODAY", "WORDS", "HISTORY"] as VocabularyTab[])
          .filter((value) => value !== "TODAY" || vocabularyFeatures.practice)
          .map((value) => (
          <Button className="shrink-0" key={value} onClick={() => setTab(value)} type="button" variant={tab === value ? "default" : "outline"}>{t(`vocabulary.tabs.${value}`)}</Button>
          ))}
      </div>
      {dashboardQuery.isPending || historyQuery.isPending ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" /> : tab === "TODAY" ? (
        vocabularyFeatures.composer ? <StudentPracticeComposer onStart={setSession} /> : <div className="mx-auto mt-6 max-w-2xl rounded-3xl border border-primary/20 bg-[#fff7f0] p-6 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 text-2xl font-black">{t("vocabulary.today.title")}</h2>
          <p className="mt-2 font-semibold text-muted-foreground">
            {dashboard?.dueCount
              ? t("vocabulary.today.ready", { count: dashboard.dueCount })
              : t("vocabulary.today.empty")}
          </p>
          <Button
            className="mt-5"
            disabled={starting || (dashboard?.totalCount ?? 0) <= (dashboard?.needsTranslationCount ?? 0)}
            onClick={() => void startToday()}
            type="button"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{t("vocabulary.today.start")}
          </Button>
        </div>
      ) : tab === "WORDS" ? (
        <div>
          <label className="relative mt-5 block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input aria-label={t("vocabulary.search")} className="playsay-input pl-9" onChange={(event) => setWordQuery(event.target.value)} placeholder={t("vocabulary.search")} value={wordQuery} />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {(["ALL", "RECENT", "DUE", "FORGOTTEN", "DIFFICULT", "NEW", "FAVORITE"] as StudentEntryFilter[]).map((value) => (
              <Button aria-pressed={wordFilter === value} className="shrink-0" key={value} onClick={() => setWordFilter(value)} type="button" variant={wordFilter === value ? "default" : "outline"}>{t(`vocabulary.studentFilters.${value}`)}</Button>
            ))}
          </div>
          <VocabularyWordGrid allowFavorite dashboard={dashboard} entries={visibleEntries} onChanged={refreshSelf} />
        </div>
      ) : (
        <VocabularyHistory
          onContinue={(historySession) => setSession(historySession)}
          sessions={history}
        />
      )}
    </section>
  );
}

function VocabularyWordGrid({
  allowFavorite = false,
  dashboard,
  entries,
  onChanged,
}: {
  allowFavorite?: boolean;
  dashboard: VocabularyDashboard | null;
  entries: VocabularyDashboard["entries"];
  onChanged: () => void;
}) {
  const { t } = useAppTranslation();
  const [editingEntry, setEditingEntry] = useState<VocabularyEntry | null>(null);
  const [archivedEntry, setArchivedEntry] = useState<VocabularyEntry | null>(null);
  if (!dashboard || entries.length === 0) return <p className="mt-8 text-center font-semibold text-muted-foreground">{t("vocabulary.empty")}</p>;
  return (
    <>
      {archivedEntry ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-[#fff7f0] p-3 text-sm font-bold">
          <span>{t("vocabulary.archive.done", { word: archivedEntry.sourceText })}</span>
          <Button className="min-h-9 px-3 py-1.5 text-sm" onClick={async () => { await updateVocabularyEntry(archivedEntry.id, { status: "ACTIVE" }); setArchivedEntry(null); onChanged(); }} type="button" variant="outline">
            {t("common.actions.undo")}
          </Button>
        </div>
      ) : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {entries.map(({ entry, stage, overdue, skills }) => {
          const nextSkill = skills.filter((skill) => skill.available !== false)
            .slice().sort((first, second) => Date.parse(first.dueAt) - Date.parse(second.dueAt))[0];
          return (
        <article className="rounded-2xl border border-border bg-background p-4" key={entry.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-extrabold">{entry.sourceText}</h2>
              <p className="font-semibold text-primary">{entry.translation || t("vocabulary.translationMissing")}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[0.68rem] font-black ${overdue ? "bg-[#fff0e7] text-primary" : "bg-muted text-muted-foreground"}`}>{t(`vocabulary.stage.${stage}`)}</span>
          </div>
          {vocabularyFeatures.generatedMedia ? <VocabularyMediaCard entry={entry} /> : null}
          {entry.example ? <p className="mt-3 text-sm text-muted-foreground">{entry.example}</p> : null}
          {nextSkill ? (
            <p className="mt-3 rounded-xl bg-muted/55 p-2 text-xs font-bold text-muted-foreground">
              {t(`vocabulary.memory.${nextSkill.reviewReason ?? "NEW"}`, { date: formatVocabularyDate(nextSkill.dueAt) })}
            </p>
          ) : null}
          {entry.occurrences.length > 0 ? (
            <details className="mt-3 rounded-xl border border-border/70 bg-white p-2 text-sm">
              <summary className="cursor-pointer font-bold text-muted-foreground">
                {t("vocabulary.occurrences.summary", { count: entry.occurrences.length })}
              </summary>
              <ul className="mt-2 grid gap-2">
                {entry.occurrences
                  .slice()
                  .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
                  .map((occurrence, index) => (
                    <li className="rounded-lg bg-muted/45 p-2" key={`${occurrence.sourceType}-${occurrence.createdAt}-${index}`}>
                      <strong className="block text-xs">
                        {t("vocabulary.occurrences.added", {
                          date: formatVocabularyDate(occurrence.createdAt),
                          source: t(`vocabulary.occurrences.source.${occurrence.sourceType}`),
                        })}
                      </strong>
                      {occurrence.context ? <span className="mt-1 block text-xs text-muted-foreground">{t("vocabulary.occurrences.context", { context: occurrence.context })}</span> : null}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
          {!entry.translation || !hasExactExample(entry) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {!entry.translation ? <span className="rounded-full bg-[#fff0ed] px-2 py-1 text-xs font-black text-[#a52a20]">{t("vocabulary.readiness.noTranslation")}</span> : null}
              {!hasExactExample(entry) ? <span className="rounded-full bg-[#fff7e5] px-2 py-1 text-xs font-black text-[#8a5b17]">{t("vocabulary.readiness.noExample")}</span> : null}
            </div>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            {allowFavorite ? (
              <Button aria-label={entry.favorite ? t("vocabulary.actions.unfavorite") : t("vocabulary.actions.favorite")} onClick={async () => { await updateVocabularyEntry(entry.id, { favorite: !entry.favorite }); onChanged(); }} type="button" variant="outline">
                <Heart className={`h-4 w-4 ${entry.favorite ? "fill-primary text-primary" : ""}`} />
              </Button>
            ) : null}
            <Button aria-label={t("vocabulary.actions.edit")} onClick={() => setEditingEntry(entry)} type="button" variant="outline"><Pencil className="h-4 w-4" /></Button>
            <Button
              aria-label={entry.practicePaused ? t("vocabulary.actions.resume") : t("vocabulary.actions.pause")}
              onClick={async () => {
                await updateVocabularyEntry(entry.id, { practicePaused: !entry.practicePaused });
                onChanged();
              }}
              type="button"
              variant="outline"
            >
              {entry.practicePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button
              aria-label={t("vocabulary.actions.archive")}
              onClick={async () => {
                if (!window.confirm(t("vocabulary.archive.confirm", { word: entry.sourceText }))) return;
                await archiveVocabularyEntry(entry.id);
                setArchivedEntry(entry);
                onChanged();
              }}
              type="button"
              variant="outline"
            >
              <Archive className="h-4 w-4" />
            </Button>
          </div>
        </article>
          );
        })}
      </div>
      <VocabularyEntryEditDialog entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={onChanged} />
    </>
  );
}

function hasExactExample(entry: VocabularyEntry): boolean {
  const source = entry.sourceText.trim().toLocaleLowerCase();
  const example = entry.example?.trim().toLocaleLowerCase() ?? "";
  if (!source || !example) return false;
  const index = example.indexOf(source);
  if (index < 0) return false;
  const before = example[index - 1];
  const after = example[index + source.length];
  return (!before || /[^\p{L}\p{N}'’-]/u.test(before)) && (!after || /[^\p{L}\p{N}'’-]/u.test(after));
}

function VocabularyHistory({
  onContinue,
  sessions,
}: {
  onContinue?: (session: VocabularyPracticeSession) => void;
  sessions: VocabularyPracticeSession[];
}) {
  const { t } = useAppTranslation();
  if (sessions.length === 0) return <p className="mt-8 text-center font-semibold text-muted-foreground">{t("vocabulary.history.empty")}</p>;
  return (
    <div className="mt-5 grid gap-2">
      {sessions.map((session) => (
        <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4" key={session.id}>
          <div>
            <strong>{session.delivery ? t(`vocabulary.history.delivery.${session.delivery}`) : t(`vocabulary.sessionStatus.${session.status}`)}</strong>
            <p className="text-sm font-semibold text-muted-foreground">
              {session.mode ? `${t(`vocabulary.practice.mode.${session.mode}`)} · ` : ""}{formatVocabularyDate(session.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-black">
              {session.completedItems}/{session.totalItems} · {session.accuracy === null || session.accuracy === undefined ? "—" : `${Math.round(session.accuracy * 100)}%`}
            </span>
            {onContinue && session.status !== "COMPLETED" && session.status !== "CANCELLED" ? (
              <Button className="min-h-9 px-3 py-1.5 text-sm" onClick={() => onContinue(session)} type="button" variant="outline">
                <Play className="h-4 w-4" />{t("vocabulary.history.continue")}
              </Button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function Metric({ label, tone, value }: { label: string; tone?: "primary"; value: number }) {
  return (
    <span className={`rounded-xl p-2 ${tone === "primary" ? "bg-[#fff3eb] text-primary" : "bg-muted text-muted-foreground"}`}>
      <strong className="block text-lg font-black">{value}</strong>
      <small className="block truncate text-[0.68rem] font-extrabold">{label}</small>
    </span>
  );
}

function formatVocabularyDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
