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

export interface TypingFontStyles {
  font?: string | null;
  fontStyle?: string | null;
  fontVariant?: string | null;
  fontWeight?: string | null;
  fontSize?: string | null;
  lineHeight?: string | null;
  fontFamily?: string | null;
}

export interface BuildTypingWidthMetricsInput {
  maxLineWidth: number;
  fontSize: number;
  characters: Iterable<string>;
  measureText: (text: string) => number;
}

export const typingWindowLineLength = 48;
export const typingWindowRows = 1;
export const typingSpaceEm = 0.58;

const sampleWideCharacters = ["w", "m", "ш", "щ", "W"];

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

export function buildCanvasFont(styles: TypingFontStyles): string {
  const shorthand = styles.font?.trim();
  if (shorthand) {
    return shorthand;
  }

  const fontStyle = styles.fontStyle?.trim();
  const fontVariant = styles.fontVariant?.trim();
  const fontWeight = styles.fontWeight?.trim() || "400";
  const fontSize = styles.fontSize?.trim() || "16px";
  const lineHeight = styles.lineHeight?.trim();
  const sizeWithLineHeight = lineHeight && lineHeight !== "normal" ? `${fontSize}/${lineHeight}` : fontSize;
  const fontFamily = styles.fontFamily?.trim() || "sans-serif";
  const fontParts = [];
  if (fontStyle && fontStyle !== "normal") {
    fontParts.push(fontStyle);
  }
  if (fontVariant && fontVariant !== "normal" && fontVariant !== "none") {
    fontParts.push(fontVariant);
  }
  fontParts.push(fontWeight, sizeWithLineHeight, fontFamily);

  return fontParts.join(" ");
}

export function buildTypingWidthMetrics({
  maxLineWidth,
  fontSize,
  characters,
  measureText,
}: BuildTypingWidthMetricsInput): TypingWidthMetrics {
  const characterWidths: Record<string, number> = {};
  const measuredWideCharacterWidth = sampleWideCharacters.reduce(
    (maxWidth, char) => Math.max(maxWidth, measureText(char)),
    0,
  );
  const defaultCharacterWidth = Math.max(1, measuredWideCharacterWidth, fontSize * 0.58);

  Array.from(new Set(characters)).forEach((char) => {
    if (char === " ") {
      return;
    }
    characterWidths[char] = Math.max(1, measureText(char));
  });

  return {
    maxLineWidth: Math.max(1, maxLineWidth),
    defaultCharacterWidth,
    spaceWidth: Math.max(1, fontSize * typingSpaceEm),
    characterWidths,
  };
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
  const contextLineCount = Math.max(0, cleanRowCount - 1);
  const startLineIndex = Math.max(0, Math.min(currentLineIndex - contextLineCount, Math.max(0, lines.length - cleanRowCount)));
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
  const units = buildMeasuredUnits(stream, statuses, metrics);
  let currentLine: TypingWindowItem[] = [];
  let currentWidth = 0;

  units.forEach((unit) => {
    let nextItems = unit.items;
    let nextWidth = unit.width;

    if (currentLine.length > 0 && currentWidth + nextWidth > maxLineWidth) {
      const trailingSpaces = takeTrailingSpaces(nextItems);
      const tokenItemsBeforeTrailingSpace = nextItems.slice(0, nextItems.length - trailingSpaces.length);
      const tokenWidthBeforeTrailingSpace = measureTypingWindowRowWidth(tokenItemsBeforeTrailingSpace, metrics);

      if (
        trailingSpaces.length > 0 &&
        tokenItemsBeforeTrailingSpace.length > 0 &&
        currentWidth + tokenWidthBeforeTrailingSpace <= maxLineWidth
      ) {
        currentLine.push(...tokenItemsBeforeTrailingSpace);
        lines.push(currentLine);
        currentLine = trailingSpaces;
        currentWidth = measureTypingWindowRowWidth(currentLine, metrics);
        return;
      }

      const leadingSpaces = takeLeadingSpaces(nextItems);
      const tokenItems = nextItems.slice(leadingSpaces.length);
      const leadingSpaceWidth = measureTypingWindowRowWidth(leadingSpaces, metrics);

      if (leadingSpaces.length > 0 && currentWidth + leadingSpaceWidth <= maxLineWidth) {
        currentLine.push(...leadingSpaces);
        currentWidth += leadingSpaceWidth;
        nextItems = tokenItems;
        nextWidth = measureTypingWindowRowWidth(nextItems, metrics);
      }

      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }

    if (nextItems.length === 0) {
      return;
    }

    currentLine.push(...nextItems);
    currentWidth += nextWidth;
  });

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  mergeShortFinalLine(lines, metrics);

  return lines;
}

function buildMeasuredUnits(
  stream: StreamItem[],
  statuses: CharStatus[],
  metrics: TypingWidthMetrics,
): Array<{ items: TypingWindowItem[]; width: number }> {
  const units: Array<{ items: TypingWindowItem[]; width: number }> = [];
  let index = 0;

  while (index < stream.length) {
    const items: TypingWindowItem[] = [];

    if (stream[index].isSpace) {
      while (index < stream.length && stream[index].isSpace) {
        items.push(toWindowItem(stream[index], statuses, index));
        index += 1;
      }
    } else {
      while (index < stream.length && !stream[index].isSpace) {
        items.push(toWindowItem(stream[index], statuses, index));
        index += 1;
      }

      while (index < stream.length && stream[index].isSpace) {
        items.push(toWindowItem(stream[index], statuses, index));
        index += 1;
      }
    }

    if (items.length === 0) {
      continue;
    }

    units.push({
      items,
      width: Math.max(1, measureTypingWindowRowWidth(items, metrics)),
    });
  }

  return units;
}

function takeLeadingSpaces(items: TypingWindowItem[]): TypingWindowItem[] {
  const spaces: TypingWindowItem[] = [];
  for (const item of items) {
    if (!item.item.isSpace) {
      break;
    }
    spaces.push(item);
  }
  return spaces;
}

function takeTrailingSpaces(items: TypingWindowItem[]): TypingWindowItem[] {
  const spaces: TypingWindowItem[] = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!items[index].item.isSpace) {
      break;
    }
    spaces.unshift(items[index]);
  }
  return spaces;
}

function toWindowItem(streamItem: StreamItem, statuses: CharStatus[], index: number): TypingWindowItem {
  return {
    index,
    item: streamItem,
    status: statuses[index] ?? "pending",
  };
}

function typingItemWidth(item: StreamItem, metrics: TypingWidthMetrics): number {
  if (item.isSpace) {
    return metrics.spaceWidth;
  }
  return metrics.characterWidths?.[item.char] ?? metrics.defaultCharacterWidth;
}

function mergeShortFinalLine(lines: TypingWindowItem[][], metrics: TypingWidthMetrics): void {
  if (lines.length < 2) {
    return;
  }

  const finalLine = lines[lines.length - 1];
  if (finalLine.length === 0 || finalLine.length > 2) {
    return;
  }

  const previousLine = lines[lines.length - 2];
  const mergedWidth = measureTypingWindowRowWidth(previousLine, metrics) + measureTypingWindowRowWidth(finalLine, metrics);
  if (mergedWidth > Math.max(1, metrics.maxLineWidth)) {
    return;
  }

  previousLine.push(...finalLine);
  lines.pop();
}
