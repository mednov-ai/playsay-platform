import { describe, expect, it } from "vitest";
import type { CharStatus, StreamItem } from "./typingStore";
import { buildTypingWindow, typingWindowLineLength, typingWindowRows } from "./typingWindow";

const makeItem = (index: number): StreamItem => ({
  char: String.fromCharCode(97 + (index % 26)),
  finger: "leftIndex",
  chordIndex: index,
  isChordStart: index % 3 === 0,
});

describe("typing window", () => {
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

  it("keeps the current position near the beginning of the visible window", () => {
    const stream = Array.from({ length: 200 }, (_, index) => makeItem(index));
    const statuses: CharStatus[] = stream.map((_, index) => (index < 75 ? "correct" : "pending"));
    const window = buildTypingWindow(stream, statuses, 75);
    const visibleCurrent = window.rows.flat().find((item) => item.index === 75);

    expect(window.start).toBe(69);
    expect(visibleCurrent).toBeDefined();
    expect(visibleCurrent?.status).toBe("pending");
  });
});
