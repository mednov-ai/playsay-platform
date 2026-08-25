import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, FileImage, LoaderCircle, PenLine, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  cancelWorksheetImport,
  continueWorksheetImportManually,
  createWorksheetImport,
  fetchWorksheetImport,
  fetchWorksheetPagePreview,
  materializeWorksheetImport,
  retryWorksheetImportAnalysis,
  saveWorksheetImportReview,
  type WorksheetImportSession,
  type WorksheetChoiceOption,
  type WorksheetFlashcard,
  type WorksheetGap,
  type WorksheetInteractionGroup,
  type WorksheetPair,
  type WorksheetRegion,
  type WorksheetReview,
  type WorksheetReviewPage,
  type WorksheetSectionType,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

const SESSION_KEY = "honey-school:worksheet-import-session";
const acceptedTypes = "image/jpeg,image/png,image/webp,application/pdf";
const acceptedMimeTypes = new Set(acceptedTypes.split(","));
const MAX_PACKET_FILES = 100;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PDF_BYTES = 64 * 1024 * 1024;
type MarkTool = "GAP" | "PAIR" | "MULTIPLE_CHOICE" | "FLASHCARD";
type Point = { x: number; y: number };
type SnappedRegion = { id?: string; region: WorksheetRegion; text?: string; confidence: number };

