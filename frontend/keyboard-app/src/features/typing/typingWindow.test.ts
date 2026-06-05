import { describe, expect, it } from "vitest";
import type { CharStatus, StreamItem } from "./typingStore";
import { buildTypingWindow, computeTypingLineCapacity, typingWindowLineLength, typingWindowRows } from "./typingWindow";

const makeItem = (index: number): StreamItem => ({
  char: String.fromCharCode(97 + (index % 26)),
  finger: "leftIndex",
  chordIndex: index,
  isChordStart: index % 3 === 0,
});

describe("typing window", () => {
  it("computes line capacity from rendered width without a fixed upper maximum", () => {
    expect(computeTypingLineCapacity({ usableWidth: 240, characterWidth: 12 })).toBe(20);
    expect(computeTypingLineCapacity({ usableWidth: 720, characterWidth: 12 })).toBe(60);
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
