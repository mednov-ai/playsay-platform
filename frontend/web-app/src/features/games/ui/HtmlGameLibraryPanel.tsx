import { ApiError } from "../../../shared/api/errors";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Gamepad2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { archiveGame, attachGame, createMaterialFromGame, editGame, forkGame, gameContent, gameCover, listGames, uploadGame, type LibraryGame } from "../../../shared/api/games";
import { fetchMaterial, type LessonMaterial, type MeProfile } from "../../../shared/api/playsay";
import { GameProcessingPanel } from "./GameProcessingPanel";
const HtmlGameFrame = lazy(() => import("../../materials/ui/blocks/HtmlGameFrame").then((module) => ({ default: module.HtmlGameFrame })));

function GameDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useAppTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => {
      node?.close();
      queueMicrotask(() => { if (previous?.isConnected) previous.focus({ preventScroll: true }); });
    };
  }, []);
  return createPortal(<dialog ref={ref} aria-label={title} className="m-auto max-h-[90dvh] w-[min(95vw,70rem)] overflow-auto rounded-xl border bg-background p-4 text-foreground shadow-xl backdrop:bg-black/50" onCancel={onClose}>
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2><Button type="button" variant="outline" onClick={onClose}>{t("games.close")}</Button></div>{children}
  </dialog>, document.body);
}

function GameCover({ game }: { game: LibraryGame }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (!game.hasCover) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void gameCover(game, controller.signal).then((blob) => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => undefined);
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [game.id, game.revisionId, game.hasCover, game.updatedAt]);
  return url ? <img src={url} alt="" className="h-16 w-16 rounded-xl object-contain" /> : <Gamepad2 aria-hidden="true" className="h-10 w-10 text-primary" />;
}

export function HtmlGamePicker({ onSelect, onClose, selectLabelKey = "games.choose" }: { selectLabelKey?: "games.choose" | "games.start"; onSelect: (game: LibraryGame) => void | Promise<void>; onClose: () => void }) {
  const { t } = useAppTranslation();
  return <GameDialog title={t("games.choose")} onClose={onClose}><HtmlGameLibraryPanel onSelect={onSelect} selectLabelKey={selectLabelKey} /></GameDialog>;
}