export function WorksheetImportWorkspace({ disabled, onClose, onMaterialized }: {
  disabled: boolean;
  onClose: () => void;
  onMaterialized: (materialId: string) => void;
}) {
  const { t } = useAppTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("en");
  const [level, setLevel] = useState("A1");
  const [sourceNote, setSourceNote] = useState("");
  const [session, setSession] = useState<WorksheetImportSession | null>(null);
  const [review, setReview] = useState<WorksheetReview | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [tool, setTool] = useState<MarkTool>("GAP");
  const [stroke, setStroke] = useState<Point[]>([]);
  const [pendingPair, setPendingPair] = useState<SnappedRegion | null>(null);
  const [pendingChoiceId, setPendingChoiceId] = useState<string | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState<WorksheetReview[]>([]);
  const [selectedRegionIndex, setSelectedRegionIndex] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const currentRevision = useRef(0);
  const previewUrlsRef = useRef<Record<string, string>>({});

  previewUrlsRef.current = previewUrls;

  useEffect(() => {
    const saved = window.localStorage.getItem(SESSION_KEY);
    if (!saved) return;
    void fetchWorksheetImport(saved).then(applySession).catch(() => window.localStorage.removeItem(SESSION_KEY));
  }, []);

  useEffect(() => {
    if (!session || !["ANALYZING"].includes(session.status)) return;
    const timer = window.setInterval(() => void fetchWorksheetImport(session.id).then(applySession).catch(() => undefined), 2_000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.status]);

  useEffect(() => () => Object.values(previewUrlsRef.current).forEach(URL.revokeObjectURL), []);

  useEffect(() => {
    if (!session) return;
    session.pages.forEach((page) => {
      if (previewUrls[page.id]) return;
      void fetchWorksheetPagePreview(session.id, page.id).then((url) => setPreviewUrls((current) => ({ ...current, [page.id]: url })));
    });
  }, [session?.id, session?.pages.length]);

  function applySession(next: WorksheetImportSession) {
    currentRevision.current = next.revision;
    setSession(next);
    setReview(next.review ?? makeStaticReview(next));
    setActivePageId((current) => current && next.pages.some((page) => page.id === current) ? current : next.pages[0]?.id ?? null);
    window.localStorage.setItem(SESSION_KEY, next.id);
  }

  async function start() {
    if (!files.length || !title.trim() || !sourceNote.trim()) return;
    setBusy(true); setMessage(null);
    try {
      const created = await createWorksheetImport({ title: title.trim(), language, cefrLevel: level, sourceNote: sourceNote.trim() }, files);
      applySession(created.session);
      if (created.rejectedSources.length) setMessage(t("materials.worksheet.rejected", { count: created.rejectedSources.length }));
    } catch { setMessage(t("materials.worksheet.errors.create")); } finally { setBusy(false); }
  }

  function updateReview(next: WorksheetReview, remember = true) {
    if (remember && review) setHistory((current) => [...current.slice(-19), review]);
    setReview(next);
    if (!session || session.status === "ANALYZING" || session.status === "MATERIALIZED") return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const saved = await saveWorksheetImportReview(session.id, currentRevision.current, next);
        applySession(saved); setMessage(t("materials.worksheet.saved"));
      } catch {
        setMessage(t("materials.worksheet.errors.conflict"));
        void fetchWorksheetImport(session.id).then(applySession);
      }
    }, 600);
  }

  function addFiles(selected: File[]) {
    const accepted: File[] = [];
    let rejected = 0;
    for (const file of selected) {
      const maxBytes = file.type === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
      if (!acceptedMimeTypes.has(file.type) || file.size <= 0 || file.size > maxBytes || files.length + accepted.length >= MAX_PACKET_FILES) rejected += 1;
      else accepted.push(file);
    }
    if (accepted.length) setFiles((current) => [...current, ...accepted]);
    if (rejected) setMessage(t("materials.worksheet.localRejected", { count: rejected }));
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    updateReview(previous, false);
  }

  const activePage = session?.pages.find((page) => page.id === activePageId) ?? null;
  const reviewPage = review?.pages.find((page) => page.id === activePageId) ?? null;
  const orderedReviewPages = [...(review?.pages ?? [])].sort((a, b) => a.order - b.order);
  const orderedSessionPages = orderedReviewPages.length
    ? orderedReviewPages.map((page) => session?.pages.find((candidate) => candidate.id === page.id)).filter(Boolean) as NonNullable<typeof session>["pages"]
    : session?.pages ?? [];

  function mutatePage(patch: Partial<WorksheetReviewPage>) {
    if (!review || !reviewPage) return;
    updateReview({ ...review, pages: review.pages.map((page) => page.id === reviewPage.id ? { ...page, ...patch } : page) });
  }

  function moveReviewPage(pageId: string, direction: -1 | 1) {
    if (!review) return;
    const ordered = [...review.pages].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((page) => page.id === pageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    updateReview({ ...review, pages: ordered.map((page, order) => ({ ...page, order })) });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!activePage || session?.status === "ANALYZING") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setStroke([normalizedPoint(event)]);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!stroke.length) return;
    const point = normalizedPoint(event);
    setStroke((points) => [...points, point]);
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!stroke.length || !reviewPage) return;
    const points = [...stroke, normalizedPoint(event)]; setStroke([]);
    const snapped = snapCandidate(bounds(points), [
      ...(activePage?.snapCandidates ?? []),
      ...regions(reviewPage.groups).map((region, index) => ({ id: `review-${index}`, region, confidence: 1 })),
    ]);
    const region = snapped.region;
    if (region.width < 4 || region.height < 2) return;
    const groups = [...reviewPage.groups];
    if (tool === "PAIR") {
      if (!pendingPair) { setPendingPair(snapped); return; }
      const group = findOrCreate(groups, "MATCHING_PAIRS");
      const pairs = [...(group.pairs ?? []), { id: crypto.randomUUID(), number: (group.pairs?.length ?? 0) + 1,
        left: { region: pendingPair.region, kind: "TEXT" as const, text: pendingPair.text }, right: { region, kind: "TEXT" as const, text: snapped.text } }];
      replaceGroup(groups, { ...group, pairs }); setPendingPair(null);
    } else if (tool === "GAP") {
      const group = findOrCreate(groups, "FILL_GAPS");
      replaceGroup(groups, { ...group, gapMode: group.gapMode ?? "TYPED", gaps: [...(group.gaps ?? []), {
        id: crypto.randomUUID(), region, acceptedAnswers: snapped.text ? [snapped.text] : [], options: [], distractors: [],
        answer: snapped.text ? { value: snapped.text, provenance: "VISIBLE_TEXT" as const, confidence: snapped.confidence, confirmed: snapped.confidence >= .75 } : null,
      }] });
    } else if (tool === "MULTIPLE_CHOICE") {
      const group = findOrCreate(groups, "MULTIPLE_CHOICE");
      const questions = [...(group.questions ?? [])];
      const questionIndex = questions.findIndex((question) => question.id === pendingChoiceId);
      if (questionIndex >= 0) {
        const question = questions[questionIndex];
        const option: WorksheetChoiceOption = {
          id: crypto.randomUUID(), order: question.options.length, region, text: snapped.text ?? "",
          provenance: snapped.text ? "VISIBLE_TEXT" : "TEACHER", confidence: snapped.confidence,
          confirmed: Boolean(snapped.text) && snapped.confidence >= .75,
        };
        questions[questionIndex] = { ...question, options: [...question.options, option] };
      } else {
        const questionId = crypto.randomUUID();
        questions.push({ id: questionId, prompt: snapped.text ?? "", promptRegion: region, options: [], correctOptionIds: [] });
        setPendingChoiceId(questionId);
      }
      replaceGroup(groups, { ...group, questions });
    } else {
      const group = findOrCreate(groups, "FLASHCARDS");
      const cards = [...(group.cards ?? [])];
      const last = cards.at(-1);
      if (last && !last.back) cards[cards.length - 1] = { ...last, back: cardSide(region, snapped.text, snapped.confidence) }; else cards.push({ id: crypto.randomUUID(), order: cards.length, front: cardSide(region, snapped.text, snapped.confidence), back: null });
      replaceGroup(groups, { ...group, cards });
    }
    mutatePage({ role: "WORKSHEET", groups });
  }

  function reclassifySelectedRegion(nextTool: MarkTool) {
    if (!reviewPage || selectedRegionIndex === null) return;
    const removed = removeWorksheetRegion(reviewPage.groups, selectedRegionIndex);
    if (!removed) return;
    const groups = removed.groups;
    const marked = removed.snapped;
    setTool(nextTool);
    setSelectedRegionIndex(null);
    setPendingChoiceId(null);
    if (nextTool === "GAP") {
      const group = findOrCreate(groups, "FILL_GAPS");
      replaceGroup(groups, { ...group, gapMode: group.gapMode ?? "TYPED", gaps: [...(group.gaps ?? []), worksheetGap(marked)] });
    } else if (nextTool === "PAIR") {
      if (pendingPair) {
        const group = findOrCreate(groups, "MATCHING_PAIRS");
        replaceGroup(groups, { ...group, pairs: [...(group.pairs ?? []), { id: crypto.randomUUID(), number: (group.pairs?.length ?? 0) + 1, left: { region: pendingPair.region, kind: "TEXT", text: pendingPair.text }, right: { region: marked.region, kind: "TEXT", text: marked.text } }] });
        setPendingPair(null);
      } else {
        setPendingPair(marked);
      }
    } else if (nextTool === "MULTIPLE_CHOICE") {
      const group = findOrCreate(groups, "MULTIPLE_CHOICE");
      const questionId = crypto.randomUUID();
      replaceGroup(groups, { ...group, questions: [...(group.questions ?? []), { id: questionId, prompt: marked.text ?? "", promptRegion: marked.region, options: [], correctOptionIds: [] }] });
      setPendingChoiceId(questionId);
      setPendingPair(null);
    } else {
      const group = findOrCreate(groups, "FLASHCARDS");
      replaceGroup(groups, { ...group, cards: [...(group.cards ?? []), { id: crypto.randomUUID(), order: group.cards?.length ?? 0, front: cardSide(marked.region, marked.text, marked.confidence), back: null }] });
      setPendingPair(null);
    }
    mutatePage({ role: "WORKSHEET", groups });
  }

  async function cancel() {
    if (session && session.status !== "MATERIALIZED") await cancelWorksheetImport(session.id).catch(() => undefined);
    window.localStorage.removeItem(SESSION_KEY); setSession(null); setReview(null);
  }

  async function materialize() {
    if (!session || !rightsConfirmed) return;
    setBusy(true); setMessage(null);
    try {
      const result = await materializeWorksheetImport(session.id, session.revision, rightsConfirmed);
      window.localStorage.removeItem(SESSION_KEY); onMaterialized(result.materialId);
    } catch { setMessage(t("materials.worksheet.errors.materialize")); } finally { setBusy(false); }
  }

  if (!session) return <section className="worksheet-import-workspace">
    <WorkspaceHeader onClose={onClose} title={t("materials.worksheet.title")} />
    <div className="worksheet-import-packet">
      <label>{t("materials.worksheet.materialTitle")}<input className="playsay-input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label>{t("materials.form.language")}<select className="playsay-input" value={language} onChange={(e) => setLanguage(e.target.value)}><option>en</option><option>ru</option><option>de</option><option>fr</option></select></label>
        <label>{t("materials.form.level")}<select className="playsay-input" value={level} onChange={(e) => setLevel(e.target.value)}>{["A1","A2","B1","B2","C1","C2"].map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <label>{t("materials.worksheet.sourceNote")}<textarea className="playsay-input min-h-20" value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} /></label>
      <p className="worksheet-import-preserve-note">{t("materials.worksheet.preserveDraft")}</p>
      <label
        className={`worksheet-import-drop${dragging ? " dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}
      ><FileImage /><span>{t("materials.worksheet.chooseFiles")}</span><input data-testid="worksheet-import-files" accept={acceptedTypes} multiple type="file" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label>
      <ol className="grid gap-2">{files.map((file, index) => <li className="worksheet-import-file" key={`${file.name}-${index}`}><span>{index + 1}. {file.name}</span><span className="flex gap-1"><IconButton label={t("materials.worksheet.moveUp")} disabled={!index} onClick={() => setFiles(move(files, index, index - 1))}><ArrowUp /></IconButton><IconButton label={t("materials.worksheet.moveDown")} disabled={index === files.length - 1} onClick={() => setFiles(move(files, index, index + 1))}><ArrowDown /></IconButton><IconButton label={t("common.actions.cancel")} onClick={() => setFiles(files.filter((_, item) => item !== index))}><Trash2 /></IconButton></span></li>)}</ol>
      {message ? <p role="alert">{message}</p> : null}
      <Button data-testid="worksheet-import-analyze" disabled={disabled || busy || !files.length || !title.trim() || !sourceNote.trim()} onClick={() => void start()}><LoaderCircle className={busy ? "animate-spin" : "hidden"} />{t("materials.worksheet.analyze")}</Button>
    </div>
  </section>;

  return <section className="worksheet-import-workspace">
    <WorkspaceHeader onClose={onClose} title={session.title} />
    <div className="worksheet-import-status" role="status">{t(`materials.worksheet.status.${session.status}`)} · {t("materials.worksheet.revision", { revision: session.revision })}</div>
    <div className="worksheet-import-review">
      <nav className="worksheet-import-filmstrip" aria-label={t("materials.worksheet.pages")}>{orderedSessionPages.map((page, index) => <div className={page.id === activePageId ? "active" : ""} key={page.id}><button onClick={() => { setActivePageId(page.id); setPendingPair(null); setPendingChoiceId(null); setSelectedRegionIndex(null); }}><img alt={t("materials.worksheet.page", { page: index + 1 })} src={previewUrls[page.id]} /><span>{page.sourcePageNumber ? t("materials.worksheet.pdfPage", { page: page.sourcePageNumber }) : t("materials.worksheet.page", { page: index + 1 })}</span></button><span className="worksheet-import-page-order"><IconButton disabled={!index} label={t("materials.worksheet.movePageUp")} onClick={() => moveReviewPage(page.id, -1)}><ArrowUp /></IconButton><IconButton disabled={index === orderedSessionPages.length - 1} label={t("materials.worksheet.movePageDown")} onClick={() => moveReviewPage(page.id, 1)}><ArrowDown /></IconButton></span></div>)}</nav>
      <main className="min-w-0">
        {session.status === "ANALYZING" ? <div className="worksheet-import-wait"><LoaderCircle className="animate-spin" />{t("materials.worksheet.analysisWait")}</div> : activePage && reviewPage ? <>
          <div className="worksheet-import-controls">
            <label>{t("materials.worksheet.pageRole")}<select value={reviewPage.role} onChange={(e) => mutatePage({ role: e.target.value as WorksheetReviewPage["role"] })}><option value="WORKSHEET">{t("materials.worksheet.roles.WORKSHEET")}</option><option value="ANSWER_KEY">{t("materials.worksheet.roles.ANSWER_KEY")}</option><option value="STATIC_REFERENCE">{t("materials.worksheet.roles.STATIC_REFERENCE")}</option></select></label>
            <label>{t("materials.worksheet.section")}<select value={reviewPage.sections[0] ?? "STATIC_CONTENT"} onChange={(e) => mutatePage({ sections: [e.target.value as WorksheetSectionType] })}>{sectionTypes.map((type) => <option key={type} value={type}>{t(`materials.worksheet.sections.${type}`)}</option>)}</select></label>
            {reviewPage.role === "WORKSHEET" ? <label>{t("materials.worksheet.answerKeyAssociation")}<select value={reviewPage.answerKeyPageId ?? ""} onChange={(event) => mutatePage({ answerKeyPageId: event.target.value || null })}><option value="">{t("materials.worksheet.noAnswerKey")}</option>{orderedReviewPages.filter((page) => page.role === "ANSWER_KEY").map((page) => <option key={page.id} value={page.id}>{t("materials.worksheet.page", { page: page.order + 1 })}</option>)}</select></label> : null}
            <div className="worksheet-import-tools" aria-label={t("materials.worksheet.markingTools")}>{(["GAP","PAIR","MULTIPLE_CHOICE","FLASHCARD"] as MarkTool[]).map((item) => <button aria-pressed={tool === item} className={tool === item ? "active" : ""} key={item} onClick={() => { setTool(item); setPendingPair(null); setPendingChoiceId(null); setSelectedRegionIndex(null); }}><PenLine />{t(`materials.worksheet.tools.${item}`)}</button>)}</div>
            <div className="worksheet-import-viewport-tools"><IconButton disabled={!history.length} label={t("materials.worksheet.undo")} onClick={undo}><RotateCcw /></IconButton><IconButton disabled={zoom <= 1} label={t("materials.worksheet.zoomOut")} onClick={() => setZoom((value) => Math.max(1, value - .25))}><ZoomOut /></IconButton><output aria-label={t("materials.worksheet.zoom")}>{Math.round(zoom * 100)}%</output><IconButton disabled={zoom >= 3} label={t("materials.worksheet.zoomIn")} onClick={() => setZoom((value) => Math.min(3, value + .25))}><ZoomIn /></IconButton></div>
          </div>
          <div className="worksheet-import-canvas-viewport"><div data-testid="worksheet-import-canvas" className="worksheet-import-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ width: `${zoom * 100}%` }}><img alt={t("materials.worksheet.pageSource", { page: reviewPage.order + 1 })} draggable={false} src={previewUrls[activePage.id]} />{regions(reviewPage.groups).map((region, index) => <button aria-label={t("materials.worksheet.regionNumber", { number: index + 1 })} aria-pressed={selectedRegionIndex === index} className="worksheet-import-region" data-selected={selectedRegionIndex === index || undefined} key={index} onPointerDown={(event) => event.stopPropagation()} onClick={() => setSelectedRegionIndex((current) => current === index ? null : index)} style={{ left: `${region.x / 10}%`, top: `${region.y / 10}%`, width: `${region.width / 10}%`, height: `${region.height / 10}%` }} type="button">{index + 1}</button>)}{stroke.length > 1 ? <svg viewBox="0 0 1000 1000" preserveAspectRatio="none"><polyline points={stroke.map((p) => `${p.x},${p.y}`).join(" ")} /></svg> : null}</div></div>
          {selectedRegionIndex !== null ? <div className="worksheet-region-reclassify" role="group" aria-label={t("materials.worksheet.reclassifyRegion")}><span>{t("materials.worksheet.selectedRegion", { number: selectedRegionIndex + 1 })}</span>{(["GAP","PAIR","MULTIPLE_CHOICE","FLASHCARD"] as MarkTool[]).map((item) => <Button key={item} onClick={() => reclassifySelectedRegion(item)} type="button" variant="outline">{t(`materials.worksheet.tools.${item}`)}</Button>)}<Button onClick={() => setSelectedRegionIndex(null)} type="button" variant="outline">{t("common.actions.cancel")}</Button></div> : null}
          {pendingPair ? <p role="status">{t("materials.worksheet.pairPending")} <Button onClick={() => setPendingPair(null)} type="button" variant="outline">{t("materials.worksheet.cancelPending")}</Button></p> : null}
          {pendingChoiceId ? <p role="status">{t("materials.worksheet.choicePending")} <Button onClick={() => setPendingChoiceId(null)} type="button" variant="outline">{t("materials.worksheet.finishChoice")}</Button></p> : null}
          <WorksheetGroupEditors groups={reviewPage.groups} onChange={(group) => mutatePage({ groups: reviewPage.groups.map((item) => item.id === group.id ? group : item) })} onRemove={(groupId) => mutatePage({ groups: reviewPage.groups.filter((group) => group.id !== groupId) })} />
        </> : null}
      </main>
      <aside className="worksheet-import-blockers"><h3>{t("materials.worksheet.blockers")}</h3>{session.blockers.length ? <ul>{session.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}><button onClick={() => setActivePageId(blocker.pageId)}>{t(`materials.worksheet.blocker.${blocker.code}`)}</button></li>)}</ul> : <p>{t("materials.worksheet.noBlockers")}</p>}</aside>
    </div>
    {message ? <p className="p-3" role="alert">{message}</p> : null}
    <footer className="worksheet-import-footer"><Button variant="outline" onClick={() => void cancel()}>{t("materials.worksheet.cancel")}</Button>{session.status === "FAILED" ? <><Button onClick={() => void retryWorksheetImportAnalysis(session.id).then(applySession)}>{t("materials.worksheet.retry")}</Button><Button onClick={() => void continueWorksheetImportManually(session.id).then(applySession)}>{t("materials.worksheet.manual")}</Button></> : null}<label><input data-testid="worksheet-import-rights" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} type="checkbox" /> {t("materials.worksheet.rights")}</label><Button data-testid="worksheet-import-materialize" disabled={busy || session.status !== "READY" || !rightsConfirmed} onClick={() => void materialize()}>{t("materials.worksheet.createDraft")}</Button></footer>
  </section>;
}

function WorkspaceHeader({ onClose, title }: { onClose: () => void; title: string }) { const { t } = useAppTranslation(); return <header className="worksheet-import-header"><Button onClick={onClose} variant="outline"><ArrowLeft />{t("materials.editor.backToLibrary")}</Button><h2>{title}</h2><IconButton label={t("common.actions.close")} onClick={onClose}><X /></IconButton></header>; }
function IconButton({ children, disabled, label, onClick }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) { return <button aria-label={label} disabled={disabled} onClick={onClick} type="button">{children}</button>; }
function makeStaticReview(session: WorksheetImportSession): WorksheetReview { return { pages: session.pages.map((page) => ({ id: page.id, order: page.order, role: "STATIC_REFERENCE", sections: ["STATIC_CONTENT"], groups: [] })) }; }
function move<T>(items: T[], from: number, to: number) { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }
function normalizedPoint(event: PointerEvent<HTMLDivElement>): Point { const box = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(999, Math.round((event.clientX - box.left) / box.width * 1000))), y: Math.max(0, Math.min(999, Math.round((event.clientY - box.top) / box.height * 1000))) }; }
function bounds(points: Point[]): WorksheetRegion { const xs = points.map((p) => p.x), ys = points.map((p) => p.y); const minX = Math.min(...xs), minY = Math.min(...ys); return { x: minX, y: minY, width: Math.min(1000 - minX, Math.max(20, Math.max(...xs) - minX)), height: Math.min(1000 - minY, Math.max(20, Math.max(...ys) - minY)), anchor: "GEOMETRY" }; }
function snapCandidate(region: WorksheetRegion, candidates: Array<{ id: string; region: WorksheetRegion; text?: string; confidence: number }>): SnappedRegion {
  const center = { x: region.x + region.width / 2, y: region.y + region.height / 2 };
  const ranked = candidates.map((candidate) => ({
    candidate,
    distance: Math.hypot(center.x - candidate.region.x - candidate.region.width / 2, center.y - candidate.region.y - candidate.region.height / 2),
  })).sort((a, b) => a.distance - b.distance);
  if (!ranked[0] || ranked[0].distance > 45 || (ranked[1] && ranked[1].distance - ranked[0].distance < 18)) return { region, confidence: 1, text: undefined };
  return { ...ranked[0].candidate, region: { ...ranked[0].candidate.region, anchor: ranked[0].candidate.region.anchor ?? "GEOMETRY" } };
}
function findOrCreate(groups: WorksheetInteractionGroup[], type: WorksheetInteractionGroup["type"]): WorksheetInteractionGroup { return groups.find((group) => group.type === type) ?? { id: crypto.randomUUID(), order: groups.length, type }; }
function replaceGroup(groups: WorksheetInteractionGroup[], group: WorksheetInteractionGroup) { const index = groups.findIndex((item) => item.id === group.id); if (index < 0) groups.push(group); else groups[index] = group; }
function worksheetGap(marked: SnappedRegion): WorksheetGap { return {
  id: crypto.randomUUID(), region: marked.region, acceptedAnswers: marked.text ? [marked.text] : [], options: [], distractors: [],
  answer: marked.text ? { value: marked.text, provenance: "VISIBLE_TEXT", confidence: marked.confidence, confirmed: marked.confidence >= .75 } : null,
}; }

export function removeWorksheetRegion(groups: WorksheetInteractionGroup[], targetIndex: number): { groups: WorksheetInteractionGroup[]; snapped: SnappedRegion } | null {
  let cursor = 0;
  let snapped: SnappedRegion | null = null;
  const nextGroups = groups.map((group) => {
    if (group.type === "FILL_GAPS") {
      const gaps = (group.gaps ?? []).filter((gap) => {
        const selected = cursor === targetIndex;
        cursor += 1;
        if (selected) snapped = { id: gap.id, region: gap.region, text: gap.answer?.value ?? gap.acceptedAnswers[0], confidence: gap.answer?.confidence ?? 1 };
        return !selected;
      });
      return { ...group, gaps };
    }
    if (group.type === "MATCHING_PAIRS") {
      const pairs = (group.pairs ?? []).filter((pair) => {
        const leftIndex = cursor++;
        const rightIndex = cursor++;
        const selectedLeft = leftIndex === targetIndex;
        const selectedRight = rightIndex === targetIndex;
        if (selectedLeft) snapped = { id: pair.id, region: pair.left.region, text: pair.left.text ?? pair.left.imageAlt ?? undefined, confidence: 1 };
        if (selectedRight) snapped = { id: pair.id, region: pair.right.region, text: pair.right.text ?? pair.right.imageAlt ?? undefined, confidence: 1 };
        return !selectedLeft && !selectedRight;
      }).map((pair, index) => ({ ...pair, number: index + 1 }));
      return { ...group, pairs };
    }
    if (group.type === "MULTIPLE_CHOICE") {
      const questions = (group.questions ?? []).flatMap((question) => {
        let removeQuestion = false;
        if (question.promptRegion) {
          const selected = cursor++ === targetIndex;
          if (selected) {
            snapped = { id: question.id, region: question.promptRegion, text: question.prompt, confidence: 1 };
            removeQuestion = true;
          }
        }
        const options = question.options.filter((option) => {
          if (!option.region) return true;
          const selected = cursor++ === targetIndex;
          if (selected) snapped = { id: option.id, region: option.region, text: option.text, confidence: option.confidence ?? 1 };
          return !selected;
        }).map((option, order) => ({ ...option, order }));
        return removeQuestion ? [] : [{ ...question, options, correctOptionIds: question.correctOptionIds.filter((id) => options.some((option) => option.id === id)) }];
      });
      return { ...group, questions };
    }
    const cards = (group.cards ?? []).filter((card) => {
      let selected = false;
      if (card.front.region) {
        selected = cursor++ === targetIndex;
        if (selected) snapped = { id: card.id, region: card.front.region, text: card.front.text ?? undefined, confidence: card.front.confidence };
      }
      if (card.back?.region) {
        const selectedBack = cursor++ === targetIndex;
        if (selectedBack) snapped = { id: card.id, region: card.back.region, text: card.back.text ?? undefined, confidence: card.back.confidence };
        selected = selected || selectedBack;
      }
      return !selected;
    }).map((card, order) => ({ ...card, order }));
    return { ...group, cards };
  });
  return snapped ? { groups: nextGroups, snapped } : null;
}
function cardSide(region: WorksheetRegion, text?: string, confidence = 1) { return text
  ? { kind: "TEXT" as const, text, region, provenance: "VISIBLE_TEXT" as const, confidence, confirmed: confidence >= .75 }
  : { kind: "IMAGE" as const, region, provenance: "TEACHER" as const, confidence: 1, confirmed: true }; }
function regions(groups: WorksheetInteractionGroup[]): WorksheetRegion[] { const result: WorksheetRegion[] = []; groups.forEach((group) => { group.gaps?.forEach((item) => result.push(item.region)); group.pairs?.forEach((pair) => { result.push(pair.left.region, pair.right.region); }); group.questions?.forEach((question) => { if (question.promptRegion) result.push(question.promptRegion); question.options.forEach((option) => { if (option.region) result.push(option.region); }); }); group.cards?.forEach((card) => { if (card.front.region) result.push(card.front.region); if (card.back?.region) result.push(card.back.region); }); }); return result; }
const sectionTypes: WorksheetSectionType[] = ["TYPED_GAPS","SINGLE_CHOICE_GAPS","WORD_BANK_GAPS","FORM_TRANSFORM","MATCHING_TEXT_TEXT","MATCHING_TEXT_IMAGE","MULTIPLE_CHOICE","FLASHCARDS","STATIC_CONTENT"];

function WorksheetGroupEditors({ groups, onChange, onRemove }: { groups: WorksheetInteractionGroup[]; onChange: (group: WorksheetInteractionGroup) => void; onRemove: (groupId: string) => void }) {
  const { t } = useAppTranslation();
  return <div className="worksheet-group-editors">{[...groups].sort((a, b) => a.order - b.order).map((group) => <section key={group.id}><header><h3>{t(`materials.worksheet.group.${group.type}`)}</h3><IconButton label={t("materials.worksheet.removeGroup")} onClick={() => onRemove(group.id)}><Trash2 /></IconButton></header>
    {group.type === "FILL_GAPS" ? <><label>{t("materials.worksheet.gapMode")}<select value={group.gapMode ?? "TYPED"} onChange={(event) => onChange({ ...group, gapMode: event.target.value as WorksheetInteractionGroup["gapMode"] })}>{["TYPED","SINGLE_CHOICE","WORD_BANK","FORM_TRANSFORM"].map((mode) => <option key={mode} value={mode}>{t(`materials.worksheet.gapModes.${mode}`)}</option>)}</select></label>{group.gaps?.map((gap, index) => <GapEditor gap={gap} index={index} key={gap.id} mode={group.gapMode ?? "TYPED"} onChange={(next) => onChange({ ...group, gaps: replaceAt(group.gaps ?? [], index, next), wordBank: group.gapMode === "WORD_BANK" ? uniqueText([...(group.wordBank ?? []), ...next.acceptedAnswers]) : group.wordBank })} onRemove={() => onChange({ ...group, gaps: (group.gaps ?? []).filter((item) => item.id !== gap.id) })} />)}{group.gapMode === "WORD_BANK" ? <label>{t("materials.worksheet.wordBank")}<input className="playsay-input" value={(group.wordBank ?? []).join(", ")} onChange={(event) => onChange({ ...group, wordBank: splitList(event.target.value) })} /></label> : null}</> : null}
    {group.type === "MATCHING_PAIRS" ? group.pairs?.map((pair, index) => <PairEditor key={pair.id} pair={pair} onChange={(next) => onChange({ ...group, pairs: replaceAt(group.pairs ?? [], index, next) })} onRemove={() => onChange({ ...group, pairs: (group.pairs ?? []).filter((item) => item.id !== pair.id).map((item, pairIndex) => ({ ...item, number: pairIndex + 1 })) })} />) : null}
    {group.type === "MULTIPLE_CHOICE" ? group.questions?.map((question, questionIndex) => <ChoiceEditor key={question.id} question={question} onChange={(next) => onChange({ ...group, questions: replaceAt(group.questions ?? [], questionIndex, next) })} onRemove={() => onChange({ ...group, questions: (group.questions ?? []).filter((item) => item.id !== question.id) })} />) : null}
    {group.type === "FLASHCARDS" ? group.cards?.map((card, cardIndex) => <FlashcardEditor card={card} key={card.id} onChange={(next) => onChange({ ...group, cards: replaceAt(group.cards ?? [], cardIndex, next) })} onMove={(direction) => onChange({ ...group, cards: moveOrdered(group.cards ?? [], cardIndex, cardIndex + direction) })} onRemove={() => onChange({ ...group, cards: (group.cards ?? []).filter((item) => item.id !== card.id).map((item, order) => ({ ...item, order })) })} />) : null}
  </section>)}</div>;
}

function GapEditor({ gap, index, mode, onChange, onRemove }: { gap: WorksheetGap; index: number; mode: NonNullable<WorksheetInteractionGroup["gapMode"]>; onChange: (gap: WorksheetGap) => void; onRemove: () => void }) {
  const { t } = useAppTranslation();
  const answer = gap.answer?.value ?? gap.acceptedAnswers[0] ?? "";
  return <fieldset className="worksheet-item-editor"><legend>{t("materials.worksheet.answerNumber", { number: index + 1 })}</legend><IconButton label={t("materials.worksheet.removeItem")} onClick={onRemove}><Trash2 /></IconButton>
    <label>{t("materials.worksheet.primaryAnswer")}<input className="playsay-input" value={answer} onChange={(event) => { const value = event.target.value; onChange({ ...gap, answer: value ? teacherValue(value) : null, acceptedAnswers: uniqueText([value, ...gap.acceptedAnswers.slice(1)]) }); }} /></label>
    <label>{t("materials.worksheet.acceptedAnswers")}<input className="playsay-input" value={gap.acceptedAnswers.join(", ")} onChange={(event) => onChange({ ...gap, acceptedAnswers: splitList(event.target.value) })} /></label>
    {mode === "FORM_TRANSFORM" ? <label>{t("materials.worksheet.baseForm")}<input className="playsay-input" value={gap.baseForm ?? ""} onChange={(event) => onChange({ ...gap, baseForm: event.target.value })} /></label> : null}
    {mode === "SINGLE_CHOICE" ? <label>{t("materials.worksheet.options")}<input className="playsay-input" value={gap.options.join(", ")} onChange={(event) => onChange({ ...gap, options: splitList(event.target.value) })} /></label> : null}
    <label>{t("materials.worksheet.distractors")}<input className="playsay-input" value={gap.distractors.map((item) => item.value).join(", ")} onChange={(event) => onChange({ ...gap, distractors: splitList(event.target.value).map(teacherValue) })} /></label>
    {gap.answer && (!gap.answer.confirmed || gap.answer.confidence < .75) ? <label className="worksheet-confidence"><input checked={gap.answer.confirmed} onChange={(event) => onChange({ ...gap, answer: { ...gap.answer!, confirmed: event.target.checked } })} type="checkbox" />{t("materials.worksheet.confirmValue", { provenance: gap.answer.provenance, confidence: Math.round(gap.answer.confidence * 100) })}</label> : <Provenance value={gap.answer} />}
  </fieldset>;
}

function PairEditor({ pair, onChange, onRemove }: { pair: WorksheetPair; onChange: (pair: WorksheetPair) => void; onRemove: () => void }) {
  const { t } = useAppTranslation();
  return <fieldset className="worksheet-pair-editor"><legend>{t("materials.worksheet.pairNumber", { number: pair.number })}</legend><label>{t("materials.worksheet.contentKind")}<select value={pair.left.kind} onChange={(event) => onChange({ ...pair, left: { ...pair.left, kind: event.target.value as "TEXT" | "IMAGE" } })}><option value="TEXT">{t("materials.worksheet.contentKinds.TEXT")}</option><option value="IMAGE">{t("materials.worksheet.contentKinds.IMAGE")}</option></select></label><input aria-label={t("materials.worksheet.pairLeftText", { number: pair.number })} className="playsay-input" value={pair.left.text ?? pair.left.imageAlt ?? ""} onChange={(event) => onChange({ ...pair, left: { ...pair.left, text: pair.left.kind === "TEXT" ? event.target.value : null, imageAlt: pair.left.kind === "IMAGE" ? event.target.value : null } })} /><label>{t("materials.worksheet.contentKind")}<select value={pair.right.kind} onChange={(event) => onChange({ ...pair, right: { ...pair.right, kind: event.target.value as "TEXT" | "IMAGE" } })}><option value="TEXT">{t("materials.worksheet.contentKinds.TEXT")}</option><option value="IMAGE">{t("materials.worksheet.contentKinds.IMAGE")}</option></select></label><input aria-label={t("materials.worksheet.pairRightText", { number: pair.number })} className="playsay-input" value={pair.right.text ?? pair.right.imageAlt ?? ""} onChange={(event) => onChange({ ...pair, right: { ...pair.right, text: pair.right.kind === "TEXT" ? event.target.value : null, imageAlt: pair.right.kind === "IMAGE" ? event.target.value : null } })} /><Button onClick={() => onChange({ ...pair, left: pair.right, right: pair.left })} type="button" variant="outline">{t("materials.worksheet.swap")}</Button><IconButton label={t("materials.worksheet.removePair")} onClick={onRemove}><Trash2 /></IconButton></fieldset>;
}

function ChoiceEditor({ question, onChange, onRemove }: { question: { id: string; prompt: string; promptRegion?: WorksheetRegion | null; options: WorksheetChoiceOption[]; correctOptionIds: string[] }; onChange: (question: { id: string; prompt: string; promptRegion?: WorksheetRegion | null; options: WorksheetChoiceOption[]; correctOptionIds: string[] }) => void; onRemove: () => void }) {
  const { t } = useAppTranslation();
  return <fieldset className="worksheet-choice-editor"><legend>{t("materials.worksheet.choiceQuestion")}</legend><IconButton label={t("materials.worksheet.removeQuestion")} onClick={onRemove}><Trash2 /></IconButton><input className="playsay-input" placeholder={t("materials.worksheet.choicePrompt")} value={question.prompt} onChange={(event) => onChange({ ...question, prompt: event.target.value })} />{question.options.map((option, optionIndex) => <div key={option.id}><label><input aria-label={t("materials.worksheet.correctOption", { number: optionIndex + 1 })} checked={question.correctOptionIds.includes(option.id)} onChange={(event) => onChange({ ...question, correctOptionIds: event.target.checked ? [...question.correctOptionIds, option.id] : question.correctOptionIds.filter((id) => id !== option.id) })} type="checkbox" /><span>{optionIndex + 1}</span></label><input className="playsay-input" value={option.text} onChange={(event) => onChange({ ...question, options: replaceAt(question.options, optionIndex, { ...option, text: event.target.value, provenance: "TEACHER", confidence: 1, confirmed: true }) })} /><Provenance value={option} /><IconButton label={t("materials.worksheet.removeOption")} onClick={() => onChange({ ...question, options: question.options.filter((item) => item.id !== option.id).map((item, order) => ({ ...item, order })), correctOptionIds: question.correctOptionIds.filter((id) => id !== option.id) })}><Trash2 /></IconButton></div>)}<Button onClick={() => onChange({ ...question, options: [...question.options, { id: crypto.randomUUID(), order: question.options.length, text: "", provenance: "TEACHER", confidence: 1, confirmed: true }] })} type="button" variant="outline">{t("materials.worksheet.addOption")}</Button></fieldset>;
}

function FlashcardEditor({ card, onChange, onMove, onRemove }: { card: WorksheetFlashcard; onChange: (card: WorksheetFlashcard) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  const { t } = useAppTranslation();
  const back = card.back ?? { kind: "TEXT" as const, text: "", provenance: "TEACHER" as const, confidence: 1, confirmed: true };
  return <fieldset className="worksheet-flashcard-editor"><legend>{t("materials.worksheet.cardNumber", { number: card.order + 1 })}</legend><IconButton disabled={card.order === 0} label={t("materials.worksheet.moveUp")} onClick={() => onMove(-1)}><ArrowUp /></IconButton><IconButton label={t("materials.worksheet.moveDown")} onClick={() => onMove(1)}><ArrowDown /></IconButton>{(["front", "back"] as const).map((sideName) => { const side = sideName === "front" ? card.front : back; return <div key={sideName}><strong>{t(`materials.worksheet.cardSides.${sideName}`)}</strong><select value={side.kind} onChange={(event) => onChange({ ...card, [sideName]: { ...side, kind: event.target.value as "TEXT" | "IMAGE", provenance: "TEACHER", confidence: 1, confirmed: true } })}><option value="TEXT">{t("materials.worksheet.contentKinds.TEXT")}</option><option value="IMAGE">{t("materials.worksheet.contentKinds.IMAGE")}</option></select><input className="playsay-input" value={side.text ?? ""} onChange={(event) => onChange({ ...card, [sideName]: { ...side, text: event.target.value, provenance: "TEACHER", confidence: 1, confirmed: true } })} /><Provenance value={side} /></div>; })}<Button onClick={() => onChange({ ...card, front: back, back: card.front })} type="button" variant="outline">{t("materials.worksheet.swap")}</Button><IconButton label={t("materials.worksheet.removeCard")} onClick={onRemove}><Trash2 /></IconButton></fieldset>;
}

function Provenance({ value }: { value?: { provenance?: string; confidence?: number; confirmed?: boolean } | null }) {
  const { t } = useAppTranslation();
  if (!value?.provenance) return null;
  return <small className="worksheet-provenance">{t(`materials.worksheet.provenance.${value.provenance}`)} · {Math.round((value.confidence ?? 0) * 100)}%{value.confirmed ? ` · ${t("materials.worksheet.confirmed")}` : ""}</small>;
}

function teacherValue(value: string) { return { value, provenance: "TEACHER" as const, confidence: 1, confirmed: true }; }
function splitList(value: string) { return uniqueText(value.split(/[,;\n]/)); }
function uniqueText(values: string[]) { return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))); }
function replaceAt<T>(items: T[], index: number, value: T) { return items.map((item, itemIndex) => itemIndex === index ? value : item); }
function moveOrdered<T extends { order: number }>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  return move(items, from, to).map((item, order) => ({ ...item, order }));
}
