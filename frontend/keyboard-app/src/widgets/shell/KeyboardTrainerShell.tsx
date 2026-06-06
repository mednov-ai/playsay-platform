import { LogIn, LogOut, Pencil, Play, RotateCcw, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getLocalChordSets, materializeChordSet } from "../../entities/chordSets";
import { VirtualKeyboard, type KeyboardLabels } from "../../features/keyboard/VirtualKeyboard";
import {
  dismissRegistrationPrompt,
  getOrCreateAnonymousDeviceId,
  readGuestDisplayName,
  readDismissedPromptCount,
  readGuestSessionCount,
  recordGuestSession,
  shouldShowNamePrompt,
  shouldShowRegistrationPrompt,
  writeGuestDisplayName,
} from "../../features/guest/guestProgress";
import { Metronome } from "../../features/metronome/Metronome";
import { suggestMetronomeBpm } from "../../features/metronome/metronomeTempo";
import { StatsPanel } from "../../features/stats/StatsPanel";
import { shouldReloadActiveSetForLayout } from "../../features/typing/activeSetSync";
import { decideNext, type AdaptiveDecision } from "../../features/typing/adaptive";
import { chooseResultAdvice } from "../../features/typing/resultAdvice";
import { computeCadence, computeScore } from "../../features/typing/scoring";
import { initialSessionFlow, sessionFlowReducer } from "../../features/typing/sessionFlow";
import {
  buildCanvasFont,
  buildMeasuredTypingWindow,
  buildTypingWindow,
  buildTypingWidthMetrics,
  computeTypingLineCapacity,
  type TypingWidthMetrics,
  typingWindowLineLength,
  typingWindowRows,
} from "../../features/typing/typingWindow";
import { useTypingEngine } from "../../features/typing/useTypingEngine";
import { computeActiveDurationMs, useTypingStore, type StreamItem } from "../../features/typing/typingStore";
import { fetchProgress, resolveAnonymousProfile, submitAnonymousResult, submitResult, updateAnonymousProfile } from "../../shared/api/keyboardApi";
import { changeAppLanguage, supportedLanguages, type SupportedLanguage } from "../../shared/i18n";
import type { ThemeMode } from "../../shared/theme";
import { ThemeToggle } from "../../shared/theme/ThemeToggle";
import type { ChordSet, FocusLesson, LayoutId, Me, Progress, TrainingLessonKind } from "../../shared/types";
import { FINGER_ORDER } from "../../shared/types";
import { registrationUrlForKeyboard } from "./registrationLink";

interface Props {
  me: Me | null;
  authError?: string;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onLogout: () => void;
  onSignIn: () => void;
}

const layouts: LayoutId[] = ["EN", "RU"];

type ClosingOverlay = {
  id: number;
  kind: "countdown" | "paused" | "finished";
  countdownValue?: number | null;
};

const emptyProgress: Progress = {
  sessions: 0,
  bestSpeedCpm: 0,
  avgSpeedCpm: 0,
  avgAccuracy: 0,
  weakFingers: [],
  recent: [],
};

function focusLessonToChordSet(focusLesson: FocusLesson): ChordSet {
  return {
    id: -1,
    layout: focusLesson.layout,
    title: focusLesson.title,
    difficulty: 0,
    tier: "beginner",
    chords: focusLesson.chords,
  };
}

function lessonKindForSet(chordSet: ChordSet | null): TrainingLessonKind {
  return chordSet?.id === -1 ? "FOCUS" : "STANDARD";
}

function shouldIgnoreShortcutTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  return ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
}

let typingMeasureCanvas: HTMLCanvasElement | null = null;

function sameTypingMetrics(left: TypingWidthMetrics, right: TypingWidthMetrics): boolean {
  if (
    left.maxLineWidth !== right.maxLineWidth ||
    left.defaultCharacterWidth !== right.defaultCharacterWidth ||
    left.spaceWidth !== right.spaceWidth
  ) {
    return false;
  }

  const leftWidths = left.characterWidths ?? {};
  const rightWidths = right.characterWidths ?? {};
  const leftKeys = Object.keys(leftWidths);
  const rightKeys = Object.keys(rightWidths);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => leftWidths[key] === rightWidths[key]);
}

