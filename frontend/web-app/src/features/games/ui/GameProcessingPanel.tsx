import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { applyGameCandidate, gameCandidate, gameProcessing, requestGameProcessing, selectGameRevision, type GameProcessing, type LibraryGame } from "../../../shared/api/games";
import { HtmlGameFrame } from "../../materials/ui/blocks/HtmlGameFrame";

export function GameProcessingPanel({ game, kind, onSaved }: { game: LibraryGame; kind: "ADAPT" | "ENRICH"; onSaved: () => void }) {
  const { t } = useAppTranslation();
  const command = useRef(crypto.randomUUID());
  const [job, setJob] = useState<GameProcessing>();
  const [html, setHtml] = useState<string>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [applied, setApplied] = useState<LibraryGame>();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const deadline = Date.now() + 10 * 60_000;
    async function load() {
      try {
        const first = await requestGameProcessing(game, kind, command.current);
        async function poll(current: GameProcessing) {
          if (!active) return;
          setJob(current);
          if (!["PENDING", "RUNNING"].includes(current.status)) { if (current.status === "READY") onSaved(); return; }
          if (Date.now() > deadline) { setError(true); return; }
          timer = setTimeout(() => { void gameProcessing(game.id, current.id, controller.signal).then(poll).catch(() => { if (active) setError(true); }); }, 3000);
        }
        await poll(first);
      } catch { if (active) setError(true); }
    }
    setError(false); void load();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
    // The command stays stable during retries and the caller supplies a fixed selection.
  }, [game.id, game.revisionId, kind, retry]);
  async function perform(action: () => Promise<void>) { setBusy(true); setError(false); try { await action(); } catch { setError(true); } finally { setBusy(false); } }
  return <div className="space-y-3">
    <p role="status">{t(job?.status === "READY_FOR_REVIEW" ? "games.reviewCandidate" : job?.status === "READY" || applied ? "games.saved" : job?.status === "FAILED" ? "games.failed" : "games.processing")}</p>
    {error ? <p role="alert">{t("games.failed")} <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>{t("games.retry")}</Button></p> : null}
    {job?.status === "READY_FOR_REVIEW" && !applied ? <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void perform(async () => setHtml(await gameCandidate(game.id, job.id)))}>{t("games.preview")}</Button><Button type="button" disabled={busy} onClick={() => void perform(async () => { setApplied(await applyGameCandidate(game, job.id)); setHtml(undefined); onSaved(); })}>{t("games.acceptCandidate")}</Button></div> : null}
    {applied ? <Button type="button" disabled={busy} onClick={() => void perform(async () => { await selectGameRevision(applied, game.revisionId); setApplied(undefined); setJob(undefined); onSaved(); })}>{t("games.restoreSource")}</Button> : null}
    {html ? <HtmlGameFrame blockId={`candidate:${job?.id}`} html={html} contentState="ready" height={560} title={game.title} /> : null}
  </div>;
}
