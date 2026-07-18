export function resetExpandedMaterialBlock(): string | null {
  return null;
}

export function toggleExpandedMaterialBlock(current: string | null, blockId: string): string | null {
  return current === blockId ? null : blockId;
}
