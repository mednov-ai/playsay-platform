import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchActiveVocabularyPractice,
  openVocabularySocket,
  type VocabularyPractice,
  type VocabularyRealtimeMessage,
} from "../../../shared/api/playsay";

export function useLiveVocabularyPractice({
  enabled = true,
  lessonId,
  ownerSubject,
}: {
  enabled?: boolean;
  lessonId: string;
  ownerSubject?: string;
}) {
  const [practice, setPractice] = useState<VocabularyPractice | null>(null);
  const practiceRef = useRef<VocabularyPractice | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    try {
      const active = await fetchActiveVocabularyPractice(lessonId);
      practiceRef.current = active;
      setPractice(active);
      return active;
    } finally {
      setLoading(false);
    }
  }, [enabled, lessonId]);

  useEffect(() => {
    if (!enabled) {
      practiceRef.current = null;
      setPractice(null);
      setLoading(false);
      return undefined;
    }
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    async function connect() {
      const active = await refresh().catch(() => null);
      const nextSocket = await openVocabularySocket();
      if (stopped || !nextSocket) return;
      socket = nextSocket;
      nextSocket.onopen = () => {
        if (ownerSubject) {
          nextSocket.send(JSON.stringify({ type: "vocabulary.subscribe", ownerSubject, lessonId }));
        }
        const activeId = active?.id ?? practiceRef.current?.id;
        if (activeId) {
          nextSocket.send(JSON.stringify({ type: "vocabulary.practice.subscribe", practiceId: activeId }));
        }
      };
      nextSocket.onmessage = (event) => {
        let message: VocabularyRealtimeMessage;
        try {
          message = JSON.parse(event.data as string) as VocabularyRealtimeMessage;
        } catch {
          return;
        }
        if (message.practice) {
          practiceRef.current = message.practice;
          setPractice(message.practice);
          if (message.practiceId && message.practiceId !== active?.id) {
            nextSocket.send(JSON.stringify({ type: "vocabulary.practice.subscribe", practiceId: message.practiceId }));
          }
        }
      };
      nextSocket.onerror = () => nextSocket.close();
      nextSocket.onclose = () => {
        if (stopped) return;
        reconnectTimer = window.setTimeout(() => { void connect(); }, 2_000);
      };
    }

    void connect();
    const fallback = window.setInterval(() => { void refresh(); }, 15_000);
    return () => {
      stopped = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.clearInterval(fallback);
      socket?.close();
    };
  }, [enabled, lessonId, ownerSubject, refresh]);

  function update(next: VocabularyPractice | null) {
    practiceRef.current = next;
    setPractice(next);
  }

  return { loading, practice, refresh, setPractice: update };
}
