import type { MaterialMatchingPair, MaterialRenderMode } from "./types";

export function matchingRightOptionsForMode(
  pairs: MaterialMatchingPair[],
  mode: MaterialRenderMode,
): MaterialMatchingPair[] {
  if (mode === "teacherPreview") {
    return [...pairs];
  }

  return derangeMatchingRightOptions(pairs);
}

function derangeMatchingRightOptions(pairs: MaterialMatchingPair[]): MaterialMatchingPair[] {
  if (pairs.length <= 1) {
    return [...pairs];
  }

  const ordered = pairs
    .map((pair, sourceIndex) => ({
      pair,
      sourceIndex,
      sortKey: matchingPairSortKey(pair, sourceIndex),
    }))
    .sort((left, right) => left.sortKey - right.sortKey || left.sourceIndex - right.sourceIndex);

  for (let offset = 0; offset < ordered.length; offset += 1) {
    const candidate = rotateMatchingOptions(ordered, offset);
    if (candidate.every((item, rowIndex) => item.sourceIndex !== rowIndex)) {
      return candidate.map((item) => item.pair);
    }
  }

  return rotateMatchingOptions(ordered, 1).map((item) => item.pair);
}

function matchingPairSortKey(pair: MaterialMatchingPair, sourceIndex: number): number {
  return `${pair.id}:${pair.left}:${pair.right}:${sourceIndex}`.split("").reduce((hash, char) => (
    (hash * 31 + char.charCodeAt(0)) % 10_000
  ), 7);
}

function rotateMatchingOptions<T>(items: T[], offset: number): T[] {
  if (items.length === 0) {
    return [];
  }
  const normalizedOffset = offset % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}
