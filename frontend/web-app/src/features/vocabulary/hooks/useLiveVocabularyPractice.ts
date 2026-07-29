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
  const socketRef = useRef<WebSocket | null>(null);
  const subscribedPracticeRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);

  const subscribePractice = useCallback((practiceId: string | undefined) => {
    const socket = socketRef.current;
    if (
      !practiceId
      || !socket
      || socket.readyState !== WebSocket.OPEN
      || subscribedPracticeRef.current === practiceId
    ) return;
    socket.send(JSON.stringify({ type: "vocabulary.practice.subscribe", practiceId }));
    subscribedPracticeRef.current = practiceId;
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    try {
      const active = await fetchActiveVocabularyPractice(lessonId);
      practiceRef.current = active;
      setPractice(active);
      subscribePractice(active?.id);
      return active;
    } finally {
      setLoading(false);
    }
  }, [enabled, lessonId, subscribePractice]);

  useEffect(() => {
    if (!enabled) {
      practiceRef.current = null;
      socketRef.current = null;
      subscribedPracticeRef.current = null;
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
      socketRef.current = nextSocket;
      nextSocket.onopen = () => {
        if (ownerSubject) {
          nextSocket.send(JSON.stringify({ type: "vocabulary.subscribe", ownerSubject, lessonId }));
        }
        subscribePractice(active?.id ?? practiceRef.current?.id);
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
          subscribePractice(message.practiceId ?? message.practice.id);
        }
      };
      nextSocket.onerror = () => nextSocket.close();
      nextSocket.onclose = () => {
        if (socketRef.current === nextSocket) socketRef.current = null;
        subscribedPracticeRef.current = null;
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
      socketRef.current = null;
      subscribedPracticeRef.current = null;
    };
  }, [enabled, lessonId, ownerSubject, refresh, subscribePractice]);

  function update(next: VocabularyPractice | null) {
    practiceRef.current = next;
    setPractice(next);
    subscribePractice(next?.id);
  }

  return { loading, practice, refresh, setPractice: update };
}
