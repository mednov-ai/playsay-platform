import { publicSiteUrl } from "@playsay/shared-ui";
import { LogIn, LogOut, Pencil, Play, RotateCcw, Save, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildCombinedCodeChordSet,
  codeDifficultyBands,
  codeLanguageOptions,
  getLocalChordSets,
  materializeChordSet,
  type CodeDifficultyBand,
  type CodeLanguageId,
} from "../../entities/chordSets";
import { AchievementCelebrationQueue, type AchievementCelebrationLabels } from "../../features/gamification/AchievementCelebrationQueue";
import { GamificationProfilePanel, type GamificationProfileLabels } from "../../features/gamification/GamificationProfilePanel";
import { VirtualKeyboard, type KeyboardLabels } from "../../features/keyboard/VirtualKeyboard";
import {
  clearGuestProgress,
  dismissRegistrationPrompt,
  getOrCreateAnonymousDeviceId,
  readGuestLayoutMastery,
  readGuestDisplayName,
  readDismissedPromptCount,
  readGuestSessionCount,
  recordGuestSession,
  shouldShowNamePrompt,
  shouldShowRegistrationPrompt,
  writeGuestDisplayName,
  writeGuestLayoutMastery,
} from "../../features/guest/guestProgress";
import { Metronome } from "../../features/metronome/Metronome";
import { suggestMetronomeBpm } from "../../features/metronome/metronomeTempo";
import { masteryLevelForCpm, StatsPanel, type MasteryLevelId } from "../../features/stats/StatsPanel";
import { shouldReloadActiveSetForLayout } from "../../features/typing/activeSetSync";
import { candidateSetsForCurrentPractice, decideNext, type AdaptiveDecision } from "../../features/typing/adaptive";
import { computeCadence, estimateSessionMastery, masteryDeltaLabel } from "../../features/typing/mastery";
import {
  clearPracticeState,
  markPracticeIntroDismissed,
  persistActivePracticeSet,
  persistPendingNextDecision,
  practiceOwnerKey,
  readPracticeState,
  resolvePersistedPracticeSet,
  updatePracticeState,
} from "../../features/typing/practiceState";
import { initialSessionFlow, sessionFlowReducer } from "../../features/typing/sessionFlow";
import { chooseTechniqueAdvice } from "../../features/typing/techniqueAdvice";
import {
  initialTrainerIntroPhase,
  isTrainerIntroBlocking,
  trainerIntroReducer,
} from "../../features/typing/trainerIntro";
import { formatChordSetTitle, selectResultWeakness, trainingSetHintKind, type ChordSetTitleLabels } from "../../features/typing/trainerCopy";
import { buildTrainingSubmitPayload } from "../../features/typing/trainingPayload";
import {
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
import { claimAnonymousProgress, fetchProgress, fetchVocabularyPractice, resetAnonymousProfile, resolveAnonymousProfile, submitAnonymousResult, submitResult, updateAnonymousProfile } from "../../shared/api/keyboardApi";
import { changeAppLanguage, supportedLanguages, type SupportedLanguage } from "../../shared/i18n";
import type { ThemeMode } from "../../shared/theme";
import { ThemeToggle } from "../../shared/theme/ThemeToggle";
import type { ChordSet, FocusLesson, GamificationEvent, GamificationProfile, LayoutId, Me, Progress, TrainingResult } from "../../shared/types";
import { FINGER_ORDER } from "../../shared/types";
import { escapeActionForTrainerState } from "./keyboardShortcuts";
import { shouldBlockDeferredPrompts, shouldShowDeferredPrompt } from "./promptFlow";
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
export const liveMasteryBootstrapChordThreshold = 3;

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

export function layoutMasteryCpm(progress: Progress | null, guestLayoutMastery: ReturnType<typeof readGuestLayoutMastery>, layoutId: LayoutId): number | undefined {
  return progress?.gamification?.layoutMastery?.[layoutId]?.masteryCpm ?? guestLayoutMastery[layoutId]?.masteryCpm;
}

export function activeLayoutGamification(gamification: GamificationProfile | undefined, layoutId: LayoutId): GamificationProfile | undefined {
  const layoutMastery = gamification?.layoutMastery?.[layoutId];
  if (!gamification) {
    return gamification;
  }

  if (!layoutMastery) {
    const emptyLayoutMastery = {
      layout: layoutId,
      calibrated: false,
      calibrationSessions: 0,
      calibrationTarget: gamification.calibrationTarget,
      masteryCpm: 0,
      baselineMasteryCpm: undefined,
      leagueLevel: undefined,
      leagueProgress: 0,
      trend: [],
    };

    return {
      ...gamification,
      calibrated: false,
      calibrationSessions: 0,
      masteryCpm: 0,
      baselineMasteryCpm: undefined,
      leagueLevel: undefined,
      leagueProgress: 0,
      trend: [],
      activeLayoutMastery: emptyLayoutMastery,
    };
  }

  return {
    ...gamification,
    calibrated: layoutMastery.calibrated,
    calibrationSessions: layoutMastery.calibrationSessions,
    calibrationTarget: layoutMastery.calibrationTarget,
    masteryCpm: layoutMastery.masteryCpm,
    baselineMasteryCpm: layoutMastery.baselineMasteryCpm,
    leagueLevel: layoutMastery.leagueLevel,
    leagueProgress: layoutMastery.leagueProgress,
    trend: layoutMastery.trend,
    activeLayoutMastery: layoutMastery,
  };
}

export function countCompletedChords(stream: StreamItem[], position: number): number {
  const clampedPosition = Math.max(0, Math.min(position, stream.length));
  const completed = new Set<number>();
  const active = new Map<number, { seen: boolean; pending: boolean }>();

  stream.forEach((item, index) => {
    if (item.isSpace) {
      return;
    }

    const state = active.get(item.chordIndex) ?? { seen: false, pending: false };
    if (index < clampedPosition) {
      state.seen = true;
    } else {
      state.pending = true;
    }
    active.set(item.chordIndex, state);
  });

  active.forEach((state, chordIndex) => {
    if (state.seen && !state.pending) {
      completed.add(chordIndex);
    }
  });

  return completed.size;
}

interface DisplayedMasteryInput {
  effectiveMasteryCpm?: number | null;
  savedLayoutMasteryCpm?: number | null;
  liveSpeedCpm: number;
  liveAccuracy: number;
  liveCadence: number;
  completedChordCount: number;
}

export function displayedMasteryCpm({
  effectiveMasteryCpm,
  savedLayoutMasteryCpm,
  liveSpeedCpm,
  liveAccuracy,
  liveCadence,
  completedChordCount,
}: DisplayedMasteryInput): number | null {
  if (effectiveMasteryCpm != null && Number.isFinite(effectiveMasteryCpm)) {
    return Math.max(0, effectiveMasteryCpm);
  }

  if (savedLayoutMasteryCpm != null && Number.isFinite(savedLayoutMasteryCpm) && savedLayoutMasteryCpm > 0) {
    return savedLayoutMasteryCpm;
  }

  if (completedChordCount < liveMasteryBootstrapChordThreshold) {
    return null;
  }

  return estimateSessionMastery({
    previousMasteryCpm: null,
    averageCpm: liveSpeedCpm,
    accuracy: liveAccuracy,
    cadence: liveCadence,
  }).masteryCpm;
}

function focusLessonToChordSet(focusLesson: FocusLesson): ChordSet {
  return {
    id: -1,
    sourceChordSetId: focusLesson.sourceChordSetId,
    focusProblemKeys: focusLesson.problemKeys,
    layout: focusLesson.layout,
    title: focusLesson.title,
    difficulty: 0,
    tier: "beginner",
    chords: focusLesson.chords,
  };
}

function shouldIgnoreShortcutTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  return ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
}

