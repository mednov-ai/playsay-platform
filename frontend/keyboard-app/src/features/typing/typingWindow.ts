import type { StreamItem, CharStatus } from "./typingStore";

export interface TypingWindowItem {
  index: number;
  item: StreamItem;
  status: CharStatus;
}

export interface TypingWindow {
  start: number;
  end: number;
  rows: TypingWindowItem[][];
}

export interface TypingWidthMetrics {
  maxLineWidth: number;
  defaultCharacterWidth: number;
  spaceWidth: number;
  characterWidths?: Record<string, number>;
}

export const typingWindowLineLength = 48;
export const typingWindowRows = 2;

export function computeTypingLineCapacity({
  usableWidth,
  characterWidth,
}: {
  usableWidth: number;
  characterWidth: number;
}): number {
  if (!Number.isFinite(usableWidth) || !Number.isFinite(characterWidth) || usableWidth <= 0 || characterWidth <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(usableWidth / (characterWidth * 1.125)));
}

export function buildTypingWindow(
  stream: StreamItem[],
  statuses: CharStatus[],
  position: number,
  lineLength = typingWindowLineLength,
  rowCount = typingWindowRows,
): TypingWindow {
  const cleanLineLength = Math.max(1, Math.floor(lineLength));
  const cleanRowCount = Math.max(1, Math.floor(rowCount));
  const windowSize = cleanLineLength * cleanRowCount;
  const clampedPosition = Math.max(0, Math.min(position, Math.max(0, stream.length - 1)));
  const rowStart = Math.floor(clampedPosition / cleanLineLength) * cleanLineLength;
  const preferredStart = Math.max(0, rowStart - cleanLineLength);
  const start = Math.max(0, Math.min(preferredStart, Math.max(0, stream.length - windowSize)));
  const end = Math.min(stream.length, start + windowSize);
  const items = stream.slice(start, end).map((item, offset) => {
    const index = start + offset;
    return {
      index,
      item,
      status: statuses[index] ?? "pending",
    };
  });

  return {
    start,
    end,
    rows: Array.from({ length: cleanRowCount }, (_, rowIndex) =>
      items.slice(rowIndex * cleanLineLength, (rowIndex + 1) * cleanLineLength),
    ),
  };
}

export function buildMeasuredTypingWindow(
  stream: StreamItem[],
  statuses: CharStatus[],
  position: number,
  metrics: TypingWidthMetrics,
  rowCount = typingWindowRows,
): TypingWindow {
  const cleanRowCount = Math.max(1, Math.floor(rowCount));
  const lines = splitMeasuredLines(stream, statuses, metrics);
  if (lines.length === 0) {
    return {
      start: 0,
      end: 0,
      rows: Array.from({ length: cleanRowCount }, () => []),
    };
  }

  const clampedPosition = Math.max(0, Math.min(position, Math.max(0, stream.length - 1)));
  const currentLineIndex = Math.max(
    0,
    lines.findIndex((line) => line.some((item) => item.index === clampedPosition)),
  );
  const startLineIndex = Math.max(0, Math.min(currentLineIndex - 1, Math.max(0, lines.length - cleanRowCount)));
  const rows = lines.slice(startLineIndex, startLineIndex + cleanRowCount);
  while (rows.length < cleanRowCount) {
    rows.push([]);
  }

  const visibleItems = rows.flat();
  return {
    start: visibleItems[0]?.index ?? 0,
    end: (visibleItems[visibleItems.length - 1]?.index ?? -1) + 1,
    rows,
  };
}

export function measureTypingWindowRowWidth(row: TypingWindowItem[], metrics: TypingWidthMetrics): number {
  return row.reduce((sum, item) => sum + typingItemWidth(item.item, metrics), 0);
}

function splitMeasuredLines(
  stream: StreamItem[],
  statuses: CharStatus[],
  metrics: TypingWidthMetrics,
): TypingWindowItem[][] {
  const maxLineWidth = Math.max(1, metrics.maxLineWidth);
  const lines: TypingWindowItem[][] = [];
  let currentLine: TypingWindowItem[] = [];
  let currentWidth = 0;

  stream.forEach((item, index) => {
    const width = Math.max(1, Math.min(typingItemWidth(item, metrics), maxLineWidth));
    if (currentLine.length > 0 && currentWidth + width > maxLineWidth) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }

    currentLine.push({
      index,
      item,
      status: statuses[index] ?? "pending",
    });
    currentWidth += width;
  });

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

function typingItemWidth(item: StreamItem, metrics: TypingWidthMetrics): number {
  if (item.isSpace) {
    return metrics.spaceWidth;
  }
  return metrics.characterWidths?.[item.char] ?? metrics.defaultCharacterWidth;
}