function measureTypingStripMetrics(element: HTMLElement, stream: StreamItem[]): { capacity: number; metrics: TypingWidthMetrics } {
  const styles = window.getComputedStyle(element);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  const usableWidth = Math.max(1, element.clientWidth - paddingLeft - paddingRight - 4);
  typingMeasureCanvas ??= document.createElement("canvas");
  const context = typingMeasureCanvas.getContext("2d");
  const fontSize = Number.parseFloat(styles.fontSize) || 16;
  const characters = stream.map((item) => item.char);

  if (!context) {
    const fallbackCharacterWidth = fontSize * 0.82;
    const metrics = buildTypingWidthMetrics({
      maxLineWidth: usableWidth,
      fontSize,
      characters,
      measureText: (text) => Array.from(text).reduce((sum) => sum + fallbackCharacterWidth, 0),
    });
    return {
      capacity: computeTypingLineCapacity({ usableWidth, characterWidth: metrics.defaultCharacterWidth }),
      metrics,
    };
  }

  context.font = buildCanvasFont({
    font: styles.font,
    fontStyle: styles.fontStyle,
    fontVariant: styles.fontVariant,
    fontWeight: styles.fontWeight,
    fontSize: styles.fontSize,
    lineHeight: styles.lineHeight,
    fontFamily: styles.fontFamily,
  });
  const metrics = buildTypingWidthMetrics({
    maxLineWidth: usableWidth,
    fontSize,
    characters,
    measureText: (text) => context.measureText(text).width,
  });

  return {
    capacity: computeTypingLineCapacity({ usableWidth, characterWidth: metrics.defaultCharacterWidth }),
    metrics,
  };
}

