import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChordSet } from "../../shared/types";
import { buildStream, useTypingStore } from "./typingStore";

const timedChordSet: ChordSet = {
  id: 7,
  layout: "EN",
  title: "Timed",
  difficulty: 1,
  tier: "beginner",
  chords: ["asdfg"],
};

function pressAt(ms: number, code: string) {
  vi.setSystemTime(ms);
  useTypingStore.getState().handleKey(code);
}

afterEach(() => {
  vi.useRealTimers();
  useTypingStore.getState().loadSet("EN", timedChordSet, 5);
});

describe("typing stream", () => {
  it("repeats short chord sets so the two-line practice window is filled", () => {
    const chordSet: ChordSet = {
      id: 1,
      layout: "EN",
      title: "Short",
      difficulty: 1,
      tier: "beginner",
      chords: ["th", "er"],
    };

    const stream = buildStream("EN", chordSet, 24);

    expect(stream.length).toBeGreaterThanOrEqual(24);
    expect(stream[0]?.char).toBe("t");
    expect(stream.some((item) => item.isSpace)).toBe(true);
  });

  it("uses the measured visible capacity instead of a fixed maximum", () => {
    const chordSet: ChordSet = {
      id: 1,
      layout: "EN",
      title: "Short",
      difficulty: 1,
      tier: "beginner",
      chords: ["th", "er"],
    };

    const stream = buildStream("EN", chordSet, 12);

    expect(stream.length).toBe(17);
  });
});

describe("typing session timing", () => {
  it("excludes automatic pause gaps from cadence intervals", () => {
    vi.useFakeTimers();
    useTypingStore.getState().loadSet("EN", timedChordSet, 5);

    pressAt(0, "KeyA");
    pressAt(500, "KeyS");
    pressAt(1_000, "KeyD");
    vi.setSystemTime(7_000);
    useTypingStore.getState().pauseTiming();
    vi.setSystemTime(12_000);
    useTypingStore.getState().resumeTiming();
    pressAt(12_500, "KeyF");
    pressAt(13_000, "KeyG");

    const result = useTypingStore.getState().result();

    expect(result?.cadence).toBeGreaterThan(0.95);
  });

  it("excludes automatic pause and its idle tail from average speed", () => {
    vi.useFakeTimers();
    useTypingStore.getState().loadSet("EN", timedChordSet, 5);

    pressAt(0, "KeyA");
    pressAt(500, "KeyS");
    pressAt(1_000, "KeyD");
    vi.setSystemTime(7_000);
    useTypingStore.getState().pauseTiming();
    vi.setSystemTime(12_000);
    useTypingStore.getState().resumeTiming();
    pressAt(12_500, "KeyF");
    pressAt(13_000, "KeyG");

    const result = useTypingStore.getState().result();

    expect(result?.durationMs).toBe(2_000);
    expect(result?.speedCpm).toBe(150);
  });
});
