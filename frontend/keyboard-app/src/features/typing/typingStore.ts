import { create } from "zustand";
import { LAYOUTS } from "../../entities/layouts";
import type { ChordSet, Finger, LayoutId } from "../../shared/types";
import { computeCadence } from "./scoring";

export type CharStatus = "pending" | "correct" | "error";

export interface StreamItem {
  char: string;
  finger: Finger;
  chordIndex: number;
  isChordStart: boolean;
  isSpace?: boolean;
}

export interface SessionResult {
  chordSetId: number;
  speedCpm: number;
  accuracy: number;
  errors: number;
  durationMs: number;
  perFinger: Record<string, number>;
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
  errorFlash: number | null;
  intervals: number[];
  lastCorrectAt: number | null;
  loadSet: (layoutId: LayoutId, chordSet: ChordSet) => void;
  reset: () => void;
  handleKey: (code: string) => void;
  result: () => SessionResult | null;
}

function buildStream(layoutId: LayoutId, chordSet: ChordSet): StreamItem[] {
  const layout = LAYOUTS[layoutId];
  const stream: StreamItem[] = [];
  chordSet.chords.forEach((chord, chordIndex) => {
    if (chordIndex > 0) {
      stream.push({ char: " ", finger: "rightIndex", chordIndex, isChordStart: false, isSpace: true });
    }

    Array.from(chord).forEach((char, charIndex) => {
      const key = layout.byChar[char];
      stream.push({
        char,
        finger: key?.finger ?? "rightIndex",
        chordIndex,
        isChordStart: charIndex === 0,
      });
    });
  });
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
  errorFlash: null,
  intervals: [],
  lastCorrectAt: null,

  loadSet: (layoutId, chordSet) => {
    const stream = buildStream(layoutId, chordSet);
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
      errorFlash: null,
      intervals: [],
      lastCorrectAt: null,
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
      errorFlash: null,
      intervals: [],
      lastCorrectAt: null,
    });
  },

  handleKey: (code) => {
    const state = get();
    const { layoutId, stream, pos, finishedAt } = state;
    if (finishedAt != null || pos >= stream.length) {
      return;
    }

    const pressedChar = code === "Space" ? " " : LAYOUTS[layoutId].byCode[code]?.char;
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
      });
      return;
    }

    const statuses = state.statuses.slice();
    statuses[pos] = "error";
    const perFinger = { ...state.perFinger };
    const perChar = { ...state.perChar };
    if (target.char !== " ") {
      perFinger[target.finger] = (perFinger[target.finger] ?? 0) + 1;
      perChar[target.char] = (perChar[target.char] ?? 0) + 1;
    }
    set({
      statuses,
      startedAt,
      errorCount: state.errorCount + 1,
      perFinger,
      perChar,
      errorFlash: pos,
    });
  },

  result: () => {
    const { chordSet, startedAt, finishedAt, correctCount, errorCount, perFinger, intervals } = get();
    if (!chordSet || startedAt == null || finishedAt == null) {
      return null;
    }

    const durationMs = Math.max(1, finishedAt - startedAt);
    const speedCpm = correctCount / (durationMs / 60_000);
    const total = correctCount + errorCount;
    const accuracy = total === 0 ? 1 : correctCount / total;

    return {
      chordSetId: chordSet.id,
      speedCpm: Math.round(speedCpm * 10) / 10,
      accuracy: Math.round(accuracy * 1_000) / 1_000,
      errors: errorCount,
      durationMs,
      perFinger,
      cadence: Math.round(computeCadence(intervals) * 1_000) / 1_000,
    };
  },
}));
