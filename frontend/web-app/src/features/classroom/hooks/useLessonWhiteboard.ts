import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ensureLessonWhiteboard, fetchWhiteboardContext, updateLessonWhiteboard, type LessonWhiteboard, type WhiteboardCommand } from "../../../shared/api/whiteboard";
import { WhiteboardRuntime } from "../model/whiteboardRuntime";

export function useLessonWhiteboard(lessonId: string, studentSubject: string | null) {
  const [board, setBoard] = useState<LessonWhiteboard | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const mutating = useRef(false);
  const request = useRef(0);
  const currentBoard = useRef(board); currentBoard.current = board;
  const refresh = useCallback(async (preserveError = false) => {
    if (mutating.current) return;
    const epoch = generation.current, sequence = ++request.current;
    try {
      const value = await fetchWhiteboardContext(lessonId, studentSubject);
      if (generation.current !== epoch || request.current !== sequence) return;
      setEnabled(value.enabled);
      setBoard(current => current && value.board && current.id === value.board.id && current.controlRevision > value.board.controlRevision ? current : value.board);
      if (!preserveError) setError(false);
    } catch { if (generation.current === epoch && request.current === sequence) setError(true); }
  }, [lessonId, studentSubject]);
  useEffect(() => {
    generation.current++; mutating.current = false; setBoard(null); setEnabled(false); setError(false); setPending(false);
    void refresh();
    const updated = (event: Event) => { if ((event as CustomEvent<string>).detail === lessonId) void refresh(); };
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("honey-whiteboard-changed", updated);
    window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
    const interval = window.setInterval(wake, 15000);
    return () => { generation.current++; window.clearInterval(interval); window.removeEventListener("honey-whiteboard-changed", updated); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); };
  }, [lessonId, refresh]);
  const mutate = useCallback(async (command?: WhiteboardCommand) => {
    if (mutating.current) return;
    mutating.current = true;
    const epoch = generation.current; setPending(true); setError(false); ++request.current;
    try {
      const current = currentBoard.current;
      if (command && !current) return;
      const value = command && current ? await updateLessonWhiteboard(current, command) : await ensureLessonWhiteboard(lessonId, studentSubject);
      if (generation.current === epoch) setBoard(value);
    } catch { if (generation.current === epoch) { setError(true); } }
    finally { if (generation.current === epoch) { mutating.current = false; ++request.current; setPending(false); void refresh(true); } }
  }, [lessonId, refresh, studentSubject]);
  return { board, enabled, pending, error, refresh, present: () => mutate(), update: mutate,
    active: Boolean(enabled && board?.activeSurface === "WHITEBOARD" && !board.readOnly) };
}

const runtimes = new Map<string, WhiteboardRuntime>();
export function useWhiteboardPresentation(lessonId: string, enabled: boolean): boolean {
  const [presented, setPresented] = useState(false);
  useEffect(() => {
    if (!enabled) { setPresented(false); return; }
    setPresented(false);
    let disposed = false;
    const refresh = () => void fetchWhiteboardContext(lessonId).then(value => {
      if (!disposed) setPresented(Boolean(value.enabled && value.board?.activeSurface === "WHITEBOARD" && !value.board.readOnly));
    }).catch(() => undefined);
    refresh();
    const event = (event: Event) => { if ((event as CustomEvent<string>).detail === lessonId) refresh(); };
    window.addEventListener("honey-whiteboard-changed", event); window.addEventListener("online", refresh);
    const interval = window.setInterval(refresh, 15000);
    return () => { disposed = true; window.clearInterval(interval); window.removeEventListener("honey-whiteboard-changed", event); window.removeEventListener("online", refresh); };
  }, [enabled, lessonId]);
  return presented;
}
export function useWhiteboardRuntime(board: LessonWhiteboard, actor: string, name: string, active: boolean) {
  const key = `${actor}/${board.document.id}${board.readOnly ? `/v${board.document.version}` : ""}`;
  const runtimeRef = useRef<{ key: string; runtime: WhiteboardRuntime } | null>(null);
  if (!runtimeRef.current || runtimeRef.current.key !== key) {
    let runtime = runtimes.get(key);
    if (!runtime) {
      runtime = new WhiteboardRuntime(board, actor, name);
      // Saved inactive runtimes can be reconstructed from their durable snapshot.
      // Never evict an unsaved runtime silently. Refuse another context at the budget.
      for (const [cachedKey, cached] of runtimes) {
        if (cached.reclaimable || (cached.board.id === board.id && cached.board.contentEpoch < board.contentEpoch)) { cached.dispose(); runtimes.delete(cachedKey); }
      }
      if (runtimes.size >= 16) runtime.failCapacity();
      else runtimes.set(key, runtime);
    }
    runtimeRef.current = { key, runtime };
  }
  const runtime = runtimeRef.current.runtime;
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  useEffect(() => {
    if (active && !board.readOnly) runtime.activate();
    else runtime.pause();
    return () => { runtime.pause(); if (!runtimes.has(key)) runtime.dispose(); };
  }, [active, board.readOnly, key, runtime]);
  return { runtime, ...state };
}
