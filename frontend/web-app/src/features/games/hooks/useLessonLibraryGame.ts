import { useCallback, useEffect, useRef, useState } from "react";
import { currentLessonGame, startLessonGame, stopLessonGame, type GameLaunch, type LibraryGame } from "../../../shared/api/games";
import { isApiStatus } from "../../../shared/api/errors";

export function useLessonLibraryGame(lessonId: string, enabled: boolean) {
  const [launch, setLaunch] = useState<GameLaunch | null>(null);
  const [error, setError] = useState(false);
  const [canControl, setCanControl] = useState(false);
  const [protocolReady, setProtocolReady] = useState(true);
  const revision = useRef(-1);
  const epoch = useRef(0);
  const startCommand = useRef({ selection: "", commandId: crypto.randomUUID() });
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = epoch.current;
    try {
      const state = await currentLessonGame(lessonId);
      if (current !== epoch.current || state.revision < revision.current) return;
      revision.current = state.revision;
      setLaunch(state.launch ?? null); setCanControl(Boolean(state.canControl)); setProtocolReady(state.protocolReady !== false); setError(false);
    } catch (caught) {
      if (current !== epoch.current) return;
      if ([401, 403, 404].some((status) => isApiStatus(caught, status))) { setLaunch(null); setCanControl(false); }
      setError(true);
    }
  }, [enabled, lessonId]);
  useEffect(() => {
    epoch.current++; revision.current = -1; setLaunch(null); setCanControl(false); setError(false);
    if (!enabled) return;
    void refresh();
    function changed(event: Event) { if ((event as CustomEvent<string>).detail === lessonId) void refresh(); }
    function resumed() { if (document.visibilityState !== "hidden") void refresh(); }
    window.addEventListener("honey-school:lesson-game-changed", changed);
    window.addEventListener("online", resumed);
    window.addEventListener("pageshow", resumed);
    document.addEventListener("visibilitychange", resumed);
    return () => { epoch.current++; window.removeEventListener("honey-school:lesson-game-changed", changed); window.removeEventListener("online", resumed); window.removeEventListener("pageshow", resumed); document.removeEventListener("visibilitychange", resumed); };
  }, [enabled, lessonId, refresh]);
  async function start(game: LibraryGame) {
    const selection = `${lessonId}:${game.id}:${game.revisionId}`;
    if (startCommand.current.selection !== selection) startCommand.current = { selection, commandId: crypto.randomUUID() };
    const current = epoch.current;
    const accepted = await startLessonGame(lessonId, game, startCommand.current.commandId);
    if (current !== epoch.current) return;
    revision.current = Math.max(revision.current, accepted.presentationRevision ?? 0);
    startCommand.current = { selection: "", commandId: crypto.randomUUID() };
    await refresh();
  }
  async function stop(launchId: string) {
    const current = epoch.current;
    const accepted = await stopLessonGame(lessonId, launchId);
    if (current !== epoch.current) return;
    if ((accepted.presentationRevision ?? 0) >= revision.current) {
      revision.current = accepted.presentationRevision ?? revision.current;
      setLaunch((value) => value?.id === launchId ? null : value);
    }
    await refresh();
  }
  return { launch, error, canControl, protocolReady, refresh, start, stop };
}
