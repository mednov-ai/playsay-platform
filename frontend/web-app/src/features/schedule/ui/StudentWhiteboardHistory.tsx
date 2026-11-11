import { lazy, Suspense, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { fetchWhiteboardLibraryPage, type WhiteboardLibraryItem } from "../../../shared/api/whiteboard";
import { useAppTranslation } from "../../../shared/i18n";

const PAGE_SIZE = 25;

const SavedWhiteboardDialog = lazy(() => import("../../classroom/ui/SavedWhiteboardDialog").then((module) => ({ default: module.SavedWhiteboardDialog })));

export function StudentWhiteboardHistory() {
  const { t, i18n } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [boards, setBoards] = useState<WhiteboardLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<WhiteboardLibraryItem | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBoards([]);
    setFailed(false);
    setLoading(true);
    void fetchWhiteboardLibraryPage(page * PAGE_SIZE, PAGE_SIZE).then((result) => {
      if (!cancelled) {
        setBoards(result.items);
        setTotal(result.total);
      }
    }).catch(() => {
      if (!cancelled) setFailed(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [attempt, open, page]);

  return (
    <details className="playsay-schedule-archive" onToggle={(event) => {
      const nextOpen = event.currentTarget.open;
      setOpen(nextOpen);
      if (!nextOpen) {
        setSelected(null);
        setPage(0);
      }
    }}>
      <summary>{t("whiteboard.historyTitle")}<ChevronDown aria-hidden="true" className="h-4 w-4" /></summary>
      <div className="grid gap-2 p-3">
        <p>{t("whiteboard.historyDescription")}</p>
        {loading ? <p role="status">{t("whiteboard.status.connecting")}</p> : null}
        {failed ? <div role="alert" className="flex flex-wrap items-center gap-2"><span>{t("whiteboard.historyLoadFailed")}</span><Button type="button" variant="outline" className="min-h-11" onClick={() => setAttempt((value) => value + 1)}>{t("whiteboard.retry")}</Button></div> : null}
        {!loading && !failed && boards.length === 0 ? <p>{t("whiteboard.historyEmpty")}</p> : null}
        {boards.map((board) => (
          <button className="playsay-material-list-item" key={board.id} onClick={() => setSelected(board)} type="button">
            <span className="min-w-0 break-words font-bold">{board.title || t("whiteboard.title")}</span>
            <span className="text-xs">{new Date(board.createdAt).toLocaleDateString(i18n.language)}</span>
          </button>
        ))}
        {total > PAGE_SIZE ? (
          <nav aria-label={t("whiteboard.historyPages")} className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="min-h-11 aria-disabled:opacity-50" aria-disabled={loading || page === 0} onClick={() => { if (!loading && page > 0) setPage((value) => value - 1); }}>{t("whiteboard.historyPrevious")}</Button>
            <span aria-live="polite">{t("whiteboard.historyPage", { current: page + 1, total: Math.ceil(total / PAGE_SIZE) })}</span>
            <Button type="button" variant="outline" className="min-h-11 aria-disabled:opacity-50" aria-disabled={loading || (page + 1) * PAGE_SIZE >= total} onClick={() => { if (!loading && (page + 1) * PAGE_SIZE < total) setPage((value) => value + 1); }}>{t("whiteboard.historyNext")}</Button>
          </nav>
        ) : null}
      </div>
      {selected ? (
        <Suspense fallback={<p role="status">{t("whiteboard.status.connecting")}</p>}>
          <SavedWhiteboardDialog boardId={selected.id} lessonId={selected.lessonId} onClose={() => setSelected(null)} />
        </Suspense>
      ) : null}
    </details>
  );
}