export function KeyboardTrainerShell({ me, authError, themeMode, onThemeChange, onLogout, onSignIn }: Props) {
  const { t, i18n } = useTranslation();
  const isAuthenticated = me != null;
  const [layoutId, setLayoutId] = useState<LayoutId>("EN");
  const [sets, setSets] = useState<ChordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(authError ?? null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [anonymousDeviceId] = useState(() => getOrCreateAnonymousDeviceId());
  const [guestSessionCount, setGuestSessionCount] = useState(() => readGuestSessionCount());
  const [guestDisplayName, setGuestDisplayName] = useState<string | null>(() => readGuestDisplayName());
  const [showRegistrationPrompt, setShowRegistrationPrompt] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [guestNameDraft, setGuestNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [guestRecorded, setGuestRecorded] = useState(false);
  const [nextDecision, setNextDecision] = useState<AdaptiveDecision | null>(null);
  const [sessionFlow, dispatchSessionFlow] = useReducer(sessionFlowReducer, undefined, initialSessionFlow);
  const [typingLineCapacity, setTypingLineCapacity] = useState(typingWindowLineLength);
  const [typingMetrics, setTypingMetrics] = useState<TypingWidthMetrics | null>(null);
  const [restartVariant, setRestartVariant] = useState(0);
  const [closingOverlay, setClosingOverlay] = useState<ClosingOverlay | null>(null);
  const visibleCapacity = typingLineCapacity * typingWindowRows;
  const submittedResultRef = useRef<string | null>(null);
  const typingStripRef = useRef<HTMLDivElement | null>(null);
  const visibleCapacityRef = useRef(visibleCapacity);
  const overlayCloseTimerRef = useRef<number | null>(null);
  const overlayCloseIdRef = useRef(0);
  const profileSeed = me?.subject ?? anonymousDeviceId;
  const keyboardRegistrationUrl = registrationUrlForKeyboard(`${window.location.origin}/`);

  const loadSet = useTypingStore((state) => state.loadSet);
  const reset = useTypingStore((state) => state.reset);
  const pauseTiming = useTypingStore((state) => state.pauseTiming);
  const resumeTiming = useTypingStore((state) => state.resumeTiming);
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
  const excludedDurationMs = useTypingStore((state) => state.excludedDurationMs);
  const pausedAt = useTypingStore((state) => state.pausedAt);
  const perChar = useTypingStore((state) => state.perChar);

  useTypingEngine(Boolean(chordSet) && sessionFlow.acceptsTyping);

  useEffect(() => {
    visibleCapacityRef.current = visibleCapacity;
  }, [visibleCapacity]);

  useEffect(
    () => () => {
      if (overlayCloseTimerRef.current != null) {
        window.clearTimeout(overlayCloseTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (isAuthenticated) {
      return undefined;
    }

    let cancelled = false;
    void resolveAnonymousProfile({ deviceId: anonymousDeviceId })
      .then((profile) => {
        if (cancelled) {
          return;
        }
        setGuestSessionCount((current) => Math.max(current, profile.sessions));
        if (profile.displayName) {
          writeGuestDisplayName(profile.displayName);
          setGuestDisplayName(profile.displayName);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [anonymousDeviceId, isAuthenticated]);

  useEffect(() => {
    const element = typingStripRef.current;
    if (!element) {
      return undefined;
    }

    let active = true;
    const updateCapacity = () => {
      if (!active) {
        return;
      }
      const measured = measureTypingStripMetrics(element, stream);
      setTypingLineCapacity((current) => (current === measured.capacity ? current : measured.capacity));
      setTypingMetrics((current) =>
        current && sameTypingMetrics(current, measured.metrics)
          ? current
          : measured.metrics,
      );
    };

    updateCapacity();

    const ResizeObserverCtor = (window as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (ResizeObserverCtor) {
      const observer = new ResizeObserverCtor(updateCapacity);
      observer.observe(element);
      const fontSet = document.fonts;
      void fontSet?.ready.then(updateCapacity).catch(() => undefined);
      return () => {
        active = false;
        observer.disconnect();
      };
    }

    window.addEventListener("resize", updateCapacity);
    const fontSet = document.fonts;
    void fontSet?.ready.then(updateCapacity).catch(() => undefined);
    return () => {
      active = false;
      window.removeEventListener("resize", updateCapacity);
    };
  }, [stream, themeMode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setNextDecision(null);
    setSaved(false);
    setGuestRecorded(false);
    setRestartVariant(0);
    submittedResultRef.current = null;
    dispatchSessionFlow({ type: "reset" });

    const loadedSets = getLocalChordSets(layoutId);
    setSets(loadedSets);
    if (loadedSets.length > 0) {
      loadSet(
        layoutId,
        materializeChordSet(loadedSets[0], profileSeed, isAuthenticated ? 1 : readGuestSessionCount() + 1),
        visibleCapacityRef.current,
      );
    }

    if (!isAuthenticated) {
      setProgress(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    fetchProgress()
      .then((loadedProgress) => {
        if (!cancelled) {
          setProgress(loadedProgress);
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
  }, [isAuthenticated, layoutId, loadSet, profileSeed]);

  useEffect(() => {
    if (!shouldReloadActiveSetForLayout({ layoutId, chordSet, phase: sessionFlow.phase })) {
      return;
    }

    if (!chordSet) {
      return;
    }

    loadSet(layoutId, chordSet, visibleCapacity);
  }, [chordSet, layoutId, loadSet, sessionFlow.phase, visibleCapacity]);

  useEffect(() => {
    if (authError) {
      setLoadError(authError);
    }
  }, [authError]);

  useEffect(() => {
    if (sessionFlow.phase !== "countdown") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => dispatchSessionFlow({ type: "countdownTick" }), 1_000);
    return () => window.clearTimeout(timeoutId);
  }, [sessionFlow.countdownValue, sessionFlow.phase]);

  const sessionResult = result();
  const resultKey = sessionResult ? `${sessionResult.chordSetId}:${sessionResult.durationMs}:${sessionResult.errors}` : null;

  useEffect(() => {
    if (sessionResult && sessionFlow.phase === "running") {
      dispatchSessionFlow({ type: "finish" });
    }
  }, [sessionFlow.phase, sessionResult]);

  useEffect(() => {
    if (!sessionResult || !resultKey || submittedResultRef.current === resultKey) {
      return;
    }

    submittedResultRef.current = resultKey;
    setSaved(false);
    setGuestRecorded(false);
    const currentSet = chordSet;

    const updateNextDecision = (focusLesson?: FocusLesson) => {
      if (!currentSet) {
        return;
      }
      if (focusLesson) {
        setNextDecision({ kind: "down", set: focusLessonToChordSet(focusLesson) });
        return;
      }
      const problemChars = Object.entries(perChar)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([char]) => char);
      setNextDecision(
        decideNext({
          layoutId,
          accuracy: sessionResult.accuracy,
          speedCpm: sessionResult.speedCpm,
          cadence: sessionResult.cadence,
          perChar,
          currentSet,
          sets,
          remedialTitle: t("trainer.remedialTitle", { chars: problemChars.join(" ") }),
          remedialSeed: `${profileSeed}:${sessionResult.chordSetId}:${sessionResult.durationMs}`,
        }),
      );
    };

    if (!isAuthenticated) {
      const nextCount = recordGuestSession();
      const dismissedCount = readDismissedPromptCount();
      setGuestSessionCount(nextCount);
      setGuestRecorded(true);
      updateNextDecision();
      void submitAnonymousResult({
        deviceId: anonymousDeviceId,
        displayName: guestDisplayName ?? undefined,
        chordSetId: sessionResult.chordSetId,
        lessonKind: lessonKindForSet(currentSet),
        speedCpm: sessionResult.speedCpm,
        accuracy: sessionResult.accuracy,
        errors: sessionResult.errors,
        durationMs: sessionResult.durationMs,
        perFinger: sessionResult.perFinger,
        perChar: sessionResult.perChar,
        perChord: sessionResult.perChord,
      })
        .then((savedResult) => updateNextDecision(savedResult.focusLesson))
        .catch(() => undefined);
      if (shouldShowNamePrompt(nextCount, guestDisplayName)) {
        setGuestNameDraft(guestDisplayName ?? "");
        setShowNamePrompt(true);
      }
      if (shouldShowRegistrationPrompt(nextCount, dismissedCount)) {
        setShowRegistrationPrompt(true);
      }
      return;
    }

    setSaving(true);

    const save = async () => {
      if (sessionResult.chordSetId > 0) {
        const savedResult = await submitResult({
          chordSetId: sessionResult.chordSetId,
          lessonKind: lessonKindForSet(currentSet),
          speedCpm: sessionResult.speedCpm,
          accuracy: sessionResult.accuracy,
          errors: sessionResult.errors,
          durationMs: sessionResult.durationMs,
          perFinger: sessionResult.perFinger,
          perChar: sessionResult.perChar,
          perChord: sessionResult.perChord,
        });
        updateNextDecision(savedResult.focusLesson);
      }
      const loadedProgress = await fetchProgress();
      setProgress(loadedProgress);
      setSaved(true);
      if (sessionResult.chordSetId <= 0) {
        updateNextDecision();
      }
    };

    void save()
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSaving(false));
  }, [anonymousDeviceId, chordSet, guestDisplayName, isAuthenticated, layoutId, perChar, profileSeed, resultKey, sessionResult, sets, t]);

  const liveStats = useMemo(() => {
    const elapsedMs =
      startedAt == null
        ? 0
        : computeActiveDurationMs({
            startedAt,
            endedAt: finishedAt ?? Date.now(),
            excludedDurationMs,
            pausedAt,
          });
    const total = correctCount + errorCount;
    const speedCpm = elapsedMs > 0 ? correctCount / (elapsedMs / 60_000) : 0;
    return {
      speedCpm,
      accuracy: total === 0 ? 1 : correctCount / total,
      cadence: computeCadence(intervals),
      errors: errorCount,
      progress: stream.length === 0 ? 0 : pos / stream.length,
    };
  }, [correctCount, errorCount, excludedDurationMs, finishedAt, intervals, pausedAt, pos, startedAt, stream.length]);

  const typingWindow = useMemo(
    () =>
      typingMetrics
        ? buildMeasuredTypingWindow(stream, statuses, pos, typingMetrics, typingWindowRows)
        : buildTypingWindow(stream, statuses, pos, typingLineCapacity, typingWindowRows),
    [pos, statuses, stream, typingLineCapacity, typingMetrics],
  );

  const score = sessionResult
    ? computeScore(sessionResult.speedCpm, sessionResult.accuracy, sessionResult.cadence)
    : null;
  const resultAdvice = sessionResult
    ? chooseResultAdvice({
        accuracy: sessionResult.accuracy,
        speedCpm: sessionResult.speedCpm,
        cadence: sessionResult.cadence,
        errors: sessionResult.errors,
        perChar: sessionResult.perChar,
        perChord: sessionResult.perChord,
        nextKind: nextDecision?.kind,
      })
    : null;
  const resultAdviceText = resultAdvice ? t(`resultAdvice.${resultAdvice.kind}`, { value: resultAdvice.value }) : null;
  const suggestedMetronomeBpm = sessionResult ? suggestMetronomeBpm(intervals, sessionResult.cadence) : null;
  const nextChar = sessionFlow.acceptsTyping ? stream[pos]?.char ?? null : null;
  const effectiveProgress = progress ?? { ...emptyProgress, sessions: guestSessionCount };
  const isSessionLocked =
    sessionFlow.phase === "countdown" ||
    sessionFlow.phase === "running" ||
    sessionFlow.phase === "paused" ||
    sessionFlow.finishOverlayVisible;
  const canStartSession = Boolean((chordSet ?? sets[0]) && (sessionFlow.phase === "idle" || sessionFlow.phase === "finished"));
  const canResumeSession = sessionFlow.phase === "paused";

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

  const clearSessionResult = useCallback(() => {
    setSaved(false);
    setGuestRecorded(false);
    submittedResultRef.current = null;
  }, []);

  const materializePracticeSet = useCallback(
    (set: ChordSet, variant = restartVariant): ChordSet =>
      set.id < 0 ? set : materializeChordSet(set, profileSeed, (progress?.sessions ?? guestSessionCount) + 1, variant),
    [guestSessionCount, profileSeed, progress?.sessions, restartVariant],
  );

  const showClosingOverlay = useCallback((kind: ClosingOverlay["kind"], countdownValue?: number | null) => {
    if (overlayCloseTimerRef.current != null) {
      window.clearTimeout(overlayCloseTimerRef.current);
    }
    overlayCloseIdRef.current += 1;
    const id = overlayCloseIdRef.current;
    setClosingOverlay({ id, kind, countdownValue });
    overlayCloseTimerRef.current = window.setTimeout(() => {
      setClosingOverlay((current) => (current?.id === id ? null : current));
    }, 180);
  }, []);

  const selectSet = (setId: string) => {
    const nextSet = sets.find((set) => set.id === Number(setId));
    if (nextSet) {
      setNextDecision(null);
      clearSessionResult();
      setRestartVariant(0);
      dispatchSessionFlow({ type: "reset" });
      loadSet(layoutId, materializePracticeSet(nextSet, 0), visibleCapacity);
    }
  };

  const startSession = useCallback(() => {
    const activeSet = chordSet ?? sets[0];
    if (!activeSet || !canStartSession) {
      return;
    }

    setLoadError(null);
    clearSessionResult();

    if (sessionFlow.phase === "finished") {
      setRestartVariant(0);
      loadSet(layoutId, materializePracticeSet(nextDecision?.set ?? activeSet, 0), visibleCapacity);
      setNextDecision(null);
    } else if (!chordSet) {
      loadSet(layoutId, materializePracticeSet(activeSet), visibleCapacity);
    } else {
      reset();
    }

    dispatchSessionFlow({ type: "start" });
  }, [canStartSession, chordSet, clearSessionResult, layoutId, loadSet, materializePracticeSet, nextDecision, reset, sessionFlow.phase, sets, visibleCapacity]);

  const restartSession = useCallback(() => {
    if (!chordSet) {
      return;
    }
    setNextDecision(null);
    clearSessionResult();
    const baseSet = chordSet.id > 0 ? sets.find((set) => set.id === chordSet.id) ?? chordSet : chordSet;
    setRestartVariant((current) => {
      const nextVariant = current + 1;
      loadSet(layoutId, materializePracticeSet(baseSet, nextVariant), visibleCapacity);
      return nextVariant;
    });
    dispatchSessionFlow({ type: "reset" });
  }, [chordSet, clearSessionResult, layoutId, loadSet, materializePracticeSet, sets, visibleCapacity]);

  const cancelCountdown = useCallback(() => {
    showClosingOverlay("countdown", sessionFlow.countdownValue);
    dispatchSessionFlow({ type: "cancel" });
  }, [sessionFlow.countdownValue, showClosingOverlay]);

  const skipCountdown = useCallback(() => {
    if (overlayCloseTimerRef.current != null) {
      window.clearTimeout(overlayCloseTimerRef.current);
      overlayCloseTimerRef.current = null;
    }
    setClosingOverlay(null);
    dispatchSessionFlow({ type: "skipCountdown" });
  }, []);

  const dismissFinishOverlay = useCallback(() => {
    showClosingOverlay("finished");
    dispatchSessionFlow({ type: "dismissFinishOverlay" });
  }, [showClosingOverlay]);

  const resumeSession = useCallback(() => {
    resumeTiming();
    showClosingOverlay("paused");
    dispatchSessionFlow({ type: "resume" });
  }, [resumeTiming, showClosingOverlay]);

  const dismissPrompt = useCallback(() => {
    dismissRegistrationPrompt(guestSessionCount);
    setShowRegistrationPrompt(false);
  }, [guestSessionCount]);

  const dismissNamePrompt = useCallback(() => {
    setShowNamePrompt(false);
  }, []);

  const openGuestNamePrompt = useCallback(() => {
    setGuestNameDraft(guestDisplayName ?? "");
    setShowNamePrompt(true);
  }, [guestDisplayName]);

  const saveGuestName = useCallback(() => {
    const displayName = writeGuestDisplayName(guestNameDraft);
    if (!displayName) {
      return;
    }
    setGuestDisplayName(displayName);
    setShowNamePrompt(false);
    void updateAnonymousProfile({ deviceId: anonymousDeviceId, displayName })
      .then((profile) => {
        if (profile.displayName) {
          setGuestDisplayName(profile.displayName);
          writeGuestDisplayName(profile.displayName);
        }
        setGuestSessionCount((current) => Math.max(current, profile.sessions));
      })
      .catch(() => undefined);
  }, [anonymousDeviceId, guestNameDraft]);

  useEffect(() => {
    if (sessionFlow.phase !== "running" || sessionResult) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      pauseTiming();
      dispatchSessionFlow({ type: "pause" });
    }, 3_000);
    return () => window.clearTimeout(timeoutId);
  }, [correctCount, errorCount, pauseTiming, pos, sessionFlow.phase, sessionResult]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || shouldIgnoreShortcutTarget(event.target)) {
        return;
      }

      if (event.code === "Escape") {
        if (showNamePrompt) {
          event.preventDefault();
          dismissNamePrompt();
          return;
        }
        if (showRegistrationPrompt) {
          event.preventDefault();
          dismissPrompt();
          return;
        }
        if (sessionFlow.phase === "paused") {
          event.preventDefault();
          restartSession();
          return;
        }
        if (sessionFlow.phase === "finished" && sessionFlow.finishOverlayVisible) {
          event.preventDefault();
          dismissFinishOverlay();
          return;
        }
        if (sessionFlow.phase === "countdown") {
          event.preventDefault();
          cancelCountdown();
        }
        return;
      }

      if (event.code === "Space" && canResumeSession && !showRegistrationPrompt && !showNamePrompt) {
        event.preventDefault();
        resumeSession();
        return;
      }

      if (event.code === "Space" && sessionFlow.phase === "countdown" && !showRegistrationPrompt && !showNamePrompt) {
        event.preventDefault();
        skipCountdown();
        return;
      }

      if (event.code === "Space" && canStartSession && !showRegistrationPrompt && !showNamePrompt) {
        event.preventDefault();
        startSession();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canResumeSession,
    canStartSession,
    cancelCountdown,
    dismissFinishOverlay,
    dismissNamePrompt,
    dismissPrompt,
    restartSession,
    resumeSession,
    sessionFlow.finishOverlayVisible,
    sessionFlow.phase,
    showNamePrompt,
    showRegistrationPrompt,
    skipCountdown,
    startSession,
  ]);

  const startLabel = sessionFlow.phase === "finished" ? t("trainer.next") : t("trainer.start");
  const accountLabel = isAuthenticated ? t("auth.signedInAs") : t("auth.guestAccount");
  const accountValue = isAuthenticated ? me.email ?? me.username : guestDisplayName ?? t("auth.guestProgress");
  const countdownOverlayValue =
    sessionFlow.phase === "countdown" ? sessionFlow.countdownValue : closingOverlay?.kind === "countdown" ? closingOverlay.countdownValue : null;
  const renderCountdownOverlay = sessionFlow.phase === "countdown" || closingOverlay?.kind === "countdown";
  const renderPausedOverlay = sessionFlow.phase === "paused" || closingOverlay?.kind === "paused";
  const renderFinishedOverlay =
    (sessionFlow.phase === "finished" && sessionFlow.finishOverlayVisible) || closingOverlay?.kind === "finished";

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
          {isAuthenticated ? (
            <button type="button" className="icon-text-button" onClick={onLogout} title={t("auth.logout")}>
              <LogOut size={18} aria-hidden="true" />
              <span>{t("auth.logout")}</span>
            </button>
          ) : (
            <button type="button" className="icon-text-button" onClick={onSignIn} title={t("auth.signInToSave")}>
              <LogIn size={18} aria-hidden="true" />
              <span>{t("auth.signIn")}</span>
            </button>
          )}
        </div>
      </header>

      <section className="trainer-layout">
        <aside className="side-panel">
          <div className="account-strip">
            <span>{accountLabel}</span>
            <div className="account-strip__value">
              <strong>{accountValue}</strong>
              {!isAuthenticated ? (
                <button
                  type="button"
                  className="account-strip__edit"
                  onClick={openGuestNamePrompt}
                  aria-label={t("trainer.editGuestName")}
                  title={t("trainer.editGuestName")}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <label className="field">
            <span>{t("trainer.layout")}</span>
            <select value={layoutId} onChange={(event) => setLayoutId(event.target.value as LayoutId)} disabled={isSessionLocked}>
              {layouts.map((layout) => (
                <option key={layout} value={layout}>
                  {layout}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--set">
            <span>{t("trainer.set")}</span>
            <select
              value={chordSet && chordSet.id > 0 ? String(chordSet.id) : ""}
              onChange={(event) => selectSet(event.target.value)}
              disabled={sets.length === 0 || isSessionLocked}
            >
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.title}
                </option>
              ))}
            </select>
          </label>

          <div className="progress-summary">
            <Metric label={t("trainer.sessions")} value={String(effectiveProgress.sessions)} />
            <Metric label={t("trainer.best")} value={`${Math.round(effectiveProgress.bestSpeedCpm)} ${t("units.cpm")}`} />
            <Metric label={t("trainer.avgSpeed")} value={`${Math.round(effectiveProgress.avgSpeedCpm)} ${t("units.cpm")}`} />
            <Metric label={t("trainer.avgAccuracy")} value={`${Math.round(effectiveProgress.avgAccuracy * 100)}${t("units.percent")}`} />
          </div>

          <details className="weak-fingers">
            <summary>{t("trainer.weakFingers")}</summary>
            {effectiveProgress.weakFingers.length > 0 ? (
              <ul>
                {effectiveProgress.weakFingers.map((finger) => (
                  <li key={finger.finger}>
                    <span>{t(`finger.${finger.finger as (typeof FINGER_ORDER)[number]}`)}</span>
                    <strong>{finger.errors}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{isAuthenticated ? t("trainer.noWeakFingers") : t("trainer.signInForProgress")}</p>
            )}
          </details>
        </aside>

        <section className="trainer-surface" aria-busy={loading || saving}>
          <div className="trainer-toolbar">
            <div>
              <span>{t("trainer.current")}</span>
              <h1>{chordSet?.title ?? (loading ? t("auth.loading") : t("trainer.noSet"))}</h1>
            </div>
            <div className="trainer-toolbar__actions">
              <button
                type="button"
                className="session-play-button"
                onClick={startSession}
                disabled={!canStartSession}
                aria-label={t("trainer.playAria")}
                title={t("trainer.playAria")}
              >
                <Play size={24} fill="currentColor" aria-hidden="true" />
                <span>{startLabel}</span>
              </button>
              {chordSet ? (
                <span className="level-pill">{t(`level.${chordSet.tier}`)}</span>
              ) : null}
              <button type="button" className="secondary-button" onClick={restartSession} disabled={!chordSet || sessionFlow.phase === "running"}>
                <RotateCcw size={18} aria-hidden="true" />
                <span>{t("trainer.restart")}</span>
              </button>
              {sessionFlow.phase === "countdown" ? (
                <button type="button" className="secondary-button" onClick={cancelCountdown}>
                  <X size={18} aria-hidden="true" />
                  <span>{t("trainer.cancel")}</span>
                </button>
              ) : null}
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

          <div className="typing-stage">
            <div ref={typingStripRef} className="typing-strip" aria-live="polite" aria-label={t("trainer.typingLineAria")}>
              {typingWindow.rows.map((row, rowIndex) => (
                <div className="typing-strip__line" key={`${typingWindow.start}-${rowIndex}`}>
                  {row.map(({ item, index, status }) => (
                    <span
                      key={index}
                      className={`typing-char typing-char--${status} ${index === pos ? "is-current" : ""} ${item.isChordStart ? "is-chord-start" : ""} ${item.isSpace ? "is-space" : ""}`}
                    >
                      {item.isSpace ? "\u00a0" : item.char}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <VirtualKeyboard labels={keyboardLabels} layoutId={layoutId} nextChar={nextChar} />

          <div className="trainer-footer">
            <Metronome
              label={t("metronome.label")}
              tempoLabel={t("metronome.tempo")}
              bpmUnit={t("units.bpm")}
              suggestedBpm={suggestedMetronomeBpm}
            />
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
              ) : guestRecorded && score ? (
                <>
                  <strong>{`${t("trainer.score")}: ${score.total} ${score.grade}`}</strong>
                  <span>{t("trainer.guestSaved")}</span>
                </>
              ) : sessionFlow.phase === "finished" ? (
                <span>{t("trainer.resultReady")}</span>
              ) : (
                <span>{t("trainer.startShortcut")}</span>
              )}
              {nextDecision ? (
                <span className="next-decision">
                  {nextDecision.kind === "up"
                    ? t("trainer.nextUp")
                    : nextDecision.kind === "down"
                      ? t("trainer.nextDown")
                      : t("trainer.nextRepeat")}
                </span>
              ) : null}
            </div>
          </div>

          {renderPausedOverlay ? (
            <div className={`practice-overlay practice-overlay--paused ${closingOverlay?.kind === "paused" ? "is-exiting" : ""}`} role="presentation">
              <div className="practice-overlay__content">
                <strong>{t("trainer.paused")}</strong>
                <button
                  type="button"
                  className="play-button"
                  onClick={resumeSession}
                  disabled={!canResumeSession}
                  aria-label={t("trainer.resumeAria")}
                  title={t("trainer.resumeAria")}
                >
                  <Play size={58} fill="currentColor" aria-hidden="true" />
                  <span>{t("trainer.resume")}</span>
                </button>
                <span>{t("trainer.resumeShortcut")}</span>
              </div>
            </div>
          ) : null}

          {renderCountdownOverlay ? (
            <div className={`practice-overlay practice-overlay--countdown ${closingOverlay?.kind === "countdown" ? "is-exiting" : ""}`} role="presentation">
              <div className="practice-overlay__content countdown-arena" aria-live="assertive" aria-label={t("trainer.countdown")}>
                <span className="countdown-kicker">{t("trainer.countdownReady")}</span>
                <span className="countdown-number" key={countdownOverlayValue}>
                  {countdownOverlayValue}
                </span>
                <span className="countdown-fight">{t("trainer.countdownFight")}</span>
                <span className="countdown-hint">{t("trainer.countdownShortcut")}</span>
                <button type="button" className="secondary-button" onClick={cancelCountdown}>
                  <X size={18} aria-hidden="true" />
                  <span>{t("trainer.cancel")}</span>
                </button>
              </div>
            </div>
          ) : null}

          {renderFinishedOverlay ? (
            <div className={`practice-overlay practice-overlay--finished ${closingOverlay?.kind === "finished" ? "is-exiting" : ""}`} role="presentation">
              <div className="practice-overlay__content result-card">
                <span className="result-card__eyebrow">{t("trainer.resultReady")}</span>
                {score && sessionResult ? (
                  <>
                    <strong className="result-card__score">{`${score.total} ${score.grade}`}</strong>
                    <div className="result-card__stats" aria-label={t("trainer.resultStats")}>
                      <span>
                        <small>{t("stats.speed")}</small>
                        <b>{`${Math.round(sessionResult.speedCpm)} ${t("units.cpm")}`}</b>
                      </span>
                      <span>
                        <small>{t("stats.accuracy")}</small>
                        <b>{`${Math.round(sessionResult.accuracy * 100)}${t("units.percent")}`}</b>
                      </span>
                      <span>
                        <small>{t("stats.errors")}</small>
                        <b>{sessionResult.errors}</b>
                      </span>
                    </div>
                  </>
                ) : null}
                {resultAdviceText ? (
                  <div className="result-card__advice">
                    <span>{t("trainer.resultAdviceTitle")}</span>
                    <p>{resultAdviceText}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="play-button"
                  onClick={startSession}
                  disabled={!canStartSession}
                  aria-label={t("trainer.playAria")}
                  title={t("trainer.playAria")}
                >
                  <Play size={58} fill="currentColor" aria-hidden="true" />
                  <span>{startLabel}</span>
                </button>
                <span>{t("trainer.startShortcut")}</span>
              </div>
            </div>
          ) : null}
        </section>
      </section>

      {showNamePrompt ? (
        <div className="modal-backdrop" role="presentation">
          <section className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="guest-name-prompt-title">
            <button type="button" className="icon-button registration-modal__close" onClick={dismissNamePrompt} aria-label={t("trainer.continueGuest")}>
              <X size={18} aria-hidden="true" />
            </button>
            <h2 id="guest-name-prompt-title">{t("trainer.guestNameTitle")}</h2>
            <p>{t("trainer.guestNameBody")}</p>
            <label className="field guest-name-field">
              <span>{t("trainer.guestNameLabel")}</span>
              <input
                value={guestNameDraft}
                maxLength={64}
                autoFocus
                placeholder={t("trainer.guestNamePlaceholder")}
                onChange={(event) => setGuestNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveGuestName();
                  }
                }}
              />
            </label>
            <div className="registration-modal__actions">
              <button type="button" className="primary-button" onClick={saveGuestName}>
                <Save size={18} aria-hidden="true" />
                <span>{t("trainer.guestNameSave")}</span>
              </button>
              <button type="button" className="secondary-button" onClick={dismissNamePrompt}>
                <span>{t("trainer.continueGuest")}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showRegistrationPrompt && !showNamePrompt ? (
        <div className="modal-backdrop" role="presentation">
          <section className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-prompt-title">
            <button type="button" className="icon-button registration-modal__close" onClick={dismissPrompt} aria-label={t("trainer.continueGuest")}>
              <X size={18} aria-hidden="true" />
            </button>
            <h2 id="registration-prompt-title">{t("trainer.registrationTitle")}</h2>
            <p>{t("trainer.registrationBody")}</p>
            <div className="registration-modal__actions">
              <button type="button" className="primary-button" onClick={() => window.location.assign(keyboardRegistrationUrl)}>
                <LogIn size={18} aria-hidden="true" />
                <span>{t("auth.register")}</span>
              </button>
              <button type="button" className="secondary-button" onClick={dismissPrompt}>
                <span>{t("trainer.continueGuest")}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
