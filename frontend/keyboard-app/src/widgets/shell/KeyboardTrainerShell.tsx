import { LogOut, Play, RotateCcw, Save, StepForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { changeAppLanguage, supportedLanguages, type SupportedLanguage } from "../../shared/i18n";
import type { ThemeMode } from "../../shared/theme";
import { ThemeToggle } from "../../shared/theme/ThemeToggle";
import type { ChordSet, LayoutId, Me, Progress } from "../../shared/types";
import { FINGER_ORDER } from "../../shared/types";
import { fetchChordSets, fetchProgress, submitResult } from "../../shared/api/keyboardApi";
import { VirtualKeyboard, type KeyboardLabels } from "../../features/keyboard/VirtualKeyboard";
import { Metronome } from "../../features/metronome/Metronome";
import { StatsPanel } from "../../features/stats/StatsPanel";
import { decideNext, type AdaptiveDecision } from "../../features/typing/adaptive";
import { computeCadence, computeScore } from "../../features/typing/scoring";
import { useTypingEngine } from "../../features/typing/useTypingEngine";
import { useTypingStore } from "../../features/typing/typingStore";

interface Props {
  me: Me;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onLogout: () => void;
}

const layouts: LayoutId[] = ["EN", "RU"];

export function KeyboardTrainerShell({ me, themeMode, onThemeChange, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const [layoutId, setLayoutId] = useState<LayoutId>("EN");
  const [sets, setSets] = useState<ChordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nextDecision, setNextDecision] = useState<AdaptiveDecision | null>(null);
  const submittedResultRef = useRef<string | null>(null);

  const loadSet = useTypingStore((state) => state.loadSet);
  const reset = useTypingStore((state) => state.reset);
  const result = useTypingStore((state) => state.result);
  const chordSet = useTypingStore((state) => state.chordSet);
  const stream = useTypingStore((state) => state.stream);
  const statuses = useTypingStore((state) => state.statuses);
  const pos = useTypingStore((state) => state.pos);
  const startedAt = useTypingStore((state) => state.startedAt);
  const finishedAt = useTypingStore((state) => state.finishedAt);
  const correctCount = useTypingStore((state) => state.correctCount);
  const errorCount = useTypingStore((state) => state.errorCount);
  const intervals = useTypingStore((state) => state.intervals);
  const perChar = useTypingStore((state) => state.perChar);

  useTypingEngine(Boolean(chordSet));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setNextDecision(null);
    submittedResultRef.current = null;

    Promise.all([fetchChordSets(layoutId), fetchProgress()])
      .then(([loadedSets, loadedProgress]) => {
        if (cancelled) {
          return;
        }
        setSets(loadedSets);
        setProgress(loadedProgress);
        if (loadedSets.length > 0) {
          loadSet(layoutId, loadedSets[0]);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [layoutId, loadSet]);

  const sessionResult = result();
  const resultKey = sessionResult ? `${sessionResult.chordSetId}:${sessionResult.durationMs}:${sessionResult.errors}` : null;

  useEffect(() => {
    if (!sessionResult || !resultKey || submittedResultRef.current === resultKey) {
      return;
    }

    submittedResultRef.current = resultKey;
    setSaving(true);
    setSaved(false);
    const currentSet = chordSet;

    const save = async () => {
      if (sessionResult.chordSetId > 0) {
        await submitResult({
          chordSetId: sessionResult.chordSetId,
          speedCpm: sessionResult.speedCpm,
          accuracy: sessionResult.accuracy,
          errors: sessionResult.errors,
          durationMs: sessionResult.durationMs,
          perFinger: sessionResult.perFinger,
        });
      }
      const loadedProgress = await fetchProgress();
      setProgress(loadedProgress);
      setSaved(true);
      if (currentSet) {
        const problemChars = Object.entries(perChar)
          .sort((left, right) => right[1] - left[1])
          .slice(0, 3)
          .map(([char]) => char);
        setNextDecision(
          decideNext({
            layoutId,
            accuracy: sessionResult.accuracy,
            perChar,
            currentSet,
            sets,
            remedialTitle: t("trainer.remedialTitle", { chars: problemChars.join(" ") }),
          }),
        );
      }
    };

    void save()
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSaving(false));
  }, [chordSet, layoutId, perChar, resultKey, sessionResult, sets, t]);

  const liveStats = useMemo(() => {
    const elapsedMs = startedAt == null ? 0 : Math.max(1, (finishedAt ?? Date.now()) - startedAt);
    const total = correctCount + errorCount;
    const speedCpm = elapsedMs > 0 ? correctCount / (elapsedMs / 60_000) : 0;
    return {
      speedCpm,
      accuracy: total === 0 ? 1 : correctCount / total,
      cadence: computeCadence(intervals),
      errors: errorCount,
      progress: stream.length === 0 ? 0 : pos / stream.length,
    };
  }, [correctCount, errorCount, finishedAt, intervals, pos, startedAt, stream.length]);

  const score = sessionResult
    ? computeScore(sessionResult.speedCpm, sessionResult.accuracy, sessionResult.cadence)
    : null;
  const nextChar = stream[pos]?.char ?? null;

  const keyboardLabels: KeyboardLabels = {
    backspace: t("keyboard.backspace"),
    tab: t("keyboard.tab"),
    caps: t("keyboard.caps"),
    enter: t("keyboard.enter"),
    shift: t("keyboard.shift"),
    control: t("keyboard.control"),
    alt: t("keyboard.alt"),
    space: t("keyboard.space"),
  };

  const changeLanguage = (language: SupportedLanguage) => {
    void changeAppLanguage(language);
  };

  const selectSet = (setId: string) => {
    const nextSet = sets.find((set) => set.id === Number(setId));
    if (nextSet) {
      setNextDecision(null);
      submittedResultRef.current = null;
      loadSet(layoutId, nextSet);
    }
  };

  const acceptNext = () => {
    if (!nextDecision) {
      return;
    }
    setNextDecision(null);
    submittedResultRef.current = null;
    loadSet(layoutId, nextDecision.set);
  };

  return (
    <main className="keyboard-app">
      <header className="app-header">
        <div className="brand-lockup" aria-label={t("app.title")}>
          <span>{t("app.wordmark")}</span>
          <strong>{t("app.product")}</strong>
        </div>
        <div className="topbar-actions">
          <label className="language-select">
            <span>{t("language.label")}</span>
            <select value={i18n.resolvedLanguage} onChange={(event) => changeLanguage(event.target.value as SupportedLanguage)}>
              {supportedLanguages.map((language) => (
                <option key={language} value={language}>
                  {t(`language.${language}`)}
                </option>
              ))}
            </select>
          </label>
          <ThemeToggle
            mode={themeMode}
            labels={{
              system: t("theme.system"),
              light: t("theme.light"),
              dark: t("theme.dark"),
            }}
            onChange={onThemeChange}
          />
          <button type="button" className="icon-text-button" onClick={onLogout} title={t("auth.logout")}>
            <LogOut size={18} aria-hidden="true" />
            <span>{t("auth.logout")}</span>
          </button>
        </div>
      </header>

      <section className="trainer-layout">
        <aside className="side-panel">
          <div className="account-strip">
            <span>{t("auth.signedInAs")}</span>
            <strong>{me.email ?? me.username}</strong>
          </div>

          <label className="field">
            <span>{t("trainer.layout")}</span>
            <select value={layoutId} onChange={(event) => setLayoutId(event.target.value as LayoutId)}>
              {layouts.map((layout) => (
                <option key={layout} value={layout}>
                  {layout}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{t("trainer.set")}</span>
            <select value={chordSet && chordSet.id > 0 ? String(chordSet.id) : ""} onChange={(event) => selectSet(event.target.value)} disabled={sets.length === 0}>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.title}
                </option>
              ))}
            </select>
          </label>

          <div className="progress-summary">
            <Metric label={t("trainer.sessions")} value={String(progress?.sessions ?? 0)} />
            <Metric label={t("trainer.best")} value={`${Math.round(progress?.bestSpeedCpm ?? 0)} ${t("units.cpm")}`} />
            <Metric label={t("trainer.avgSpeed")} value={`${Math.round(progress?.avgSpeedCpm ?? 0)} ${t("units.cpm")}`} />
            <Metric label={t("trainer.avgAccuracy")} value={`${Math.round((progress?.avgAccuracy ?? 0) * 100)}${t("units.percent")}`} />
          </div>

          <section className="weak-fingers">
            <h2>{t("trainer.weakFingers")}</h2>
            {progress && progress.weakFingers.length > 0 ? (
              <ul>
                {progress.weakFingers.map((finger) => (
                  <li key={finger.finger}>
                    <span>{t(`finger.${finger.finger as (typeof FINGER_ORDER)[number]}`)}</span>
                    <strong>{finger.errors}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("trainer.noWeakFingers")}</p>
            )}
          </section>
        </aside>

        <section className="trainer-surface" aria-busy={loading || saving}>
          <div className="trainer-toolbar">
            <div>
              <span>{t("trainer.current")}</span>
              <h1>{chordSet?.title ?? (loading ? t("auth.loading") : t("trainer.noSet"))}</h1>
            </div>
            <div className="trainer-toolbar__actions">
              {chordSet ? (
                <span className="level-pill">{t("trainer.difficulty", { level: chordSet.difficulty })}</span>
              ) : null}
              <button type="button" className="secondary-button" onClick={reset} disabled={!chordSet}>
                <RotateCcw size={18} aria-hidden="true" />
                <span>{t("trainer.restart")}</span>
              </button>
              <button type="button" className="primary-button" onClick={reset} disabled={!chordSet}>
                <Play size={18} aria-hidden="true" />
                <span>{t("trainer.start")}</span>
              </button>
            </div>
          </div>

          {loadError ? <div className="alert">{`${t("trainer.loadError")}: ${loadError}`}</div> : null}

          <StatsPanel
            labels={{
              speed: t("stats.speed"),
              accuracy: t("stats.accuracy"),
              cadence: t("stats.cadence"),
              errors: t("stats.errors"),
              progress: t("stats.progress"),
            }}
            units={{
              cpm: t("units.cpm"),
              percent: t("units.percent"),
            }}
            speedCpm={liveStats.speedCpm}
            accuracy={liveStats.accuracy}
            cadence={liveStats.cadence}
            errors={liveStats.errors}
            progress={liveStats.progress}
          />

          <div className="typing-strip" aria-live="polite">
            {stream.map((item, index) => (
              <span
                key={`${item.chordIndex}-${index}`}
                className={`typing-char typing-char--${statuses[index]} ${index === pos ? "is-current" : ""} ${item.isChordStart ? "is-chord-start" : ""} ${item.isSpace ? "is-space" : ""}`}
              >
                {item.isSpace ? "\u00a0" : item.char}
              </span>
            ))}
          </div>

          <VirtualKeyboard labels={keyboardLabels} layoutId={layoutId} nextChar={nextChar} />

          <div className="trainer-footer">
            <Metronome label={t("metronome.label")} tempoLabel={t("metronome.tempo")} bpmUnit={t("units.bpm")} />
            <div className="result-box">
              {saving ? (
                <>
                  <Save size={18} aria-hidden="true" />
                  <span>{t("trainer.saving")}</span>
                </>
              ) : saved && score ? (
                <>
                  <strong>{`${t("trainer.score")}: ${score.total} ${score.grade}`}</strong>
                  <span>{t("trainer.saved")}</span>
                </>
              ) : null}
              {nextDecision ? (
                <button type="button" className="secondary-button" onClick={acceptNext}>
                  <StepForward size={18} aria-hidden="true" />
                  <span>
                    {nextDecision.kind === "up"
                      ? t("trainer.nextUp")
                      : nextDecision.kind === "down"
                        ? t("trainer.nextDown")
                        : t("trainer.nextRepeat")}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