export function HtmlGameLibraryPanel({ onSelect, onStart, selectLabelKey = "games.choose", materials = [], profile, onMaterialSaved }: {
  selectLabelKey?: "games.choose" | "games.start";
  onSelect?: (game: LibraryGame) => void | Promise<void>;
  onStart?: (game: LibraryGame) => Promise<void>;
  materials?: LessonMaterial[];
  profile?: MeProfile | null;
  onMaterialSaved?: () => void;
}) {
  const { t } = useAppTranslation();
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("");
  const [compatibility, setCompatibility] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<LibraryGame[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [errorCode, setErrorCode] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState<LibraryGame | null>(null);
  const [html, setHtml] = useState<string>();
  const [previewError, setPreviewError] = useState(false);
  const [edit, setEdit] = useState<LibraryGame | null>(null);
  const [processing, setProcessing] = useState<{ game: LibraryGame; kind: "ADAPT" | "ENRICH" }>();
  const [attach, setAttach] = useState<LibraryGame | null>(null);
  const [target, setTarget] = useState("");
  const attachBlockId = useRef(crypto.randomUUID());
  const uploadCommand = useRef({ key: "", id: crypto.randomUUID() });
  const forkCommands = useRef(new Map<string, string>());
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true); setError(false); setErrorCode("");
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ search, topic, level, compatibility, page: String(page), pageSize: "24" });
      void listGames(query, controller.signal).then((result) => { if (current === generation.current) { setItems(result.items); setTotal(result.total); } }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (current === generation.current) setLoading(false); });
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); generation.current++; };
  }, [search, topic, level, compatibility, page, refresh]);
  useEffect(() => {
    setHtml(undefined); setPreviewError(false);
    if (!preview) return;
    const controller = new AbortController();
    void gameContent(preview.id, preview.revisionId, undefined, controller.signal).then((value) => { if (!controller.signal.aborted) setHtml(value); }).catch(() => { if (!controller.signal.aborted) setPreviewError(true); });
    return () => controller.abort();
  }, [preview]);
  async function perform(action: () => Promise<unknown>, refreshCatalog = true) {
    if (busy) return;
    setBusy(true); setError(false); setNotice("");
    try { await action(); if (refreshCatalog) setRefresh((value) => value + 1); } catch (caught) { setErrorCode(caught instanceof ApiError ? caught.errorCode : ""); setError(true); } finally { setBusy(false); }
  }
  function upload(file: File | undefined, game?: LibraryGame) {
    if (!file) return;
    const key = `${game?.id ?? "new"}:${file.name}:${file.size}:${file.lastModified}`;
    if (uploadCommand.current.key !== key) uploadCommand.current = { key, id: crypto.randomUUID() };
    void perform(async () => { await uploadGame(file, uploadCommand.current.id, game); setNotice(t("games.saved")); setSearch(""); setTopic(""); setLevel(""); setCompatibility(""); setPage(0); });
  }
  async function addToMaterial() {
    if (!attach) return;
    if (!target) {
      const saved = await createMaterialFromGame(attach, attachBlockId.current);
      setTarget(saved.id);
    } else {
      const material = await fetchMaterial(target);
      const pages = material.document.pages;
      const pageId = Array.isArray(pages) ? String((pages[0] as Record<string, unknown>)?.id ?? "") : "";
      await attachGame(attach, material.id, pageId, attachBlockId.current, material.updatedAt);
    }
    setNotice(t("games.attached")); setAttach(null); onMaterialSaved?.();
  }
  const editable = materials.filter((material) => profile?.roles.includes("ADMIN") || material.ownerTeacherSubject === profile?.subject);
  return <section className="space-y-4" aria-label={t("games.title")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{t("games.title")}</h2><label className="playsay-inline-upload focus-within:outline focus-within:outline-2 focus-within:outline-primary"><input className="sr-only" type="file" accept="text/html,.html" disabled={busy} onChange={(event) => { upload(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />{t("games.upload")}</label></div>
    <p className="text-sm text-muted-foreground">{t("games.shared")}</p>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <input className="rounded-lg border bg-background p-2" aria-label={t("games.search")} placeholder={t("games.search")} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
      <input className="rounded-lg border bg-background p-2" aria-label={t("games.topic")} placeholder={t("games.topic")} value={topic} onChange={(event) => { setTopic(event.target.value); setPage(0); }} />
      <select className="rounded-lg border bg-background p-2" aria-label={t("games.level")} value={level} onChange={(event) => { setLevel(event.target.value); setPage(0); }}><option value="">{t("games.allLevels")}</option>{["PRE_A1", "A1", "A2", "B1", "B2", "C1", "C2"].map((value) => <option key={value}>{value}</option>)}</select>
      <select className="rounded-lg border bg-background p-2" aria-label={t("games.compatibility")} value={compatibility} onChange={(event) => { setCompatibility(event.target.value); setPage(0); }}><option value="">{t("games.allModes")}</option>{["SDK_V1", "LEGACY_PREDICTIVE", "LEGACY_MIRROR", "UNSUPPORTED"].map((value) => <option value={value} key={value}>{t(`games.modes.${value}`)}</option>)}</select>
    </div>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-destructive">{t(errorCode === "GAME_CLIENT_UPDATE_REQUIRED" ? "games.updateRequired" : "games.failed")}<Button type="button" variant="outline" onClick={() => setRefresh((value) => value + 1)}>{t("games.retry")}</Button></div> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {loading ? <p role="status">{t("games.loading")}</p> : !items.length ? <p>{t("games.empty")}</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((game) => <article key={game.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <GameCover game={game} />{game.validationStatus === "REVALIDATION_REQUIRED" ? <p role="status" className="text-sm">{t("games.revalidationRequired")}</p> : null}<h3 className="break-words font-bold">{game.title}</h3><p className="text-sm text-muted-foreground">{[game.topic, game.cefrLevel, t(`games.modes.${game.compatibility}`, { defaultValue: t("games.unknown") })].filter(Boolean).join(" · ")}</p>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setPreview(game)}>{t("games.preview")}</Button>{onSelect ? <Button type="button" disabled={busy || (selectLabelKey === "games.start" && game.compatibility === "UNSUPPORTED") || game.validationStatus === "REVALIDATION_REQUIRED"} onClick={() => void perform(async () => onSelect(game), false)}>{t(selectLabelKey)}</Button> : onStart ? <Button type="button" disabled={busy || game.compatibility === "UNSUPPORTED"} onClick={() => void perform(() => onStart(game), false)}>{t("games.start")}</Button> : <Button type="button" disabled={busy || game.validationStatus === "REVALIDATION_REQUIRED"} onClick={() => { attachBlockId.current = crypto.randomUUID(); setTarget(""); setAttach(game); }}>{t("games.attach")}</Button>}
      {game.canEdit ? <><Button type="button" variant="outline" disabled={busy} onClick={() => setProcessing({ game, kind: "ENRICH" })}>{t("games.enrich")}</Button><Button type="button" variant="outline" disabled={busy || (game.compatibility === "SDK_V1" && game.validationStatus !== "REVALIDATION_REQUIRED")} onClick={() => setProcessing({ game, kind: "ADAPT" })}>{t("games.adapt")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEdit(game)}>{t("games.edit")}</Button><label className="playsay-inline-upload focus-within:outline focus-within:outline-2 focus-within:outline-primary"><input type="file" className="sr-only" accept="text/html,.html" disabled={busy} onChange={(event) => { upload(event.currentTarget.files?.[0], game); event.currentTarget.value = ""; }} />{t("games.replace")}</label><Button type="button" variant="outline" disabled={busy} onClick={() => { if (window.confirm(t("games.archiveConfirm"))) void perform(() => archiveGame(game.id)); }}>{t("games.archive")}</Button></> : <Button type="button" variant="outline" disabled={busy} onClick={() => { const key = forkCommands.current.get(game.id) ?? crypto.randomUUID(); forkCommands.current.set(game.id, key); void perform(async () => { await forkGame(game, key); forkCommands.current.delete(game.id); }); }}>{t("games.fork")}</Button>}</div>
    </article>)}</div>}
    <div className="flex items-center justify-between gap-3"><Button type="button" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>{t("games.previous")}</Button><span role="status">{t("games.count", { count: total })}</span><Button type="button" variant="outline" disabled={(page + 1) * 24 >= total || loading} onClick={() => setPage((value) => value + 1)}>{t("games.next")}</Button></div>
    {preview ? <GameDialog title={preview.title} onClose={() => setPreview(null)}><Suspense fallback={<p>{t("games.loading")}</p>}><HtmlGameFrame blockId={`library-preview:${preview.id}:${preview.revisionId}`} html={html} height={640} title={preview.title} onEscape={() => setPreview(null)} contentState={previewError ? "unavailable" : html ? "ready" : "loading"} onRetry={() => setPreview({ ...preview })} /></Suspense></GameDialog> : null}
    {edit ? <GameDialog title={t("games.edit")} onClose={() => setEdit(null)}><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void perform(async () => { await editGame(edit, edit.title, edit.topic, edit.cefrLevel ?? null); setEdit(null); }); }}><label>{t("games.name")}<input className="block w-full rounded border bg-background p-2" required maxLength={160} value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} /></label><label>{t("games.topic")}<input className="block w-full rounded border bg-background p-2" maxLength={120} value={edit.topic} onChange={(event) => setEdit({ ...edit, topic: event.target.value })} /></label><label>{t("games.level")}<select className="block w-full rounded border bg-background p-2" value={edit.cefrLevel ?? ""} onChange={(event) => setEdit({ ...edit, cefrLevel: event.target.value || null })}><option value="">{t("games.unknown")}</option>{["PRE_A1", "A1", "A2", "B1", "B2", "C1", "C2"].map((value) => <option key={value}>{value}</option>)}</select></label><Button type="submit" disabled={busy}>{t("games.save")}</Button></form></GameDialog> : null}
    {processing ? <GameDialog title={t(processing.kind === "ADAPT" ? "games.adapt" : "games.enrich")} onClose={() => setProcessing(undefined)}><GameProcessingPanel game={processing.game} kind={processing.kind} onSaved={() => setRefresh((value) => value + 1)} /></GameDialog> : null}
    {attach ? <GameDialog title={t("games.attach")} onClose={() => setAttach(null)}><div className="grid gap-3"><label>{t("games.material")}<select className="mt-2 block w-full rounded border bg-background p-2" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">{t("games.newMaterial")}</option>{editable.map((material) => <option value={material.id} key={material.id}>{material.title}</option>)}</select></label><Button type="button" disabled={busy} onClick={() => void perform(addToMaterial)}>{t("games.attach")}</Button></div></GameDialog> : null}
  </section>;
}
