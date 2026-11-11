import { useCallback, useEffect, useState } from "react";
import { recordVocabularyTarget } from "../../shared/api/keyboardApi";
import { useTypingStore } from "./typingStore";
import { readVocabularyTargetJournal, removeVocabularyTarget, type VocabularyTargetJournalEntry } from "./vocabularyResultJournal";

export type VocabularyTargetDeliveryStatus = "idle" | "pending" | "saved" | "offline" | "unsaved";
const retryDelayMs = 5_000;

export function useVocabularyTargetDelivery(sessionId: string | undefined, enabled: boolean, completedCount: number) {
  const pendingInMemory = useTypingStore((state) => state.pendingVocabularyTargets);
  const [status, setStatus] = useState<VocabularyTargetDeliveryStatus>("idle");
  const [retryVersion, setRetryVersion] = useState(0);
  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);
  const localEntries = sessionId && enabled ? readVocabularyTargetJournal(sessionId) : [];
  const hasPending = Boolean(sessionId && enabled && (localEntries.length || pendingInMemory.some((entry) => entry.sessionId === sessionId)));

  useEffect(() => {
    if (!sessionId || !enabled) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    let retryTimer: number | undefined;

    const deliver = async () => {
      const persisted = readVocabularyTargetJournal(sessionId);
      const memory = useTypingStore.getState().pendingVocabularyTargets.filter((entry) => entry.sessionId === sessionId);
      const entries = new Map<string, VocabularyTargetJournalEntry>();
      persisted.forEach((entry) => entries.set(entry.targetId, entry));
      memory.forEach((entry) => { if (!entries.has(entry.targetId)) entries.set(entry.targetId, entry); });
      if (!entries.size) {
        if (!cancelled) setStatus("idle");
        return;
      }
      if (!cancelled) setStatus("pending");
      try {
        for (const entry of [...entries.values()].sort((a, b) => a.position - b.position)) {
          const receipt = await recordVocabularyTarget(sessionId, { targetId: entry.targetId, errors: entry.errors, durationMs: entry.durationMs });
          if (receipt.targetId !== entry.targetId) throw new Error("Vocabulary target receipt mismatch");
          removeVocabularyTarget(sessionId, entry.targetId);
          useTypingStore.getState().discardPendingVocabularyTarget(sessionId, entry.targetId);
        }
        if (!cancelled) setStatus("saved");
      } catch {
        if (!cancelled) {
          const stillUnstored = useTypingStore.getState().pendingVocabularyTargets.some((entry) => entry.sessionId === sessionId && !entry.persisted);
          setStatus(stillUnstored ? "unsaved" : "offline");
          retryTimer = window.setTimeout(() => void deliver(), retryDelayMs);
        }
      }
    };
    void deliver();
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
    };
  }, [completedCount, enabled, retryVersion, sessionId]);

  return { hasPending, status: hasPending && status === "idle" ? "pending" as const : status, retry };
}
