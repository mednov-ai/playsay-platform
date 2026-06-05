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

export function buildTypingWindow(
  stream: StreamItem[],
  statuses: CharStatus[],
  position: number,
  lineLength = typingWindowLineLength,
  rowCount = typingWindowRows,
): TypingWindow {
  const windowSize = lineLength * rowCount;
  const clampedPosition = Math.max(0, Math.min(position, Math.max(0, stream.length - 1)));
  const focusOffset = Math.min(lineLength - 1, 6);
  const start = Math.max(0, Math.min(clampedPosition - focusOffset, Math.max(0, stream.length - windowSize)));
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
    rows: Array.from({ length: rowCount }, (_, rowIndex) =>
      items.slice(rowIndex * lineLength, (rowIndex + 1) * lineLength),
    ),
  };
}
