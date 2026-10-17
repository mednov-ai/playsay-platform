import { useEffect, useRef, useState } from "react";
import { fetchLessonWhiteboard, type LessonWhiteboard as Board } from "../../../shared/api/whiteboard";
import { useAppTranslation } from "../../../shared/i18n";
import { LessonWhiteboard } from "./LessonWhiteboard";

export function SavedWhiteboardDialog({ lessonId, boardId, onClose }: { lessonId: string; boardId: string; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let disposed = false; setBoard(null); setFailed(false);
    void fetchLessonWhiteboard(lessonId, boardId).then(value => { if (!disposed) setBoard(value); }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, [attempt, boardId, lessonId]);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; closeButton.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="playsay-whiteboard-history-backdrop">
    <section className="playsay-whiteboard-history-dialog" role="dialog" aria-modal="true" aria-label={t("whiteboard.readOnly")}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key === "Tab") {
          const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"],input:not(:disabled),select:not(:disabled)')];
          if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1]?.focus(); }
          else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0]?.focus(); }
        }
      }}>
      <header><span>{t("whiteboard.readOnly")}</span><button type="button" ref={closeButton} onClick={onClose}>{t("whiteboard.close")}</button></header>
      {failed ? <div role="alert">{t("whiteboard.failed")} <button type="button" onClick={() => setAttempt(a => a + 1)}>{t("whiteboard.retry")}</button></div>
        : board ? <LessonWhiteboard key={board.document.id} board={{ ...board, readOnly: true, canDraw: false, canManage: false }} actor="history-viewer" name="" active={false} targetLabel={t("whiteboard.title")}/>
          : <p role="status">{t("whiteboard.status.connecting")}</p>}
    </section>
  </div>;
}
