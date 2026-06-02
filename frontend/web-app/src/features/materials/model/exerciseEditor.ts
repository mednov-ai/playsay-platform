import type { MaterialExerciseItem } from "./types";

export function materialItemThreadRootId(item: MaterialExerciseItem, index: number): string {
  return item.threadRootItemId ?? item.id ?? `item-${index}`;
}

export function materialPromptRows(value: string): number {
  const rows = value
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / 24)), 0);
  return Math.min(10, Math.max(2, rows));
}
