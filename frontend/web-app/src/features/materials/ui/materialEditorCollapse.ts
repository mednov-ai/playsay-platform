export function resetMaterialBlockCollapse(): Set<string> {
  return new Set();
}

export function toggleMaterialBlockCollapse(current: ReadonlySet<string>, blockId: string): Set<string> {
  const next = new Set(current);
  if (next.has(blockId)) {
    next.delete(blockId);
  } else {
    next.add(blockId);
  }
  return next;
}