let typingMeasureElement: HTMLSpanElement | null = null;

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
  const usableWidth = Math.max(1, element.clientWidth - paddingLeft - paddingRight - 2);
  const fontSize = Number.parseFloat(styles.fontSize) || 16;
  const characters = stream.map((item) => item.char);

  const metrics = buildTypingWidthMetrics({
    maxLineWidth: usableWidth,
    fontSize,
    characters,
    measureText: (text) => measureTypingTextWithElement(styles, text),
  });

  return {
    capacity: computeTypingLineCapacity({ usableWidth, characterWidth: metrics.defaultCharacterWidth }),
    metrics,
  };
}

function measureTypingTextWithElement(styles: CSSStyleDeclaration, text: string): number {
  if (!document.body) {
    const fontSize = Number.parseFloat(styles.fontSize) || 16;
    return Array.from(text).reduce((sum) => sum + fontSize * 0.82, 0);
  }

  typingMeasureElement ??= document.createElement("span");
  if (!typingMeasureElement.isConnected) {
    document.body.appendChild(typingMeasureElement);
  }

  Object.assign(typingMeasureElement.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    whiteSpace: "pre",
    contain: "layout style paint",
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    fontStretch: styles.fontStretch,
    fontStyle: styles.fontStyle,
    fontVariantLigatures: "none",
    fontVariationSettings: styles.fontVariationSettings,
    fontWeight: styles.fontWeight,
    letterSpacing: styles.letterSpacing,
    lineHeight: styles.lineHeight,
    wordSpacing: styles.wordSpacing,
  });
  typingMeasureElement.textContent = text;

  return typingMeasureElement.getBoundingClientRect().width;
}

