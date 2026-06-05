import { describe, expect, it } from "vitest";
import type { CharStatus, StreamItem } from "./typingStore";
import {
  buildCanvasFont,
  buildMeasuredTypingWindow,
  buildTypingWindow,
  buildTypingWidthMetrics,
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

const manropeLikeWidths: Record<string, number> = {
  a: 19.82,
  b: 21.62,
  c: 19.82,
  d: 21.62,
  e: 20.67,
  f: 11.8,
  g: 21.22,
  h: 21.62,
  i: 10.06,
  l: 10.06,
  m: 31.14,
  n: 21.62,
  o: 21.32,
  p: 21.62,
  r: 14.01,
  s: 18.6,
  t: 15.1,
  u: 21.62,
  v: 18.7,
  w: 27.68,
  y: 19.38,
  W: 32.1,
  ш: 33.4,
  щ: 35.2,
};

const measureManropeLike = (text: string) =>
  Array.from(text).reduce((sum, char) => sum + (manropeLikeWidths[char] ?? 20), 0);

function streamFromText(text: string): StreamItem[] {
  return Array.from(text).map((char, index) => ({
    char,
    finger: "leftIndex",
    chordIndex: 0,
    chord: text,
    isChordStart: index === 0 || text[index - 1] === " ",
    isSpace: char === " ",
  }));
}

const rowText = (row: { item: StreamItem }[]) => row.map(({ item }) => item.char).join("");

describe("typing window", () => {
  it("builds a canvas font from longhand styles when computed font shorthand is empty", () => {
    expect(
      buildCanvasFont({
        font: "",
        fontStyle: "normal",
        fontVariant: "none",
        fontWeight: "800",
        fontSize: "34px",
        lineHeight: "38px",
        fontFamily: 'Manrope, system-ui, "Segoe UI", sans-serif',
      }),
    ).toBe('800 34px/38px Manrope, system-ui, "Segoe UI", sans-serif');
  });

  it("builds per-character metrics for the active stream and uses the rendered css space width", () => {
    const metrics = buildTypingWidthMetrics({
      maxLineWidth: 920,
      fontSize: 34,
      characters: Array.from("practice "),
      measureText: measureManropeLike,
    });

    expect(metrics.spaceWidth).toBeCloseTo(34 * 0.58, 5);
    expect(metrics.characterWidths?.p).toBeCloseTo(manropeLikeWidths.p, 5);
    expect(metrics.characterWidths?.i).toBeCloseTo(manropeLikeWidths.i, 5);
    expect(metrics.characterWidths?.[" "]).toBeUndefined();
  });

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

  it("wraps only between chord tokens, never inside an ngram token", () => {
    const stream = streamFromText("ation ition ement practice");
    const statuses = stream.map(() => "pending" as const);
    const metrics = buildTypingWidthMetrics({
      maxLineWidth: 210,
      fontSize: 34,
      characters: stream.map((item) => item.char),
      measureText: measureManropeLike,
    });

    const window = buildMeasuredTypingWindow(stream, statuses, "ation ition ement ".length, metrics, 2);
    const rowTexts = window.rows.map(rowText);

    expect(rowTexts.some((text) => text.includes("practic") && !text.includes("practice"))).toBe(false);
    expect(rowTexts).toContain("practice");
    window.rows.forEach((row) => {
      expect(measureTypingWindowRowWidth(row, metrics)).toBeLessThanOrEqual(metrics.maxLineWidth);
    });
  });

  it("keeps measured non-final rows close to the available width when tokens remain", () => {
    const stream = streamFromText("ation ition ement ently ssion through sider ntial iness struct tinue ction fulness ability practice");
    const statuses = stream.map(() => "pending" as const);
    const metrics = buildTypingWidthMetrics({
      maxLineWidth: 920,
      fontSize: 34,
      characters: stream.map((item) => item.char),
      measureText: measureManropeLike,
    });

    const window = buildMeasuredTypingWindow(stream, statuses, 0, metrics, 2);

    expect(measureTypingWindowRowWidth(window.rows[0], metrics)).toBeGreaterThan(metrics.maxLineWidth * 0.85);
    expect(measureTypingWindowRowWidth(window.rows[1], metrics)).toBeGreaterThan(metrics.maxLineWidth * 0.85);
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

  it("packs screenshot-like EN rows from actual character widths instead of worst-case glyph width", () => {
    const stream = streamFromText("ation ition ement ently ssion through sider ntial iness struct tinue ction fulness ability practice");
    const statuses = stream.map(() => "pending" as const);
    const metrics = buildTypingWidthMetrics({
      maxLineWidth: 920,
      fontSize: 34,
      characters: stream.map((item) => item.char),
      measureText: measureManropeLike,
    });

    const window = buildMeasuredTypingWindow(stream, statuses, 0, metrics, 2);

    window.rows.forEach((row) => {
      expect(measureTypingWindowRowWidth(row, metrics)).toBeLessThanOrEqual(metrics.maxLineWidth);
    });
    expect(window.rows[0].length).toBeGreaterThan(35);
    expect(measureTypingWindowRowWidth(window.rows[0], metrics)).toBeGreaterThan(780);
  });

  it("keeps the final e of practice on the same measured line before completion", () => {
    const text = "lity ction fulness through sider ntial tinue practice";
    const stream = streamFromText(text);
    const statuses: CharStatus[] = stream.map((_, index) => (index < text.length - 1 ? "correct" : "pending"));
    const metrics = buildTypingWidthMetrics({
      maxLineWidth: 940,
      fontSize: 34,
      characters: stream.map((item) => item.char),
      measureText: measureManropeLike,
    });
    const finalIndex = text.length - 1;

    const window = buildMeasuredTypingWindow(stream, statuses, finalIndex, metrics, 2);
    const rowWithFinalE = window.rows.find((row) => row.some((item) => item.index === finalIndex));

    expect(rowWithFinalE).toBeDefined();
    expect(rowText(rowWithFinalE ?? [])).toContain("practice");
    expect(rowWithFinalE?.length).toBeGreaterThan(2);
  });
});
