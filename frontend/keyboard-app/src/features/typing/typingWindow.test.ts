import { describe, expect, it } from "vitest";
import type { CharStatus, StreamItem } from "./typingStore";
import {
  buildMeasuredTypingWindow,
  buildTypingWindow,
  computeTypingLineCapacity,
  measureTypingWindowRowWidth,
  typingWindowLineLength,
  typingWindowRows,
} from "./typingWindow";

const makeItem = (index: number): StreamItem => ({
  char: String.fromCharCode(97 + (index % 26)),
  finger: "leftIndex",
  chordIndex: index,
  chord: String.fromCharCode(97 + (index % 26)),
  isChordStart: index % 3 === 0,
});

describe("typing window", () => {
  it("computes line capacity from rendered width without a fixed upper maximum", () => {
    expect(computeTypingLineCapacity({ usableWidth: 240, characterWidth: 12 })).toBe(17);
    expect(computeTypingLineCapacity({ usableWidth: 720, characterWidth: 12 })).toBe(53);
  });

  it("packs measured rows so the rendered line width never exceeds the strip", () => {
    const stream: StreamItem[] = [
      { ...makeItem(0), char: "w" },
      { ...makeItem(1), char: "i" },
      { char: " ", finger: "leftIndex", chordIndex: 1, chord: " ", isChordStart: false, isSpace: true },
      { ...makeItem(2), char: "m" },
      { ...makeItem(3), char: "w" },
      { ...makeItem(4), char: "i" },
      { char: " ", finger: "leftIndex", chordIndex: 2, chord: " ", isChordStart: false, isSpace: true },
      { ...makeItem(5), char: "m" },
    ];
    const statuses = stream.map(() => "pending" as const);
    const metrics = {
      maxLineWidth: 44,
      defaultCharacterWidth: 10,
      spaceWidth: 5,
      characterWidths: { w: 14, m: 13, i: 5 },
    };

    const window = buildMeasuredTypingWindow(stream, statuses, 0, metrics, 2);

    expect(window.rows).toHaveLength(2);
    expect(window.rows).toEqual([
      expect.arrayContaining([
        expect.objectContaining({ item: expect.objectContaining({ char: "w" }) }),
      ]),
      expect.any(Array),
    ]);
    window.rows.forEach((row) => {
      expect(measureTypingWindowRowWidth(row, metrics)).toBeLessThanOrEqual(metrics.maxLineWidth);
    });
  });

  it("renders exactly two filled rows when enough stream items are available", () => {
    const stream = Array.from({ length: 200 }, (_, index) => makeItem(index));
    const statuses = stream.map(() => "pending" as const);
    const window = buildTypingWindow(stream, statuses, 0);

    expect(window.rows).toHaveLength(typingWindowRows);
    expect(window.rows[0]).toHaveLength(typingWindowLineLength);
    expect(window.rows[1]).toHaveLength(typingWindowLineLength);
    expect(window.start).toBe(0);
    expect(window.end).toBe(typingWindowLineLength * typingWindowRows);
  });

  it("keeps the first two rows anchored while the current position still fits", () => {
    const stream = Array.from({ length: 80 }, (_, index) => makeItem(index));
    const statuses: CharStatus[] = stream.map((_, index) => (index < 13 ? "correct" : "pending"));
    const window = buildTypingWindow(stream, statuses, 13, 12, 2);
    const visibleCurrent = window.rows.flat().find((item) => item.index === 13);

    expect(window.start).toBe(0);
    expect(window.end).toBe(24);
    expect(window.rows[0]).toHaveLength(12);
    expect(window.rows[1]).toHaveLength(12);
    expect(visibleCurrent).toBeDefined();
  });

  it("advances by full visible rows instead of crawling character by character", () => {
    const stream = Array.from({ length: 200 }, (_, index) => makeItem(index));
    const statuses: CharStatus[] = stream.map((_, index) => (index < 75 ? "correct" : "pending"));
    const window = buildTypingWindow(stream, statuses, 75, 24, 2);
    const visibleCurrent = window.rows.flat().find((item) => item.index === 75);

    expect(window.start).toBe(48);
    expect(window.end).toBe(96);
    expect(visibleCurrent).toBeDefined();
    expect(visibleCurrent?.status).toBe("pending");
  });
});
