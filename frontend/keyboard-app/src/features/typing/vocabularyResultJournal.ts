export type VocabularyTargetJournalEntry = {
  targetId: string;
  position: number;
  errors: number;
  durationMs: number;
};

type JournalStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
const prefix = "honey.key.vocabulary.target.";

function browserStorage(): JournalStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function entryKey(sessionId: string, targetId: string): string {
  return `${prefix}${sessionId}.${targetId}`;
}

function validEntry(value: unknown): value is VocabularyTargetJournalEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<VocabularyTargetJournalEntry>;
  return typeof entry.targetId === "string" && entry.targetId.length > 0 &&
    Number.isSafeInteger(entry.position) && entry.position! >= 0 &&
    Number.isSafeInteger(entry.errors) && entry.errors! >= 0 && entry.errors! <= 999 &&
    Number.isSafeInteger(entry.durationMs) && entry.durationMs! >= 0 && entry.durationMs! <= 3_600_000;
}

function parseEntry(raw: string | null): VocabularyTargetJournalEntry | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return validEntry(value) ? value : null;
  } catch {
    return null;
  }
}

export function readVocabularyTargetJournal(sessionId: string, storage: JournalStorage | null = browserStorage()): VocabularyTargetJournalEntry[] {
  if (!storage) return [];
  try {
    const sessionPrefix = `${prefix}${sessionId}.`;
    const entries: VocabularyTargetJournalEntry[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(sessionPrefix)) continue;
      const entry = parseEntry(storage.getItem(key));
      if (entry && key === entryKey(sessionId, entry.targetId)) entries.push(entry);
    }
    return entries.sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

export function queueVocabularyTarget(sessionId: string, entry: VocabularyTargetJournalEntry, storage: JournalStorage | null = browserStorage()): boolean {
  if (!storage || !validEntry(entry)) return false;
  try {
    const key = entryKey(sessionId, entry.targetId);
    const existing = parseEntry(storage.getItem(key));
    if (!existing) storage.setItem(key, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

export function removeVocabularyTarget(sessionId: string, targetId: string, storage: JournalStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(entryKey(sessionId, targetId));
  } catch {
    // A confirmed result may be retried; server deduplication makes the retry safe.
  }
}

export async function flushVocabularyTargetJournal(
  sessionId: string,
  send: (entry: VocabularyTargetJournalEntry) => Promise<{ targetId: string }>,
  storage: JournalStorage | null = browserStorage(),
): Promise<void> {
  for (const entry of readVocabularyTargetJournal(sessionId, storage)) {
    const receipt = await send(entry);
    if (receipt.targetId !== entry.targetId) throw new Error("Vocabulary target receipt mismatch");
    removeVocabularyTarget(sessionId, entry.targetId, storage);
  }
}
