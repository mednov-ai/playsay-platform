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
  const [error, setError] = useState(false);
  const context = `${enabled}:${lessonId}:${ownerSubject ?? ""}`;
  const contextRef = useRef(context);
  contextRef.current = context;
  const requestSequence = useRef(0);

  const accept = useCallback((next: VocabularyPractice | null) => {
    const previous = practiceRef.current;
    if (next && previous?.id === next.id) {
      if (Date.parse(next.updatedAt) < Date.parse(previous.updatedAt)) return;
      next = { ...next, sessions: next.sessions.map((session) => {
        const current = previous.sessions.find((candidate) => candidate.id === session.id);
        return current && current.revision > session.revision ? current : session;
      }) };
    }
    practiceRef.current = next;
    setPractice(next);
  }, []);

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
    const sequence = ++requestSequence.current;
    try {
      const active = await fetchActiveVocabularyPractice(lessonId);
      if (contextRef.current !== context || sequence !== requestSequence.current) return null;
      accept(active);
      setError(false);
      subscribePractice(active?.id);
      return active;
    } catch {
      if (contextRef.current === context) setError(true);
      return null;
    } finally {
      if (contextRef.current === context) setLoading(false);
    }
  }, [accept, context, enabled, lessonId, subscribePractice]);

  useEffect(() => {
    if (!enabled) {
      practiceRef.current = null;
      socketRef.current = null;
      subscribedPracticeRef.current = null;
      setPractice(null);
      setLoading(false);
      return undefined;
    }
    accept(null);
    setLoading(true);
    setError(false);
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    async function connect() {
      const active = await refresh();
      if (stopped) return;
      const nextSocket = await openVocabularySocket().catch(() => null);
      if (stopped || contextRef.current !== context) { nextSocket?.close(); return; }
      if (!nextSocket) {
        setError(true);
        reconnectTimer = window.setTimeout(() => { void connect(); }, 2_000);
        return;
      }
      socket = nextSocket;
      socketRef.current = nextSocket;
      nextSocket.onopen = () => {
        if (stopped || contextRef.current !== context) { nextSocket.close(); return; }
        if (ownerSubject) {
          nextSocket.send(JSON.stringify({ type: "vocabulary.subscribe", ownerSubject, lessonId }));
        }
        subscribePractice(active?.id ?? practiceRef.current?.id);
      };
      nextSocket.onmessage = (event) => {
        if (stopped || contextRef.current !== context) return;
        let message: VocabularyRealtimeMessage;
        try {
          message = JSON.parse(event.data as string) as VocabularyRealtimeMessage;
        } catch {
          return;
        }
        if (message.practice) {
          requestSequence.current += 1;
          accept(message.practice);
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
      requestSequence.current += 1;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.clearInterval(fallback);
      socket?.close();
      socketRef.current = null;
      subscribedPracticeRef.current = null;
    };
  }, [accept, context, enabled, lessonId, ownerSubject, refresh, subscribePractice]);

  function update(next: VocabularyPractice | null) {
    requestSequence.current += 1;
    accept(next);
    subscribePractice(next?.id);
  }

  return { error, loading, practice, refresh, setPractice: update };
}
