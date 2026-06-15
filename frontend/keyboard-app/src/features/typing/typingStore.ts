import { create } from "zustand";
import { LAYOUTS, resolveKeyInput } from "../../entities/layouts";
import type { ChordSet, Finger, LayoutId } from "../../shared/types";
import { computeAverageTempo, computeCadence } from "./mastery";
import { typingWindowLineLength, typingWindowRows } from "./typingWindow";

export type CharStatus = "pending" | "correct" | "error";

export interface StreamItem {
  char: string;
  code?: string;
  finger: Finger;
  chordIndex: number;
  chord: string;
  isChordStart: boolean;
  isSpace?: boolean;
  requiresShift?: boolean;
}

export interface SessionResult {
  clientResultId: string;
  chordSetId: number;
  layoutId: LayoutId;
  speedCpm: number;
  averageCpm: number;
  accuracy: number;
  errors: number;
  characterCount: number;
  correctCount: number;
  durationMs: number;
  perFinger: Record<string, number>;
  perChar: Record<string, number>;
  perChord: Record<string, number>;
  cadence: number;
}

interface TypingState {
  layoutId: LayoutId;
  chordSet: ChordSet | null;
  stream: StreamItem[];
  statuses: CharStatus[];
  pos: number;
  startedAt: number | null;
  finishedAt: number | null;
  correctCount: number;
  errorCount: number;
  perFinger: Record<string, number>;
  perChar: Record<string, number>;
  perChord: Record<string, number>;
  errorFlash: number | null;
  intervals: number[];
  lastCorrectAt: number | null;
  lastInputAt: number | null;
  excludedDurationMs: number;
  pausedAt: number | null;
  loadSet: (layoutId: LayoutId, chordSet: ChordSet, visibleCapacity?: number) => void;
  reset: () => void;
  pauseTiming: () => void;
  resumeTiming: () => void;
  handleKey: (code: string, shiftKey?: boolean) => void;
  result: () => SessionResult | null;
}

export const minimumPracticeStreamLength = typingWindowLineLength * typingWindowRows;
export const defaultPracticeVisibleCapacity = minimumPracticeStreamLength;
export const automaticPauseTimingGraceMs = 6_000;

export interface ActiveDurationInput {
  startedAt: number | null;
  endedAt: number | null;
  excludedDurationMs: number;
  pausedAt: number | null;
}

export function computeActiveDurationMs({ startedAt, endedAt, excludedDurationMs, pausedAt }: ActiveDurationInput): number {
  if (startedAt == null || endedAt == null) {
    return 0;
  }

  const safeEndedAt = Math.max(startedAt, endedAt);
  const activePauseDurationMs = pausedAt == null ? 0 : Math.max(0, safeEndedAt - pausedAt);
  const inactiveDurationMs = Math.max(0, excludedDurationMs) + activePauseDurationMs;
  return Math.max(1, safeEndedAt - startedAt - inactiveDurationMs);
}

function cleanVisibleCapacity(visibleCapacity: number | undefined): number {
  if (visibleCapacity == null || !Number.isFinite(visibleCapacity)) {
    return defaultPracticeVisibleCapacity;
  }

  return Math.max(1, Math.floor(visibleCapacity));
}

export function buildStream(layoutId: LayoutId, chordSet: ChordSet, visibleCapacity?: number): StreamItem[] {
  const layout = LAYOUTS[layoutId];
  const targetLength = cleanVisibleCapacity(visibleCapacity);
  const baseStream: StreamItem[] = [];
  chordSet.chords.forEach((chord, chordIndex) => {
    if (chordIndex > 0) {
      baseStream.push({ char: " ", finger: "rightIndex", chordIndex, chord: " ", isChordStart: false, isSpace: true });
    }

    Array.from(chord).forEach((char, charIndex) => {
      const key = layout.byChar[char];
      baseStream.push({
        char,
        code: key?.code,
        finger: key?.finger ?? "rightIndex",
        chordIndex,
        chord,
        isChordStart: charIndex === 0,
        requiresShift: key?.requiresShift === true,
      });
    });
  });

  if (baseStream.length === 0 || baseStream.length >= targetLength) {
    return baseStream;
  }

  const stream: StreamItem[] = [];
  let cycle = 0;
  while (stream.length < targetLength) {
    if (cycle > 0) {
      stream.push({ char: " ", finger: "rightIndex", chordIndex: cycle * chordSet.chords.length, chord: " ", isChordStart: false, isSpace: true });
    }
    baseStream.forEach((item) => {
      stream.push({
        ...item,
        chordIndex: item.chordIndex + cycle * chordSet.chords.length,
      });
    });
    cycle += 1;
  }

  return stream;
}

