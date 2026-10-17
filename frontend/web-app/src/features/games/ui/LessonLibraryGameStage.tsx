import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { lessonGameContent, lessonGameDocument, type GameLaunch } from "../../../shared/api/games";
import type { CollaborationDocument } from "../../../shared/api/playsay";
import { useYjsWorkspace } from "../../classroom/hooks/useYjsWorkspace";
import { collaborationParticipantColor } from "../../classroom/model/collaboration";
import { HtmlGameFrame } from "../../materials/ui/blocks/HtmlGameFrame";

export function LessonLibraryGameStage({ launch, name, authority, protocolReady, minimized, suspended = false, onMinimize, onStop }: { launch: GameLaunch; name: string; authority: boolean; protocolReady: boolean; minimized: boolean; suspended?: boolean; onMinimize: (value: boolean) => void; onStop: () => Promise<void> }) {
  const { t } = useAppTranslation();
  const [document, setDocument] = useState<CollaborationDocument | null>(null);
  const [html, setHtml] = useState<string>();
  const [error, setError] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [retry, setRetry] = useState(0);
  const [resuming, setResuming] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setDocument(null); setHtml(undefined); setError(false);
    void Promise.all([lessonGameDocument(launch.lessonId, launch.id, controller.signal), lessonGameContent(launch.lessonId, launch.id, controller.signal)]).then(([nextDocument, nextHtml]) => { if (active) { setDocument(nextDocument); setHtml(nextHtml); } }).catch(() => { if (active) setError(true); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [launch.id, launch.lessonId, retry]);
  const workspace = useYjsWorkspace({ color: collaborationParticipantColor(name), document, participantName: name, enabled: Boolean(document), suspended });
  const sync = useMemo(() => workspace.htmlGameSync(authority), [workspace.htmlGameSync, authority]);
  const [retainedSync, setRetainedSync] = useState<ReturnType<typeof workspace.htmlGameSync> | null>(null);
  const blockId = `library-launch:${launch.id}`;
  useEffect(() => {
    if (suspended) setResuming(true);
    else if (html && workspace.connected && sync.presentedBlockId === blockId && (authority || sync.authorityRuns[blockId])) { setRetainedSync(sync); setResuming(false); }
  }, [authority, blockId, html, suspended, sync, workspace.connected]);
  const preserveFrame = retainedSync !== null && (suspended || resuming);
  const frameSync = preserveFrame ? retainedSync : sync;
  useEffect(() => { if (!suspended && authority && workspace.connected && sync.presentedBlockId !== blockId) sync.setPresentedBlock(blockId); }, [authority, blockId, sync, workspace.connected, suspended]);
  const runtimeFailed = workspace.status === "error";
  async function stop() { if (stopping) return; setStopping(true); setError(false); try { await onStop(); } catch { setError(true); } finally { setStopping(false); } }
  return <section style={suspended ? { display: "none" } : undefined} inert={suspended || resuming} className={`relative flex min-h-0 ${minimized ? "flex-none" : "flex-1"} flex-col gap-3 rounded-xl border bg-card p-3`} aria-label={t("games.active")} data-game-connection={workspace.status} data-game-presented={sync.presentedBlockId ?? ""}>
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{t("games.active")}</strong><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => onMinimize(!minimized)}>{t(minimized ? "games.resume" : "games.minimize")}</Button><Button type="button" disabled={stopping} onClick={() => void stop()}>{t(stopping ? "games.stopping" : "games.stop")}</Button></div></div>
    {!protocolReady ? <p role="alert">{t("games.updateRequired")}</p> : null}
    {resuming && !suspended ? <p role="status">{t("whiteboard.status.connecting")}</p> : null}
    {error || runtimeFailed ? <div role="alert" className="flex flex-wrap gap-2">{t("games.failed")}<Button type="button" variant="outline" onClick={() => { setRetry((value) => value + 1); workspace.retryConnection(); }}>{t("games.retry")}</Button></div> : null}
    <div hidden={minimized} className="min-h-[min(65dvh,40rem)] flex-1"><HtmlGameFrame runIdentity={blockId} blockId={blockId} height={640} fillAvailable html={html} sync={frameSync} contentState={error || runtimeFailed || !protocolReady ? "unavailable" : html && (preserveFrame || workspace.connected && sync.presentedBlockId === blockId) ? "ready" : "loading"} title={t("games.active")} onRetry={() => setRetry((value) => value + 1)} onClose={() => onMinimize(true)} /></div>
  </section>;
}
