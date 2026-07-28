import { Archive, ArrowLeft, BookOpen, CalendarClock, Loader2, Pause, Pencil, Play, Search, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type VocabularyTab = "TODAY" | "WORDS" | "HISTORY";
type EntryFilter = "ALL" | VocabularyLearningStage | "PAUSED" | "MISSING";

export function VocabularyPanel({ profile }: { profile: MeProfile | null }) {
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  return canManage ? <TeacherVocabularyPanel /> : <StudentVocabularyPanel />;
}

function TeacherVocabularyPanel() {
  const { t } = useAppTranslation();
  const [learners, setLearners] = useState<VocabularyLearnerSummary[]>([]);
  const [selected, setSelected] = useState<VocabularyLearnerSummary | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLearners = useCallback(async (search = query) => {
    setLoading(true);
    setError(null);
    try {
      setLearners(await fetchVocabularyLearners(search));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("vocabulary.messages.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  useEffect(() => { void loadLearners(""); }, []);

  if (selected) {
    return (
      <VocabularyOwnerWorkspace
        learner={selected}
        onBack={() => {
          setSelected(null);
          void loadLearners();
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
      <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); void loadLearners(); }}>
        <label className="sr-only" htmlFor="vocabulary-learner-search">{t("vocabulary.teacher.search")}</label>
        <input className="playsay-input min-w-0 flex-1" id="vocabulary-learner-search" onChange={(event) => setQuery(event.target.value)} placeholder={t("vocabulary.teacher.search")} value={query} />
        <Button aria-label={t("vocabulary.actions.search")} type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
      </form>
      {loading ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" /> : error ? (
        <p className="mt-6 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 font-semibold text-destructive">{error}</p>
      ) : learners.length === 0 ? (
        <p className="mt-8 text-center font-semibold text-muted-foreground">{t("vocabulary.teacher.empty")}</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {learners.map((learner) => (
            <button className="rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:shadow-sm" key={learner.ownerSubject} onClick={() => setSelected(learner)} type="button">
              <span className="flex items-center gap-2 text-lg font-black"><UserRound className="h-5 w-5 text-primary" />{learner.ownerName}</span>
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
  const [dashboard, setDashboard] = useState<VocabularyDashboard | null>(null);
  const [history, setHistory] = useState<VocabularyPracticeSession[]>([]);
  const [tab, setTab] = useState<"WORDS" | "HISTORY">("WORDS");
  const [filter, setFilter] = useState<EntryFilter>("ALL");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextDashboard, nextHistory] = await Promise.all([
        fetchVocabularyDashboard(learner.ownerSubject, query),
        fetchVocabularyPracticeHistory(learner.ownerSubject),
      ]);
      setDashboard(nextDashboard);
      setHistory(nextHistory);
    } finally {
      setLoading(false);
    }
  }, [learner.ownerSubject, query]);

  useEffect(() => { void load(); }, [learner.ownerSubject]);

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
            <p className="text-sm font-semibold text-muted-foreground">{t("vocabulary.teacher.studentVocabulary")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <VocabularyQuickAdd source={{ sourceType: "MANUAL", ownerSubject: learner.ownerSubject }}><span /></VocabularyQuickAdd>
          {vocabularyFeatures.homework ? (
            <Button onClick={() => setDrawerOpen(true)} type="button"><Play className="h-4 w-4" />{t("vocabulary.practice.create")}</Button>
          ) : null}
        </div>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Metric value={dashboard?.dueCount ?? learner.dueCount} label={t("vocabulary.stats.due")} tone="primary" />
        <Metric value={dashboard?.learningCount ?? learner.learningCount} label={t("vocabulary.stats.learning")} />
        <Metric value={dashboard?.masteredCount ?? learner.masteredCount} label={t("vocabulary.stats.mastered")} />
      </div>

      <div className="mt-5 flex gap-2 border-b border-border pb-3">
        {(["WORDS", "HISTORY"] as const).map((value) => (
          <Button key={value} onClick={() => setTab(value)} type="button" variant={tab === value ? "default" : "outline"}>
            {value === "HISTORY" ? t("vocabulary.teacher.practiceTab") : t("vocabulary.tabs.WORDS")}
          </Button>
        ))}
      </div>

      {tab === "WORDS" ? (
        <>
          <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <input className="playsay-input min-w-0 flex-1" onChange={(event) => setQuery(event.target.value)} placeholder={t("vocabulary.search")} value={query} />
            <Button aria-label={t("vocabulary.actions.search")} type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 pb-1">
            {(["ALL", "NEW", "LEARNING", "REVIEW", "MASTERED", "PAUSED", "MISSING"] as EntryFilter[]).map((value) => (
              <Button className="shrink-0" key={value} onClick={() => setFilter(value)} type="button" variant={filter === value ? "default" : "outline"}>{t(`vocabulary.filters.${value}`)}</Button>
            ))}
          </div>
          {loading ? <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" /> : (
            <VocabularyWordGrid dashboard={dashboard} entries={entries} onChanged={() => void load()} />
          )}
        </>
      ) : (
        <VocabularyHistory sessions={history} />
      )}

      {vocabularyFeatures.homework ? (
        <VocabularyPracticeDrawer
          onClose={() => setDrawerOpen(false)}
          onCreated={() => void load()}
          open={drawerOpen}
          ownerName={learner.ownerName}
          ownerSubject={learner.ownerSubject}
        />
      ) : null}
    </section>
  );
}

function StudentVocabularyPanel() {
  const { t } = useAppTranslation();
  const [dashboard, setDashboard] = useState<VocabularyDashboard | null>(null);
  const [history, setHistory] = useState<VocabularyPracticeSession[]>([]);
  const [tab, setTab] = useState<VocabularyTab>(vocabularyFeatures.practice ? "TODAY" : "WORDS");
  const [session, setSession] = useState<VocabularyPracticeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextDashboard, nextHistory] = await Promise.all([
        fetchVocabularyDashboard(),
        fetchVocabularyPracticeHistory(),
      ]);
      setDashboard(nextDashboard);
      setHistory(nextHistory);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, []);

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
        <Button className="mb-3" onClick={() => { setSession(null); void load(); }} type="button" variant="outline"><ArrowLeft className="h-4 w-4" />{t("vocabulary.practice.actions.back")}</Button>
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
      {loading ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" /> : tab === "TODAY" ? (
        <div className="mx-auto mt-6 max-w-2xl rounded-3xl border border-primary/20 bg-[#fff7f0] p-6 text-center">
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
        <VocabularyWordGrid dashboard={dashboard} entries={dashboard?.entries ?? []} onChanged={() => void load()} />
      ) : (
        <VocabularyHistory sessions={history} />
      )}
    </section>
  );
}

function VocabularyWordGrid({
  dashboard,
  entries,
  onChanged,
}: {
  dashboard: VocabularyDashboard | null;
  entries: VocabularyDashboard["entries"];
  onChanged: () => void;
}) {
  const { t } = useAppTranslation();
  const [editingEntry, setEditingEntry] = useState<VocabularyEntry | null>(null);
  if (!dashboard || entries.length === 0) return <p className="mt-8 text-center font-semibold text-muted-foreground">{t("vocabulary.empty")}</p>;
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {entries.map(({ entry, stage, overdue }) => (
        <article className="rounded-2xl border border-border bg-background p-4" key={entry.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-extrabold">{entry.sourceText}</h2>
              <p className="font-semibold text-primary">{entry.translation || t("vocabulary.translationMissing")}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[0.68rem] font-black ${overdue ? "bg-[#fff0e7] text-primary" : "bg-muted text-muted-foreground"}`}>{t(`vocabulary.stage.${stage}`)}</span>
          </div>
          {entry.example ? <p className="mt-3 text-sm text-muted-foreground">{entry.example}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
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
            <Button aria-label={t("vocabulary.actions.archive")} onClick={async () => { await archiveVocabularyEntry(entry.id); onChanged(); }} type="button" variant="outline"><Archive className="h-4 w-4" /></Button>
          </div>
        </article>
        ))}
      </div>
      <VocabularyEntryEditDialog entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={onChanged} />
    </>
  );
}

function VocabularyHistory({ sessions }: { sessions: VocabularyPracticeSession[] }) {
  const { t } = useAppTranslation();
  if (sessions.length === 0) return <p className="mt-8 text-center font-semibold text-muted-foreground">{t("vocabulary.history.empty")}</p>;
  return (
    <div className="mt-5 grid gap-2">
      {sessions.map((session) => (
        <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4" key={session.id}>
          <div>
            <strong>{t(`vocabulary.sessionStatus.${session.status}`)}</strong>
            <p className="text-sm font-semibold text-muted-foreground">{formatVocabularyDate(session.updatedAt)}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-black">
            {session.completedItems}/{session.totalItems} · {session.accuracy === null || session.accuracy === undefined ? "—" : `${Math.round(session.accuracy * 100)}%`}
          </span>
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