export const useTypingStore = create<TypingState>((set, get) => ({
  layoutId: "EN",
  chordSet: null,
  stream: [],
  statuses: [],
  pos: 0,
  startedAt: null,
  finishedAt: null,
  correctCount: 0,
  errorCount: 0,
  perFinger: {},
  perChar: {},
  perChord: {},
  errorFlash: null,
  intervals: [],
  lastCorrectAt: null,
  lastInputAt: null,
  excludedDurationMs: 0,
  pausedAt: null,

  loadSet: (layoutId, chordSet, visibleCapacity) => {
    const stream = buildStream(layoutId, chordSet, visibleCapacity);
    set({
      layoutId,
      chordSet,
      stream,
      statuses: stream.map(() => "pending"),
      pos: 0,
      startedAt: null,
      finishedAt: null,
      correctCount: 0,
      errorCount: 0,
      perFinger: {},
      perChar: {},
      perChord: {},
      errorFlash: null,
      intervals: [],
      lastCorrectAt: null,
      lastInputAt: null,
      excludedDurationMs: 0,
      pausedAt: null,
    });
  },

  reset: () => {
    const { stream } = get();
    set({
      statuses: stream.map(() => "pending"),
      pos: 0,
      startedAt: null,
      finishedAt: null,
      correctCount: 0,
      errorCount: 0,
      perFinger: {},
      perChar: {},
      perChord: {},
      errorFlash: null,
      intervals: [],
      lastCorrectAt: null,
      lastInputAt: null,
      excludedDurationMs: 0,
      pausedAt: null,
    });
  },

  pauseTiming: () => {
    const state = get();
    if (state.startedAt == null || state.pausedAt != null) {
      return;
    }

    const timestamp = Date.now();
    const lastActivityAt = state.lastInputAt ?? state.lastCorrectAt ?? state.startedAt;
    const pauseStart = Math.min(
      timestamp,
      Math.max(state.startedAt, lastActivityAt, timestamp - automaticPauseTimingGraceMs),
    );

    set({
      pausedAt: pauseStart,
      lastCorrectAt: null,
    });
  },

  resumeTiming: () => {
    const state = get();
    if (state.pausedAt == null) {
      return;
    }

    const timestamp = Date.now();
    set({
      excludedDurationMs: state.excludedDurationMs + Math.max(0, timestamp - state.pausedAt),
      pausedAt: null,
      lastCorrectAt: null,
      lastInputAt: timestamp,
    });
  },

  handleKey: (code, shiftKey = false) => {
    const state = get();
    const { layoutId, stream, pos, finishedAt } = state;
    if (finishedAt != null || pos >= stream.length) {
      return;
    }

    const pressedChar = code === "Space" ? " " : resolveKeyInput(layoutId, code, shiftKey)?.char;
    if (pressedChar == null) {
      return;
    }

    const timestamp = Date.now();
    const startedAt = state.startedAt ?? timestamp;
    const target = stream[pos];

    if (pressedChar === target.char) {
      const statuses = state.statuses.slice();
      statuses[pos] = "correct";
      const nextPos = pos + 1;
      const done = nextPos >= stream.length;
      const intervals =
        state.lastCorrectAt != null ? [...state.intervals, timestamp - state.lastCorrectAt] : state.intervals;
      set({
        statuses,
        pos: nextPos,
        startedAt,
        correctCount: state.correctCount + 1,
        finishedAt: done ? timestamp : null,
        errorFlash: null,
        intervals,
        lastCorrectAt: timestamp,
        lastInputAt: timestamp,
      });
      return;
    }

    const statuses = state.statuses.slice();
    statuses[pos] = "error";
    const perFinger = { ...state.perFinger };
    const perChar = { ...state.perChar };
    const perChord = { ...state.perChord };
    if (target.char !== " ") {
      perFinger[target.finger] = (perFinger[target.finger] ?? 0) + 1;
      perChar[target.char] = (perChar[target.char] ?? 0) + 1;
      perChord[target.chord] = (perChord[target.chord] ?? 0) + 1;
    }
    set({
      statuses,
      startedAt,
      errorCount: state.errorCount + 1,
      perFinger,
      perChar,
      perChord,
      errorFlash: pos,
      lastInputAt: timestamp,
    });
  },

  result: () => {
    const {
      chordSet,
      startedAt,
      finishedAt,
      correctCount,
      errorCount,
      perFinger,
      perChar,
      perChord,
      intervals,
      excludedDurationMs,
      pausedAt,
    } = get();
    if (!chordSet || startedAt == null || finishedAt == null) {
      return null;
    }

    const durationMs = computeActiveDurationMs({ startedAt, endedAt: finishedAt, excludedDurationMs, pausedAt });
    const averageCpm = computeAverageTempo({ correctCount, durationMs });
    const total = correctCount + errorCount;
    const accuracy = total === 0 ? 1 : correctCount / total;

    return {
      clientResultId: `keyboard-${chordSet.id}-${startedAt}-${finishedAt}-${correctCount}-${errorCount}`,
      chordSetId: chordSet.id,
      layoutId: chordSet.layout,
      speedCpm: averageCpm,
      averageCpm,
      accuracy: Math.round(accuracy * 1_000) / 1_000,
      errors: errorCount,
      characterCount: total,
      correctCount,
      durationMs,
      perFinger,
      perChar,
      perChord,
      cadence: Math.round(computeCadence(intervals) * 1_000) / 1_000,
    };
  },
}));
