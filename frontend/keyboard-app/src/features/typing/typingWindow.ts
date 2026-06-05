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

  return Math.max(1, Math.floor(usableWidth / characterWidth));
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