export function KeyboardTrainerShell({ me, authError, themeMode, onThemeChange, onLogout, onSignIn }: Props) {
  const { t, i18n } = useTranslation();
  const isAuthenticated = me != null;
  const [anonymousDeviceId, setAnonymousDeviceId] = useState(() => getOrCreateAnonymousDeviceId());
  const ownerKey = practiceOwnerKey({ subject: me?.subject, anonymousDeviceId });
  const [layoutId, setLayoutId] = useState<LayoutId>(() => readPracticeState(ownerKey)?.layoutId ?? "EN");
  const [advancedPracticeEnabled, setAdvancedPracticeEnabled] = useState(false);
  const [showAdvancedSettingsModal, setShowAdvancedSettingsModal] = useState(false);
  const [numberRowEnabled, setNumberRowEnabled] = useState(false);
  const [selectedCodeLanguages, setSelectedCodeLanguages] = useState<CodeLanguageId[]>(["python"]);
  const [codeDifficultyBand, setCodeDifficultyBand] = useState<CodeDifficultyBand>("trigrams");
  const [shiftActive, setShiftActive] = useState(false);
  const [sets, setSets] = useState<ChordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(authError ?? null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressImportMessage, setProgressImportMessage] = useState<string | null>(null);
  const [guestSessionCount, setGuestSessionCount] = useState(() => readGuestSessionCount());
  const [guestDisplayName, setGuestDisplayName] = useState<string | null>(() => readGuestDisplayName());
  const [guestLayoutMastery, setGuestLayoutMastery] = useState(() => readGuestLayoutMastery());
  const [showRegistrationPrompt, setShowRegistrationPrompt] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingRegistrationPrompt, setPendingRegistrationPrompt] = useState(false);
  const [pendingNamePrompt, setPendingNamePrompt] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [guestNameDraft, setGuestNameDraft] = useState("");
  const [guestResetConfirm, setGuestResetConfirm] = useState(false);
  const [guestResetting, setGuestResetting] = useState(false);
  const [guestResetError, setGuestResetError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [guestRecorded, setGuestRecorded] = useState(false);
  const [savedTrainingResult, setSavedTrainingResult] = useState<TrainingResult | null>(null);
  const [savedTechniqueAdvice, setSavedTechniqueAdvice] = useState<string | null>(null);
  const [latestGamificationEvents, setLatestGamificationEvents] = useState<GamificationEvent[]>([]);
  const [dismissedGamificationEventIds, setDismissedGamificationEventIds] = useState<number[]>([]);
  const [nextDecision, setNextDecision] = useState<AdaptiveDecision | null>(null);
  const [sessionFlow, dispatchSessionFlow] = useReducer(sessionFlowReducer, undefined, initialSessionFlow);
  const [trainerIntroPhase, dispatchTrainerIntro] = useReducer(trainerIntroReducer, undefined, () =>
    initialTrainerIntroPhase(readPracticeState(ownerKey)?.introDismissed ?? false),
  );
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
    const persisted = readPracticeState(ownerKey);
    if (persisted?.layoutId && persisted.layoutId !== layoutId && sessionFlow.phase === "idle") {
      setLayoutId(persisted.layoutId);
    }
  }, [layoutId, ownerKey, sessionFlow.phase]);

  const advancedMode = advancedPracticeEnabled && layoutId === "EN";
  const codePracticeSet = useMemo(
    () => buildCombinedCodeChordSet(selectedCodeLanguages, codeDifficultyBand, { includeNumberRow: numberRowEnabled }),
    [codeDifficultyBand, numberRowEnabled, selectedCodeLanguages],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setNextDecision(null);
    setSaved(false);
    setGuestRecorded(false);
    setSavedTrainingResult(null);
    setSavedTechniqueAdvice(null);
    setLatestGamificationEvents([]);
    setDismissedGamificationEventIds([]);
    setRestartVariant(0);
    submittedResultRef.current = null;
    dispatchSessionFlow({ type: "reset" });

    const loadedSets = getLocalChordSets(layoutId);
    const persistedPracticeState = readPracticeState(ownerKey);
    const persistedSet = resolvePersistedPracticeSet(persistedPracticeState, loadedSets);
    const restoredSet = advancedMode
      ? codePracticeSet
      : persistedSet?.practiceKind === "CODE" || persistedSet?.practiceKind === "CODE_COMBO"
        ? undefined
        : persistedSet;
    setSets(loadedSets);
    if (isAuthenticated && layoutId === "EN" && !advancedMode) {
      void fetchVocabularyPractice().then(({ entries }) => {
        if (cancelled || entries.length === 0) return;
        const vocabularySet: ChordSet = {
          id: -900,
          layout: "EN",
          title: t("trainer.vocabularySet"),
          difficulty: 1,
          tier: "beginner",
          chords: entries.map((entry) => entry.sourceText),
          practiceKind: "VOCABULARY",
          practiceContext: { practiceKind: "VOCABULARY", title: t("trainer.vocabularySet"), vocabularyEntryIds: entries.map((entry) => entry.id) },
        };
        setSets((current) => [...current.filter((item) => item.practiceKind !== "VOCABULARY"), vocabularySet]);
      }).catch(() => undefined);
    }
    if (restoredSet || loadedSets.length > 0) {
      const startSet = restoredSet ?? loadedSets[0];
      loadSet(
        startSet.layout,
        startSet.id > 0
          ? materializeChordSet(startSet, profileSeed, isAuthenticated ? 1 : readGuestSessionCount() + 1)
          : startSet,
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

    claimAnonymousProgress({ deviceId: anonymousDeviceId })
      .then((claim) => {
        if (!cancelled) {
          setProgress(claim.progress);
          setProgressImportMessage(
            claim.claimedResults > 0
              ? t("trainer.guestProgressImported", { count: claim.claimedResults })
              : null,
          );
        }
      })
      .catch(async (error: unknown) => {
        if (!cancelled) {
          try {
            setProgress(await fetchProgress());
          } catch {
            setLoadError(error instanceof Error ? error.message : String(error));
          }
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
  }, [advancedMode, anonymousDeviceId, codePracticeSet, isAuthenticated, layoutId, loadSet, ownerKey, profileSeed, t]);

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
  const resultKey = sessionResult ? `${sessionResult.layoutId}:${sessionResult.chordSetId}:${sessionResult.durationMs}:${sessionResult.errors}` : null;
  const savedLayoutMasteryCpm = layoutMasteryCpm(progress, isAuthenticated ? {} : guestLayoutMastery, layoutId);
  const sessionSavedLayoutMasteryCpm = sessionResult
    ? layoutMasteryCpm(progress, isAuthenticated ? {} : guestLayoutMastery, sessionResult.layoutId)
    : savedLayoutMasteryCpm;
  const sessionCalibrationComplete = sessionResult
    ? activeLayoutGamification(progress?.gamification, sessionResult.layoutId)?.calibrated ?? false
    : false;

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
    setLatestGamificationEvents([]);
    setDismissedGamificationEventIds([]);
    const currentSet = chordSet;
    const submitPayload = buildTrainingSubmitPayload(sessionResult, currentSet);

    const updateNextDecision = (focusLesson?: FocusLesson, calibrationComplete = sessionCalibrationComplete) => {
      if (!currentSet) {
        return;
      }
      if (focusLesson) {
        const decision = { kind: "down" as const, set: focusLessonToChordSet(focusLesson) };
        setNextDecision(decision);
        persistPendingNextDecision({
          ownerKey,
          layoutId: sessionResult.layoutId,
          activeSet: currentSet,
          pendingNext: decision,
        });
        return;
      }
      const problemChars = Object.entries(perChar)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([char]) => char);
      const decision = decideNext({
        layoutId: sessionResult.layoutId,
        accuracy: sessionResult.accuracy,
        speedCpm: sessionResult.speedCpm,
        cadence: sessionResult.cadence,
        perChar,
        currentSet,
        sets: candidateSetsForCurrentPractice(currentSet, sets),
        remedialTitle: t("trainer.remedialTitle", { chars: problemChars.join(" ") }),
        remedialSeed: `${profileSeed}:${sessionResult.chordSetId}:${sessionResult.durationMs}`,
        calibrationComplete,
      });
      setNextDecision(decision);
      persistPendingNextDecision({
        ownerKey,
        layoutId: sessionResult.layoutId,
        activeSet: currentSet,
        pendingNext: decision,
      });
    };

    if (!isAuthenticated) {
      const nextCount = recordGuestSession();
      const dismissedCount = readDismissedPromptCount();
      const localMastery = estimateSessionMastery({
        previousMasteryCpm: sessionSavedLayoutMasteryCpm,
        averageCpm: sessionResult.averageCpm,
        accuracy: sessionResult.accuracy,
        cadence: sessionResult.cadence,
      });
      setGuestSessionCount(nextCount);
      setGuestLayoutMastery(writeGuestLayoutMastery(sessionResult.layoutId, localMastery.masteryCpm));
      setGuestRecorded(true);
      updateNextDecision();
      if (!submitPayload) {
        return;
      }
      void submitAnonymousResult({
        ...submitPayload,
        deviceId: anonymousDeviceId,
        displayName: guestDisplayName ?? undefined,
      })
        .then((savedResult) => {
          setSavedTrainingResult(savedResult.trainingResult);
          setSavedTechniqueAdvice(savedResult.techniqueAdvice.primaryAdvice);
          setLatestGamificationEvents(savedResult.events);
          setProgress(savedResult.progress);
          updateNextDecision(
            savedResult.focusLesson,
            activeLayoutGamification(savedResult.progress.gamification, sessionResult.layoutId)?.calibrated ?? sessionCalibrationComplete,
          );
        })
        .catch(() => undefined);
      if (shouldShowNamePrompt(nextCount, guestDisplayName)) {
        setGuestNameDraft(guestDisplayName ?? "");
        setPendingNamePrompt(true);
      }
      if (shouldShowRegistrationPrompt(nextCount, dismissedCount)) {
        setPendingRegistrationPrompt(true);
      }
      return;
    }

    setSaving(true);

    const save = async () => {
      if (submitPayload) {
        const savedResult = await submitResult(submitPayload);
        setSavedTrainingResult(savedResult.trainingResult);
        setSavedTechniqueAdvice(savedResult.techniqueAdvice.primaryAdvice);
        setLatestGamificationEvents(savedResult.events);
        setProgress(savedResult.progress);
        updateNextDecision(
          savedResult.focusLesson,
          activeLayoutGamification(savedResult.progress.gamification, sessionResult.layoutId)?.calibrated ?? sessionCalibrationComplete,
        );
      } else {
        const loadedProgress = await fetchProgress();
        setProgress(loadedProgress);
        updateNextDecision(
          undefined,
          activeLayoutGamification(loadedProgress.gamification, sessionResult.layoutId)?.calibrated ?? sessionCalibrationComplete,
        );
      }
      setSaved(true);
    };

    void save()
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSaving(false));
  }, [anonymousDeviceId, chordSet, guestDisplayName, isAuthenticated, ownerKey, perChar, profileSeed, resultKey, sessionCalibrationComplete, sessionResult, sessionSavedLayoutMasteryCpm, sets, t]);

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
  const completedChordCount = useMemo(() => countCompletedChords(stream, pos), [pos, stream]);

  const typingWindow = useMemo(
    () =>
      typingMetrics
        ? buildMeasuredTypingWindow(stream, statuses, pos, typingMetrics, typingWindowRows)
        : buildTypingWindow(stream, statuses, pos, typingLineCapacity, typingWindowRows),
    [pos, statuses, stream, typingLineCapacity, typingMetrics],
  );

  const effectiveMastery = sessionResult
    ? savedTrainingResult?.layout === sessionResult.layoutId && savedTrainingResult.masteryCpm != null
      ? {
          masteryCpm: savedTrainingResult.masteryCpm,
          masteryDelta: savedTrainingResult.masteryDelta,
        }
      : estimateSessionMastery({
          previousMasteryCpm: sessionSavedLayoutMasteryCpm,
          averageCpm: sessionResult.averageCpm,
          accuracy: sessionResult.accuracy,
          cadence: sessionResult.cadence,
        })
    : null;
  const masterySummaryText = effectiveMastery
    ? `${Math.round(effectiveMastery.masteryCpm)} ${t("units.cpm")}`
    : null;
  const masteryDeltaText = effectiveMastery ? masteryDeltaLabel(effectiveMastery.masteryDelta) : null;
  const techniqueAdvice = sessionResult
    ? chooseTechniqueAdvice({
        accuracy: sessionResult.accuracy,
        averageCpm: sessionResult.averageCpm,
        cadence: sessionResult.cadence,
        errors: sessionResult.errors,
        perChar: sessionResult.perChar,
        perChord: sessionResult.perChord,
        recent: (progress?.recent ?? []).map((item) => ({
          accuracy: item.accuracy,
          masteryCpm: item.masteryCpm,
        })),
      })
    : null;
  const techniqueAdviceText = savedTechniqueAdvice ?? (techniqueAdvice ? t(`techniqueAdvice.${techniqueAdvice.kind}`, { value: techniqueAdvice.value }) : null);
  const resultWeakness = sessionResult
    ? selectResultWeakness({
        perChord: sessionResult.perChord,
        perChar: sessionResult.perChar,
      })
    : null;
  const suggestedMetronomeBpm = sessionResult ? suggestMetronomeBpm(intervals, sessionResult.cadence) : null;
  const nextItem = sessionFlow.acceptsTyping ? stream[pos] : undefined;
  const nextChar = nextItem?.char ?? null;
  const nextRequiresShift = nextItem?.requiresShift === true;
  const effectiveProgress = progress ?? { ...emptyProgress, sessions: guestSessionCount };
  const effectiveGamification = activeLayoutGamification(progress?.gamification, layoutId);
  const displayedSessionMasteryCpm = sessionResult?.layoutId === layoutId ? effectiveMastery?.masteryCpm : null;
  const displayedMastery = displayedMasteryCpm({
    effectiveMasteryCpm: displayedSessionMasteryCpm,
    savedLayoutMasteryCpm,
    liveSpeedCpm: liveStats.speedCpm,
    liveAccuracy: liveStats.accuracy,
    liveCadence: liveStats.cadence,
    completedChordCount,
  });
  const displayedMasteryLevelId: MasteryLevelId = masteryLevelForCpm(displayedMastery ?? 0);
  const displayedMasteryLevel = t(`masteryLevel.${displayedMasteryLevelId}`);
  const gamificationLabels: GamificationProfileLabels = {
    title: t("gamification.title"),
    calibration: t("gamification.calibration"),
    calibrationProgress: t("gamification.calibrationProgress"),
    calibrated: t("gamification.calibrated"),
    league: t("gamification.league"),
    leagueUnavailable: t("gamification.leagueUnavailable"),
    leagueProgress: t("gamification.leagueProgress"),
    streak: t("gamification.streak"),
    bestStreak: t("gamification.bestStreak"),
    freezes: t("gamification.freezes"),
    achievements: t("gamification.achievements"),
    noAchievements: t("gamification.noAchievements"),
    lockedAchievement: t("gamification.lockedAchievement"),
    achievement_FIRST_HUNDRED_title: t("gamification.achievement_FIRST_HUNDRED_title"),
    achievement_FIRST_HUNDRED_description: t("gamification.achievement_FIRST_HUNDRED_description"),
    achievement_SNIPER_title: t("gamification.achievement_SNIPER_title"),
    achievement_SNIPER_description: t("gamification.achievement_SNIPER_description"),
    achievement_METRONOME_title: t("gamification.achievement_METRONOME_title"),
    achievement_METRONOME_description: t("gamification.achievement_METRONOME_description"),
    achievement_STREAK_7_title: t("gamification.achievement_STREAK_7_title"),
    achievement_STREAK_7_description: t("gamification.achievement_STREAK_7_description"),
    achievement_STREAK_30_title: t("gamification.achievement_STREAK_30_title"),
    achievement_STREAK_30_description: t("gamification.achievement_STREAK_30_description"),
    achievement_UNKNOWN_title: t("gamification.achievement_UNKNOWN_title"),
    achievement_UNKNOWN_description: t("gamification.achievement_UNKNOWN_description"),
    leagueName_calibration: t("gamification.leagueName_calibration"),
    leagueDescription_calibration: t("gamification.leagueDescription_calibration"),
    leagueName_spark: t("gamification.leagueName_spark"),
    leagueDescription_spark: t("gamification.leagueDescription_spark"),
    leagueName_rhythm: t("gamification.leagueName_rhythm"),
    leagueDescription_rhythm: t("gamification.leagueDescription_rhythm"),
    leagueName_flow: t("gamification.leagueName_flow"),
    leagueDescription_flow: t("gamification.leagueDescription_flow"),
    leagueName_sprint: t("gamification.leagueName_sprint"),
    leagueDescription_sprint: t("gamification.leagueDescription_sprint"),
    leagueName_master: t("gamification.leagueName_master"),
    leagueDescription_master: t("gamification.leagueDescription_master"),
    profileTitle: t("gamification.profileTitle"),
    profileIntro: t("gamification.profileIntro"),
    currentMastery: t("gamification.currentMastery"),
  };
  const gamificationEventLabels: AchievementCelebrationLabels = {
    events: t("gamification.events"),
    masteryUp: t("gamification.masteryUp"),
    calibrationComplete: t("gamification.calibrationComplete"),
    leagueProgressEvent: t("gamification.leagueProgressEvent"),
    achievementUnlocked: t("gamification.achievementUnlocked"),
    prizeHook: t("gamification.prizeHook"),
    closeEvent: t("gamification.closeEvent"),
    lockedAchievement: t("gamification.lockedAchievement"),
    achievement_FIRST_HUNDRED_title: t("gamification.achievement_FIRST_HUNDRED_title"),
    achievement_FIRST_HUNDRED_description: t("gamification.achievement_FIRST_HUNDRED_description"),
    achievement_SNIPER_title: t("gamification.achievement_SNIPER_title"),
    achievement_SNIPER_description: t("gamification.achievement_SNIPER_description"),
    achievement_METRONOME_title: t("gamification.achievement_METRONOME_title"),
    achievement_METRONOME_description: t("gamification.achievement_METRONOME_description"),
    achievement_STREAK_7_title: t("gamification.achievement_STREAK_7_title"),
    achievement_STREAK_7_description: t("gamification.achievement_STREAK_7_description"),
    achievement_STREAK_30_title: t("gamification.achievement_STREAK_30_title"),
    achievement_STREAK_30_description: t("gamification.achievement_STREAK_30_description"),
    achievement_UNKNOWN_title: t("gamification.achievement_UNKNOWN_title"),
    achievement_UNKNOWN_description: t("gamification.achievement_UNKNOWN_description"),
    leagueName_calibration: t("gamification.leagueName_calibration"),
    leagueDescription_calibration: t("gamification.leagueDescription_calibration"),
    leagueName_spark: t("gamification.leagueName_spark"),
    leagueDescription_spark: t("gamification.leagueDescription_spark"),
    leagueName_rhythm: t("gamification.leagueName_rhythm"),
    leagueDescription_rhythm: t("gamification.leagueDescription_rhythm"),
    leagueName_flow: t("gamification.leagueName_flow"),
    leagueDescription_flow: t("gamification.leagueDescription_flow"),
    leagueName_sprint: t("gamification.leagueName_sprint"),
    leagueDescription_sprint: t("gamification.leagueDescription_sprint"),
    leagueName_master: t("gamification.leagueName_master"),
    leagueDescription_master: t("gamification.leagueDescription_master"),
  };
  const activeGamificationEvents = latestGamificationEvents.filter((event) => !dismissedGamificationEventIds.includes(event.id));
  const trainerIntroBlocking = isTrainerIntroBlocking(trainerIntroPhase);
  const practiceFocusMode = sessionFlow.phase === "countdown" || sessionFlow.phase === "running" || sessionFlow.phase === "paused";
  const isSessionLocked =
    trainerIntroBlocking ||
    sessionFlow.phase === "countdown" ||
    sessionFlow.phase === "running" ||
    sessionFlow.phase === "paused" ||
    sessionFlow.phase === "finished" ||
    sessionFlow.finishOverlayVisible;
  const advancedSettingsLocked = isSessionLocked;
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
  const chordSetTitleLabels: ChordSetTitleLabels = {
    letterPairs: t("trainerSetTitle.letterPairs"),
    letterTriples: t("trainerSetTitle.letterTriples"),
    letterQuadgrams: t("trainerSetTitle.letterQuadgrams"),
    longFirst: t("trainerSetTitle.longFirst"),
    longSecond: t("trainerSetTitle.longSecond"),
    homeRow: t("trainerSetTitle.homeRow"),
    codeTrigrams: t("trainer.codeDifficulty_trigrams"),
    codeQuadgrams: t("trainer.codeDifficulty_quadgrams"),
    codeLong: t("trainer.codeDifficulty_long"),
  };
  const formatTrainingSetTitle = useCallback(
    (set: ChordSet) => formatChordSetTitle(set, chordSetTitleLabels),
    [
      chordSetTitleLabels.codeLong,
      chordSetTitleLabels.codeQuadgrams,
      chordSetTitleLabels.codeTrigrams,
      chordSetTitleLabels.homeRow,
      chordSetTitleLabels.letterPairs,
      chordSetTitleLabels.letterQuadgrams,
      chordSetTitleLabels.letterTriples,
      chordSetTitleLabels.longFirst,
      chordSetTitleLabels.longSecond,
    ],
  );
  const activeSetTitle = chordSet ? formatTrainingSetTitle(chordSet) : loading ? t("auth.loading") : t("trainer.noSet");
  const activeSetHint = chordSet
    ? chordSet.practiceKind === "CODE" || chordSet.practiceKind === "CODE_COMBO"
      ? t("trainer.setHintCode")
      : t(trainingSetHintKind(chordSet) === "pairs" ? "trainer.setHintPairs" : "trainer.setHintCombinations")
    : null;

  const changeLanguage = (language: SupportedLanguage) => {
    void changeAppLanguage(language);
  };

  const changeTrainingLayout = (nextLayoutId: LayoutId) => {
    if (advancedSettingsLocked) {
      return;
    }
    setLayoutId(nextLayoutId);
    if (nextLayoutId !== "EN") {
      setAdvancedPracticeEnabled(false);
      setShowAdvancedSettingsModal(false);
    }
    updatePracticeState(ownerKey, (current) => ({
      ownerKey,
      layoutId: nextLayoutId,
      introDismissed: current?.introDismissed,
    }));
  };

  const openAdvancedSettings = () => {
    if (!advancedPracticeEnabled || advancedSettingsLocked) {
      return;
    }
    setShowAdvancedSettingsModal(true);
  };

  const changeAdvancedPracticeEnabled = (enabled: boolean) => {
    if (advancedSettingsLocked) {
      return;
    }
    setAdvancedPracticeEnabled(enabled);
    setShowAdvancedSettingsModal(enabled);
    if (enabled && layoutId !== "EN") {
      setLayoutId("EN");
      updatePracticeState(ownerKey, (current) => ({
        ownerKey,
        layoutId: "EN",
        introDismissed: current?.introDismissed,
      }));
    }
  };

  const toggleCodeLanguage = (languageId: CodeLanguageId) => {
    if (advancedSettingsLocked) {
      return;
    }
    setSelectedCodeLanguages((current) => {
      if (current.includes(languageId)) {
        return current.length === 1 ? current : current.filter((language) => language !== languageId);
      }
      return codeLanguageOptions
        .map((language) => language.id)
        .filter((language) => language === languageId || current.includes(language));
    });
  };

  const changeCodeDifficultyBand = (difficultyBand: CodeDifficultyBand) => {
    if (advancedSettingsLocked) {
      return;
    }
    setCodeDifficultyBand(difficultyBand);
  };

  const changeNumberRowEnabled = (enabled: boolean) => {
    if (advancedSettingsLocked) {
      return;
    }
    setNumberRowEnabled(enabled);
  };

  const clearSessionResult = useCallback(() => {
    setSaved(false);
    setGuestRecorded(false);
    setSavedTrainingResult(null);
    setSavedTechniqueAdvice(null);
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
    if (advancedSettingsLocked) {
      return;
    }
    const nextSet = sets.find((set) => set.id === Number(setId));
    if (nextSet) {
      setNextDecision(null);
      clearSessionResult();
      setRestartVariant(0);
      dispatchSessionFlow({ type: "reset" });
      persistActivePracticeSet({
        ownerKey,
        layoutId,
        set: nextSet,
        introDismissed: trainerIntroPhase === "dismissed",
      });
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
    setShowNamePrompt(false);
    setShowRegistrationPrompt(false);
    setShowAdvancedSettingsModal(false);

    if (sessionFlow.phase === "finished") {
      setRestartVariant(0);
      const nextSet = nextDecision?.set ?? activeSet;
      persistActivePracticeSet({
        ownerKey,
        layoutId: nextSet.layout,
        set: nextSet,
        introDismissed: true,
      });
      loadSet(layoutId, materializePracticeSet(nextSet, 0), visibleCapacity);
      setNextDecision(null);
    } else if (!chordSet) {
      persistActivePracticeSet({
        ownerKey,
        layoutId: activeSet.layout,
        set: activeSet,
        introDismissed: true,
      });
      loadSet(layoutId, materializePracticeSet(activeSet), visibleCapacity);
    } else {
      reset();
    }

    dispatchSessionFlow({ type: "start" });
  }, [canStartSession, chordSet, clearSessionResult, layoutId, loadSet, materializePracticeSet, nextDecision, ownerKey, reset, sessionFlow.phase, sets, visibleCapacity]);

  const revealTrainerAndStart = useCallback(() => {
    if (trainerIntroPhase === "dismissed") {
      startSession();
      return;
    }
    if (trainerIntroPhase !== "visible" || !canStartSession) {
      return;
    }

    setLoadError(null);
    clearSessionResult();
    markPracticeIntroDismissed(ownerKey);
    dispatchTrainerIntro({ type: "startReveal" });
    window.requestAnimationFrame(() => startSession());
  }, [canStartSession, clearSessionResult, ownerKey, startSession, trainerIntroPhase]);

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
    setPendingRegistrationPrompt(false);
    setShowRegistrationPrompt(false);
  }, [guestSessionCount]);

  const dismissNamePrompt = useCallback(() => {
    setGuestResetConfirm(false);
    setGuestResetError(null);
    setPendingNamePrompt(false);
    setShowNamePrompt(false);
  }, []);

  const openGuestNamePrompt = useCallback(() => {
    setGuestResetConfirm(false);
    setGuestResetError(null);
    setGuestNameDraft(guestDisplayName ?? "");
    if (sessionFlow.phase === "paused" || sessionFlow.phase === "countdown" || sessionFlow.phase === "running") {
      setPendingNamePrompt(true);
      return;
    }
    setShowNamePrompt(true);
  }, [guestDisplayName, sessionFlow.phase]);

  const saveGuestName = useCallback(() => {
    if (guestResetting) {
      return;
    }
    const displayName = writeGuestDisplayName(guestNameDraft);
    if (!displayName) {
      return;
    }
    setGuestDisplayName(displayName);
    setPendingNamePrompt(false);
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
  }, [anonymousDeviceId, guestNameDraft, guestResetting]);

  const resetGuestProgress = useCallback(() => {
    setGuestResetting(true);
    setGuestResetError(null);
    void resetAnonymousProfile({ deviceId: anonymousDeviceId })
      .then(() => {
        clearGuestProgress();
        const nextAnonymousDeviceId = getOrCreateAnonymousDeviceId();
        setAnonymousDeviceId(nextAnonymousDeviceId);
        setGuestSessionCount(0);
        setGuestDisplayName(null);
        setGuestLayoutMastery({});
        setGuestNameDraft("");
        setProgress(null);
        setProgressImportMessage(null);
        setLatestGamificationEvents([]);
        setDismissedGamificationEventIds([]);
        setNextDecision(null);
        setPendingNamePrompt(false);
        setPendingRegistrationPrompt(false);
        setShowRegistrationPrompt(false);
        setShowProfileModal(false);
        setGuestResetConfirm(false);
        setShowNamePrompt(false);
        clearPracticeState();
        clearSessionResult();
        reset();
        dispatchSessionFlow({ type: "reset" });
      })
      .catch(() => {
        setGuestResetError(t("trainer.guestResetError"));
      })
      .finally(() => {
        setGuestResetting(false);
      });
  }, [anonymousDeviceId, clearSessionResult, reset, t]);

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
      if (event.code === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (showAdvancedSettingsModal && !advancedSettingsLocked) {
          setShowAdvancedSettingsModal(false);
          return;
        }
        const action = escapeActionForTrainerState({
          showNamePrompt,
          showProfileModal,
          showRegistrationPrompt,
          sessionPhase: sessionFlow.phase,
          finishOverlayVisible: sessionFlow.finishOverlayVisible,
        });
        switch (action) {
          case "closeNamePrompt":
            dismissNamePrompt();
            break;
          case "closeProfileModal":
            setShowProfileModal(false);
            break;
          case "closeRegistrationPrompt":
            dismissPrompt();
            break;
          case "cancelCountdown":
            cancelCountdown();
            break;
          case "closePausedOverlay":
            restartSession();
            break;
          case "dismissFinishedOverlay":
            dismissFinishOverlay();
            break;
          case "none":
            break;
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || shouldIgnoreShortcutTarget(event.target)) {
        return;
      }

      if (event.code === "Space" && canResumeSession) {
        event.preventDefault();
        resumeSession();
        return;
      }

      if (event.code === "Space" && trainerIntroPhase !== "dismissed" && !showRegistrationPrompt && !showNamePrompt) {
        event.preventDefault();
        revealTrainerAndStart();
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

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    advancedSettingsLocked,
    canResumeSession,
    canStartSession,
    cancelCountdown,
    dismissFinishOverlay,
    dismissNamePrompt,
    dismissPrompt,
    revealTrainerAndStart,
    restartSession,
    resumeSession,
    sessionFlow.finishOverlayVisible,
    sessionFlow.phase,
    showAdvancedSettingsModal,
    showNamePrompt,
    showProfileModal,
    showRegistrationPrompt,
    skipCountdown,
    startSession,
    trainerIntroPhase,
  ]);

  useEffect(() => {
    const activate = (event: KeyboardEvent) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        setShiftActive(true);
      }
    };
    const deactivate = (event: KeyboardEvent) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        setShiftActive(false);
      }
    };
    const clear = () => setShiftActive(false);

    window.addEventListener("keydown", activate);
    window.addEventListener("keyup", deactivate);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", activate);
      window.removeEventListener("keyup", deactivate);
      window.removeEventListener("blur", clear);
    };
  }, []);

  const startLabel = sessionFlow.phase === "finished" ? t("trainer.next") : t("trainer.start");
  const accountLabel = isAuthenticated ? t("auth.signedInAs") : t("auth.guestAccount");
  const accountValue = isAuthenticated ? me.email ?? me.username : guestDisplayName ?? t("auth.guestProgress");
  const countdownOverlayValue =
    sessionFlow.phase === "countdown" ? sessionFlow.countdownValue : closingOverlay?.kind === "countdown" ? closingOverlay.countdownValue : null;
  const renderCountdownOverlay = sessionFlow.phase === "countdown" || closingOverlay?.kind === "countdown";
  const renderPausedOverlay = sessionFlow.phase === "paused" || closingOverlay?.kind === "paused";
  const renderFinishedOverlay =
    (sessionFlow.phase === "finished" && sessionFlow.finishOverlayVisible) || closingOverlay?.kind === "finished";
  const celebrationPaused =
    renderCountdownOverlay ||
    renderPausedOverlay ||
    sessionFlow.phase === "running" ||
    showAdvancedSettingsModal ||
    showNamePrompt ||
    showRegistrationPrompt ||
    showProfileModal;
  const promptBlocked = shouldBlockDeferredPrompts({
    sessionPhase: sessionFlow.phase,
    hasNamePrompt: showNamePrompt,
    hasRegistrationPrompt: showRegistrationPrompt,
    hasCelebration: activeGamificationEvents.length > 0 && !celebrationPaused,
    profileOpen: showProfileModal || showAdvancedSettingsModal,
  });
  const canShowDeferredPrompt = shouldShowDeferredPrompt({
    sessionPhase: sessionFlow.phase,
    finishOverlayVisible: sessionFlow.finishOverlayVisible,
    hasBlockingOverlay: promptBlocked,
  });
  const trainerLayoutClassName = `trainer-layout ${trainerIntroPhase !== "dismissed" ? "trainer-layout--intro" : ""} ${practiceFocusMode ? "trainer-layout--practice" : ""}`;
  const trainerSurfaceClassName = `trainer-surface trainer-surface--${trainerIntroPhase}`;
  const selectedCodeLanguageLabels = codeLanguageOptions
    .filter((language) => selectedCodeLanguages.includes(language.id))
    .map((language) => language.label);
  const advancedLanguageSummary = selectedCodeLanguageLabels.join(" + ");
  const advancedDifficultyLabel = t(`trainer.codeDifficulty_${codeDifficultyBand}`);
  const advancedSummary = `${advancedLanguageSummary} · ${advancedDifficultyLabel}`;

  useEffect(() => {
    if (advancedSettingsLocked && showAdvancedSettingsModal) {
      setShowAdvancedSettingsModal(false);
    }
  }, [advancedSettingsLocked, showAdvancedSettingsModal]);

  useEffect(() => {
    if (!canShowDeferredPrompt) {
      return;
    }
    if (pendingNamePrompt) {
      setPendingNamePrompt(false);
      setShowNamePrompt(true);
      return;
    }
    if (pendingRegistrationPrompt) {
      setPendingRegistrationPrompt(false);
      setShowRegistrationPrompt(true);
    }
  }, [canShowDeferredPrompt, pendingNamePrompt, pendingRegistrationPrompt]);

  return (
    <main className="keyboard-app">
      <header className="app-header">
        <a className="brand-lockup" href={publicSiteUrl} aria-label={t("app.publicSiteAria")}>
          <span>{t("app.wordmark")}</span>
          <strong>{t("app.product")}</strong>
        </a>
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

      <section className={trainerLayoutClassName}>
        {trainerIntroPhase === "dismissed" && !practiceFocusMode ? (
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
            <select value={layoutId} onChange={(event) => changeTrainingLayout(event.target.value as LayoutId)} disabled={advancedSettingsLocked}>
              {layouts.map((layout) => (
                <option key={layout} value={layout}>
                  {layout}
                </option>
              ))}
            </select>
          </label>

          <div className="advanced-mode-control" role="group" aria-label={t("trainer.advancedPractice")}>
            <button
              type="button"
              className={`advanced-mode-control__option ${!advancedPracticeEnabled ? "is-active" : ""}`}
              onClick={() => changeAdvancedPracticeEnabled(false)}
              disabled={advancedSettingsLocked}
              aria-pressed={!advancedPracticeEnabled}
            >
              {t("trainer.advancedModeOptionNormal")}
            </button>
            <button
              type="button"
              className={`advanced-mode-control__option ${advancedPracticeEnabled ? "is-active" : ""}`}
              onClick={() => changeAdvancedPracticeEnabled(true)}
              disabled={advancedSettingsLocked}
              aria-pressed={advancedPracticeEnabled}
            >
              {t("trainer.advancedModeOptionAdvanced")}
            </button>
          </div>

          {advancedMode ? (
            <div className="advanced-summary-card" aria-label={t("trainer.advancedSummary")}>
              <div>
                <span>{t("trainer.codePractice")}</span>
                <strong>{advancedSummary}</strong>
                {numberRowEnabled ? <small>{t("trainer.numberRowEnabled")}</small> : null}
              </div>
              <button
                type="button"
                className="secondary-button advanced-summary-card__button"
                onClick={openAdvancedSettings}
                disabled={advancedSettingsLocked}
                aria-label={t("trainer.advancedConfigure")}
                title={t("trainer.advancedConfigure")}
              >
                <Pencil size={16} aria-hidden="true" />
                <span>{t("trainer.advancedConfigure")}</span>
              </button>
            </div>
          ) : (
            <label className="field field--set">
              <span>{t("trainer.set")}</span>
              <select
                value={chordSet && chordSet.id > 0 ? String(chordSet.id) : ""}
                onChange={(event) => selectSet(event.target.value)}
                disabled={sets.length === 0 || advancedSettingsLocked}
              >
                {sets
                  .filter((set) => set.practiceKind !== "CODE" && set.practiceKind !== "CODE_COMBO")
                  .map((set) => (
                    <option key={set.id} value={set.id}>
                      {formatTrainingSetTitle(set)}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div className="side-panel__actions">
            <button
              type="button"
              className="secondary-button progress-profile-button"
              onClick={() => setShowProfileModal(true)}
              disabled={isSessionLocked}
              aria-label={t("trainer.openProgressProfile")}
              title={t("trainer.openProgressProfile")}
            >
              <Trophy size={18} aria-hidden="true" />
              <span>{t("trainer.progressProfile")}</span>
            </button>
          </div>

          {progressImportMessage ? <div className="progress-import-status">{progressImportMessage}</div> : null}

        </aside>
        ) : null}

        <section className={trainerSurfaceClassName} aria-busy={loading || saving}>
          {trainerIntroPhase === "visible" ? (
            <div className="trainer-intro" aria-label={t("trainerIntro.ariaLabel")}>
              <span className="trainer-intro__eyebrow">{t("trainerIntro.eyebrow")}</span>
              <h1>{t("trainerIntro.title")}</h1>
              <p>{t("trainerIntro.body")}</p>
              <div className="trainer-intro__samples" aria-label={t("trainerIntro.samplesLabel")}>
                {t("trainerIntro.samples")
                  .split(" ")
                  .map((sample) => (
                    <span className="trainer-intro__sample" key={sample}>
                      {sample}
                    </span>
                  ))}
              </div>
              <p className="trainer-intro__microcopy">{t("trainerIntro.microcopy")}</p>
              <button
                type="button"
                className="intro-play-button"
                onClick={revealTrainerAndStart}
                disabled={!canStartSession}
                aria-label={t("trainerIntro.startAria")}
              >
                <Play size={34} fill="currentColor" aria-hidden="true" />
                <span>{t("trainerIntro.start")}</span>
              </button>
              <span className="trainer-intro__shortcut">{t("trainerIntro.shortcut")}</span>
              <span className="trainer-intro__meta">{t("trainerIntro.meta")}</span>
            </div>
          ) : (
            <>
          {loadError ? <div className="alert">{`${t("trainer.loadError")}: ${loadError}`}</div> : null}

          <StatsPanel
            labels={{
              mastery: t("stats.mastery"),
              speed: t("stats.speed"),
              accuracy: t("stats.accuracy"),
              cadence: t("stats.cadence"),
              errors: t("stats.errors"),
              progress: t("stats.progress"),
            }}
            units={{
              cpm: t("units.cpm"),
              percent: t("units.percent"),
              errors: t("units.errors"),
            }}
            currentLabel={t("trainer.current")}
            currentTitle={activeSetTitle}
            currentHint={activeSetHint}
            actions={(
              <>
                <button
                  type="button"
                  className="session-play-button"
                  onClick={startSession}
                  disabled={!canStartSession || trainerIntroPhase === "revealing"}
                  aria-label={t("trainer.playAria")}
                  title={t("trainer.playAria")}
                >
                  <Play size={24} fill="currentColor" aria-hidden="true" />
                  <span>{startLabel}</span>
                </button>
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
              </>
            )}
            masteryCpm={displayedMastery}
            masteryLevel={displayedMasteryLevel}
            speedCpm={liveStats.speedCpm}
            accuracy={liveStats.accuracy}
            cadence={liveStats.cadence}
            errors={liveStats.errors}
            progress={liveStats.progress}
            variant={practiceFocusMode ? "practice" : "default"}
          />

          <div className="practice-workspace">
            <div className="practice-cluster">
              <div className="typing-stage">
                <div
                  ref={typingStripRef}
                  className="typing-strip"
                  aria-live="polite"
                  aria-label={t("trainer.typingLineAria")}
                >
                  {typingWindow.rows.map((row, rowIndex) => (
                    <div className="typing-strip__line" key={`${typingWindow.start}-${rowIndex}`}>
                      {row.map(({ item, index, status }, itemIndex) => {
                        const hasPreviousVisibleCharacter = itemIndex > 0 && !row[itemIndex - 1]?.item.isSpace;
                        const hasNextVisibleCharacter = itemIndex < row.length - 1 && !row[itemIndex + 1]?.item.isSpace;
                        const showSpaceMarker =
                          item.isSpace &&
                          hasPreviousVisibleCharacter &&
                          (hasNextVisibleCharacter || itemIndex === row.length - 1);

                        return (
                          <span
                            key={index}
                            className={`typing-char typing-char--${status} ${index === pos ? "is-current" : ""} ${item.isChordStart ? "is-chord-start" : ""} ${item.isSpace ? "is-space" : ""} ${item.isSpace && !showSpaceMarker ? "is-space-edge" : ""}`}
                          >
                            {item.isSpace ? (showSpaceMarker ? "·" : "\u00a0") : item.char}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <VirtualKeyboard
                labels={keyboardLabels}
                layoutId={layoutId}
                nextChar={nextChar}
                nextRequiresShift={nextRequiresShift}
                advancedMode={advancedMode}
                shiftActive={shiftActive}
              />
            </div>
          </div>

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
              ) : saved && masterySummaryText ? (
                <>
                  <strong>{`${t("trainer.mastery")}: ${masterySummaryText}`}</strong>
                  <span>{t("trainer.saved")}</span>
                </>
              ) : guestRecorded && masterySummaryText ? (
                <>
                  <strong>{`${t("trainer.mastery")}: ${masterySummaryText}`}</strong>
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
                {effectiveMastery && sessionResult ? (
                  <>
                    <div className="result-card__mastery-row">
                      <span>{t("trainer.mastery")}</span>
                      <strong className="result-card__mastery">{masterySummaryText}</strong>
                      {masteryDeltaText ? <small>{masteryDeltaText}</small> : null}
                    </div>
                    <div className="result-card__stats" aria-label={t("trainer.resultStats")}>
                      <span>
                        <small>{t("stats.averageTempo")}</small>
                        <b>{`${Math.round(sessionResult.averageCpm)} ${t("units.cpm")}`}</b>
                      </span>
                      <span>
                        <small>{t("stats.cadence")}</small>
                        <b>{`${Math.round(sessionResult.cadence * 100)}${t("units.percent")}`}</b>
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
                    {resultWeakness ? (
                      <div className="result-card__weakness">
                        <span>
                          {resultWeakness.kind === "chords"
                            ? t("trainer.resultWeaknessChordsTitle")
                            : resultWeakness.kind === "chars"
                              ? t("trainer.resultWeaknessCharsTitle")
                              : t("trainer.resultWeaknessCleanTitle")}
                        </span>
                        {resultWeakness.values.length > 0 ? (
                          <div className="result-card__weakness-list">
                            {resultWeakness.values.map((value) => (
                              <b key={value}>{value}</b>
                            ))}
                          </div>
                        ) : null}
                        <p>
                          {resultWeakness.kind === "chords"
                            ? t("trainer.resultWeaknessChordsBody")
                            : resultWeakness.kind === "chars"
                              ? t("trainer.resultWeaknessCharsBody")
                              : t("trainer.resultWeaknessCleanBody")}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {techniqueAdviceText ? (
                  <div className="result-card__advice">
                    <span>{t("trainer.techniqueAdviceTitle")}</span>
                    <p>{techniqueAdviceText}</p>
                    {savedTechniqueAdvice ? null : <small>{t("trainer.techniqueAdviceHistoryHint")}</small>}
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
                {!isAuthenticated ? (
                  <button type="button" className="secondary-button result-card__save-progress" onClick={onSignIn}>
                    <LogIn size={18} aria-hidden="true" />
                    <span>{t("trainer.saveProgress")}</span>
                  </button>
                ) : null}
                <span>{t("trainer.startShortcut")}</span>
              </div>
            </div>
          ) : null}
            </>
          )}
        </section>
      </section>

      <AchievementCelebrationQueue
        labels={gamificationEventLabels}
        events={activeGamificationEvents}
        paused={celebrationPaused}
        onDismiss={(eventId) => setDismissedGamificationEventIds((current) => [...current, eventId])}
      />

      {showAdvancedSettingsModal ? (
        <div className="modal-backdrop advanced-settings-backdrop" role="presentation">
          <section className="registration-modal advanced-settings-modal" role="dialog" aria-modal="true" aria-labelledby="advanced-settings-title">
            <button
              type="button"
              className="icon-button registration-modal__close"
              onClick={() => setShowAdvancedSettingsModal(false)}
              aria-label={t("trainer.advancedClose")}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <div className="advanced-settings-modal__header">
              <span>{t("trainer.advancedPractice")}</span>
              <h2 id="advanced-settings-title">{t("trainer.advancedSettings")}</h2>
              <strong>{advancedSummary}</strong>
            </div>

            <section className="advanced-settings-section" aria-label={t("trainer.codePractice")}>
              <div className="advanced-settings-section__header">
                <span>{t("trainer.codePractice")}</span>
                <strong>{selectedCodeLanguages.length}</strong>
              </div>
              <div className="code-language-grid">
                {codeLanguageOptions.map((language) => {
                  const active = selectedCodeLanguages.includes(language.id);
                  return (
                    <button
                      key={language.id}
                      type="button"
                      className={`code-language-chip ${active ? "is-active" : ""}`}
                      onClick={() => toggleCodeLanguage(language.id)}
                      disabled={advancedSettingsLocked}
                      aria-pressed={active}
                    >
                      {language.label}
                    </button>
                  );
                })}
              </div>
              <label className="field code-difficulty-field">
                <span>{t("trainer.codeDifficulty")}</span>
                <select
                  value={codeDifficultyBand}
                  onChange={(event) => changeCodeDifficultyBand(event.target.value as CodeDifficultyBand)}
                  disabled={advancedSettingsLocked}
                >
                  {codeDifficultyBands.map((band) => (
                    <option key={band.id} value={band.id}>
                      {t(`trainer.codeDifficulty_${band.id}`)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className={`advanced-settings-section number-row-card ${numberRowEnabled ? "is-active" : ""}`} aria-label={t("trainer.numberRow")}>
              <label className="number-row-toggle">
                <input
                  type="checkbox"
                  checked={numberRowEnabled}
                  onChange={(event) => changeNumberRowEnabled(event.target.checked)}
                  disabled={advancedSettingsLocked}
                />
                <span>{t("trainer.numberRow")}</span>
              </label>
              <div className="number-row-preview" aria-hidden="true">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </div>
              <div className="number-row-preview number-row-preview--shift" aria-hidden="true">
                {["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"].map((symbol) => (
                  <span key={symbol}>{symbol}</span>
                ))}
              </div>
            </section>
          </section>
        </div>
      ) : null}

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
                disabled={guestResetting}
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
              <button type="button" className="primary-button" onClick={saveGuestName} disabled={guestResetting}>
                <Save size={18} aria-hidden="true" />
                <span>{t("trainer.guestNameSave")}</span>
              </button>
              <button type="button" className="secondary-button" onClick={dismissNamePrompt} disabled={guestResetting}>
                <span>{t("trainer.continueGuest")}</span>
              </button>
            </div>
            <div className="guest-reset-panel" aria-live="polite">
              {guestResetConfirm ? (
                <div className="guest-reset-panel__confirm">
                  <strong>{t("trainer.guestResetTitle")}</strong>
                  <p>{t("trainer.guestResetBody")}</p>
                  <div className="registration-modal__actions">
                    <button type="button" className="danger-button danger-button--solid" onClick={resetGuestProgress} disabled={guestResetting}>
                      <RotateCcw size={18} aria-hidden="true" />
                      <span>{guestResetting ? t("trainer.guestResetting") : t("trainer.guestResetConfirm")}</span>
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setGuestResetConfirm(false);
                        setGuestResetError(null);
                      }}
                      disabled={guestResetting}
                    >
                      <span>{t("trainer.guestResetCancel")}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    setGuestResetConfirm(true);
                    setGuestResetError(null);
                  }}
                  disabled={guestResetting}
                >
                  <RotateCcw size={18} aria-hidden="true" />
                  <span>{t("trainer.guestResetProgress")}</span>
                </button>
              )}
              {guestResetError ? <p className="guest-reset-panel__error">{guestResetError}</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {showProfileModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="registration-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
            <button type="button" className="icon-button registration-modal__close" onClick={() => setShowProfileModal(false)} aria-label={t("trainer.closeProgressProfile")}>
              <X size={18} aria-hidden="true" />
            </button>
            <h2 id="profile-modal-title">{t("trainer.progressProfile")}</h2>
            <ProfileProgressSnapshot
              progress={effectiveProgress}
              labels={{
                sessions: t("trainer.sessions"),
                best: t("trainer.best"),
                avgSpeed: t("trainer.avgSpeed"),
                avgAccuracy: t("trainer.avgAccuracy"),
                weakFingers: t("trainer.weakFingers"),
                noWeakFingers: t("trainer.noWeakFingers"),
                signInForProgress: t("trainer.signInForProgress"),
              }}
              units={{
                cpm: t("units.cpm"),
                percent: t("units.percent"),
              }}
              isAuthenticated={isAuthenticated}
              fingerLabel={(finger) => t(`finger.${finger as (typeof FINGER_ORDER)[number]}`)}
            />
            <GamificationProfilePanel
              labels={gamificationLabels}
              units={{ cpm: t("units.cpm") }}
              gamification={effectiveGamification}
            />
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
              <a className="registration-modal__site-link" href={publicSiteUrl}>
                {t("app.returnToSite")}
              </a>
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

function ProfileProgressSnapshot({
  progress,
  labels,
  units,
  isAuthenticated,
  fingerLabel,
}: {
  progress: Progress;
  labels: {
    sessions: string;
    best: string;
    avgSpeed: string;
    avgAccuracy: string;
    weakFingers: string;
    noWeakFingers: string;
    signInForProgress: string;
  };
  units: {
    cpm: string;
    percent: string;
  };
  isAuthenticated: boolean;
  fingerLabel: (finger: string) => string;
}) {
  return (
    <section className="profile-progress-snapshot" aria-label={labels.weakFingers}>
      <div className="profile-progress-snapshot__metrics">
        <Metric label={labels.sessions} value={String(progress.sessions)} />
        <Metric label={labels.best} value={`${Math.round(progress.bestSpeedCpm)} ${units.cpm}`} />
        <Metric label={labels.avgSpeed} value={`${Math.round(progress.avgSpeedCpm)} ${units.cpm}`} />
        <Metric label={labels.avgAccuracy} value={`${Math.round(progress.avgAccuracy * 100)}${units.percent}`} />
      </div>
      <div className="profile-progress-snapshot__weak-fingers">
        <h3>{labels.weakFingers}</h3>
        {progress.weakFingers.length > 0 ? (
          <ul>
            {progress.weakFingers.map((finger) => (
              <li key={finger.finger}>
                <span>{fingerLabel(finger.finger)}</span>
                <strong>{finger.errors}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>{isAuthenticated ? labels.noWeakFingers : labels.signInForProgress}</p>
        )}
      </div>
    </section>
  );
}
