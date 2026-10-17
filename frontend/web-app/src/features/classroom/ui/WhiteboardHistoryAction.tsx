import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { fetchLessonWhiteboards, type WhiteboardSummary } from "../../../shared/api/whiteboard";
import { useAppTranslation } from "../../../shared/i18n";
const SavedWhiteboardDialog = lazy(() => import("./SavedWhiteboardDialog").then(module => ({ default: module.SavedWhiteboardDialog })));

export function WhiteboardHistoryAction({ lessonId }: { lessonId: string }) {
  const { t } = useAppTranslation();
  const root = useRef<HTMLSpanElement>(null);
  const [boards, setBoards] = useState<WhiteboardSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false, loaded = false; setFailed(false); setBoards([]);
    const load = () => {
      if (loaded) return; loaded = true;
      void fetchLessonWhiteboards(lessonId).then(value => { if (!disposed) setBoards(value); }).catch(() => { if (!disposed) setFailed(true); });
    };
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) load(); }) : null;
    if (observer && root.current) observer.observe(root.current); else load();
    return () => { disposed = true; observer?.disconnect(); };
  }, [attempt, lessonId]);
  return <span ref={root} className="playsay-whiteboard-history-actions">
    {failed ? <button type="button" onClick={() => setAttempt(value => value + 1)}>{t("whiteboard.title")} · {t("whiteboard.retry")}</button> : null}
    {boards.map(board => <button key={board.id} type="button" onClick={() => setOpened(board.id)}>{t("whiteboard.title")}{board.studentName ? ` · ${board.studentName}` : ""}</button>)}
    {opened ? <Suspense fallback={<span role="status">{t("whiteboard.status.connecting")}</span>}><SavedWhiteboardDialog lessonId={lessonId} boardId={opened} onClose={() => setOpened(null)}/></Suspense> : null}
  </span>;
}
