import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Circle, Eraser, Hand, Maximize2, Minus, MousePointer2, PenLine, Plus, RectangleHorizontal, Redo2, Trash2, Type, Undo2 } from "lucide-react";
import { useAppTranslation } from "../../../shared/i18n";
import type { LessonWhiteboard as Board, WhiteboardCommand } from "../../../shared/api/whiteboard";
import { annotationElementBounds, eraseAnnotationElementsAt, estimateAnnotationTextSize, type AnnotationElement, type AnnotationResizeHandle, type AnnotationTool } from "../model/annotation";
import { boundedCamera, cameraRegion, fitWhiteboardContent, fitWhiteboardRegion, initialWhiteboardCamera, worldPoint, type WhiteboardCamera } from "../model/whiteboardGeometry";
import { useWhiteboardRuntime } from "../hooks/useLessonWhiteboard";
import { AnnotationLayer } from "./AnnotationLayer";

const tools = [
  ["pointer", MousePointer2], ["pen", PenLine], ["eraser", Eraser], ["line", Minus], ["arrow", ArrowRight],
  ["rectangle", RectangleHorizontal], ["ellipse", Circle], ["text", Type],
] as const;
type Point = { x: number; y: number };
type Gesture = { kind: "draw"; id: string; start: Point; tool: AnnotationTool } |
  { kind: "move" | "resize"; id: string; start: Point; initial: AnnotationElement; handle?: AnnotationResizeHandle } |
  { kind: "pan"; start: Point; camera: WhiteboardCamera };

export function LessonWhiteboard({ board, actor, name, active, pending = false, onUpdate, targetLabel }: {
  board: Board; actor: string; name: string; active: boolean; pending?: boolean;
  onUpdate?: (command: WhiteboardCommand) => void; targetLabel: string;
}) {
  const { t } = useAppTranslation();
  const live = useWhiteboardRuntime(board, actor, name, active);
  const { runtime } = live;
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 650 });
  const [camera, setCamera] = useState(initialWhiteboardCamera);
  const cameraRef = useRef(camera); cameraRef.current = camera;
  const [follow, setFollow] = useState(true);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [hand, setHand] = useState(false);
  const [color, setColor] = useState(board.background === "#202433" ? "#ffffff" : "#202433");
  const [strokeWidth, setStrokeWidth] = useState<4 | 8 | 16>(4);
  const [fontSize, setFontSize] = useState(30);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const [limit, setLimit] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; midpoint: Point; camera: WhiteboardCamera } | null>(null);
  const suppressTouch = useRef(false);
  const penPointer = useRef<number | null>(null);
  const canDraw = board.canDraw && !board.readOnly && ["connected", "saved", "unsaved"].includes(live.status);
  const elementsRef = useRef(live.elements); elementsRef.current = live.elements;
  const cameraPublishTimer = useRef<number | null>(null);
  const cameraPublishRegion = useRef<ReturnType<typeof cameraRegion> | null>(null);
  const viewport = useMemo(() => cameraRegion(camera, size.width, size.height), [camera, size]);
  cameraPublishRegion.current = viewport;

  useEffect(() => {
    const node = stage.current; if (!node) return;
    const observer = new ResizeObserver(() => { const rect = node.getBoundingClientRect(); if (rect.width && rect.height) setSize({ width: rect.width, height: rect.height }); });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!board.canManage && follow && live.camera) setCamera(fitWhiteboardRegion(live.camera, size.width, size.height));
  }, [board.canManage, follow, live.camera, size]);
  useEffect(() => {
    if (!active || !board.canManage || board.readOnly) return;
    if (cameraPublishTimer.current === null) cameraPublishTimer.current = window.setTimeout(() => {
      cameraPublishTimer.current = null;
      if (cameraPublishRegion.current) runtime.publishCamera(cameraPublishRegion.current);
    }, 100);
  }, [active, board.canManage, board.readOnly, runtime, camera]);
  useEffect(() => () => { if (cameraPublishTimer.current !== null) window.clearTimeout(cameraPublishTimer.current); }, [runtime]);
  useEffect(() => { if (confirm) cancelButton.current?.focus(); }, [confirm]);
  useEffect(() => {
    const node = stage.current; if (!node) return;
    const wheel = (event: WheelEvent) => {
      if ((!active && !board.readOnly) || (event.target instanceof Element && event.target.closest("textarea,input,[contenteditable=true]"))) return;
      event.preventDefault(); setFollow(false);
      if (event.ctrlKey || event.metaKey) {
        const before = point(event); const current = cameraRef.current;
        const next = boundedCamera({ ...current, scale: current.scale * Math.exp(-event.deltaY * .004) });
        const after = worldPoint(event.clientX, event.clientY, node.getBoundingClientRect(), next);
        setCamera(boundedCamera({ ...next, x: next.x + before.x - after.x, y: next.y + before.y - after.y }));
      } else setCamera(current => boundedCamera({ ...current, x: current.x + event.deltaX / current.scale, y: current.y + event.deltaY / current.scale }));
    };
    node.addEventListener("wheel", wheel, { passive: false }); return () => node.removeEventListener("wheel", wheel);
  }, [active, board.readOnly]);

  const visible = useMemo(() => live.elements.filter(element => {
    if (element.id === editing || element.id === selected) return true;
    const b = annotationElementBounds(element);
    return b.x + b.width >= viewport.x - 100 && b.y + b.height >= viewport.y - 100 && b.x <= viewport.x + viewport.width + 100 && b.y <= viewport.y + viewport.height + 100;
  }), [editing, live.elements, selected, viewport]);
  const editable = (id: string) => canDraw && (board.canManage || elementsRef.current.find(e => e.id === id)?.ownerSubject === actor);
  function point(event: { clientX: number; clientY: number }): Point {
    const rect = stage.current?.getBoundingClientRect();
    return rect ? worldPoint(event.clientX, event.clientY, rect, cameraRef.current) : { x: 0, y: 0 };
  }
  function patch(id: string, value: Record<string, unknown>) { if (editable(id)) runtime.patch(id, value); }
  function begin(event: PointerEvent<SVGSVGElement>) {
    if (!canDraw || hand || space.current || suppressTouch.current || event.button !== 0 || (event.target instanceof Element && event.target.closest("textarea,input"))) return;
    const p = point(event);
    if (Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) { setLimit(true); return; }
    if (tool === "pointer") { setSelected(null); setEditing(null); return; }
    if (tool === "eraser") { erase(p); return; }
    const id = crypto.randomUUID();
    runtime.stopCapturing();
    const base = { id, pageId: "whiteboard", createdAt: Date.now(), color, strokeWidth };
    let shape: Record<string, unknown>;
    if (tool === "pen") shape = { ...base, kind: "stroke", points: [{ ...p, pageId: "whiteboard" }] };
    else if (tool === "arrow" || tool === "line") shape = { ...base, kind: tool, start: { ...p, pageId: "whiteboard" }, end: { ...p, pageId: "whiteboard" } };
    else shape = { ...base, kind: tool, x: p.x, y: p.y, width: tool === "text" ? 240 : 1, height: tool === "text" ? 70 : 1, fill: "transparent", ...(tool === "text" ? { text: "", fontSize, autoWidth: false, autoHeight: true } : {}) };
    runtime.patch(id, shape); setSelected(id);
    if (tool === "text") { event.preventDefault(); setEditing(id); setTool("pointer"); return; }
    gesture.current = { kind: "draw", id, start: p, tool };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function erase(p: Point) {
    const target = [...elementsRef.current].reverse().find(e => {
      if (!editable(e.id)) return false;
      if (e.kind === "stroke") return eraseAnnotationElementsAt([e], { ...p, pageId: "whiteboard" }).erased.length > 0;
      const b = annotationElementBounds(e); return p.x >= b.x - 8 && p.x <= b.x + b.width + 8 && p.y >= b.y - 8 && p.y <= b.y + b.height + 8;
    });
    if (target) runtime.remove(target.id);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const p = point(event); runtime.cursor(p);
    if (Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) { setLimit(true); return; }
    if (tool === "eraser" && event.buttons === 1 && canDraw) { erase(p); return; }
    const g = gesture.current; if (!g || g.kind === "pan" || !editable(g.id)) return;
    if (g.kind === "draw") {
      if (g.tool === "pen") {
        const e = elementsRef.current.find(e => e.id === g.id);
        if (e?.kind === "stroke") {
          if (e.points.length >= 5000) { setLimit(true); return; }
          const last = e.points[e.points.length - 1];
          if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1 / cameraRef.current.scale) return;
          patch(g.id, { points: [...e.points, { ...p, pageId: "whiteboard" }] });
        }
      } else if (g.tool === "arrow" || g.tool === "line") patch(g.id, { end: { ...p, pageId: "whiteboard" } });
      else patch(g.id, { x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), width: Math.max(1, Math.abs(p.x - g.start.x)), height: Math.max(1, Math.abs(p.y - g.start.y)) });
    } else {
      const dx = p.x - g.start.x, dy = p.y - g.start.y, e = g.initial;
      if (g.kind === "resize" && "width" in e) {
        const handle = g.handle ?? "se";
        patch(g.id, { x: e.x + (handle.includes("w") ? dx : 0), y: e.y + (handle.includes("n") ? dy : 0), width: Math.max(24, e.width + (handle.includes("w") ? -dx : handle.includes("e") ? dx : 0)), height: Math.max(24, e.height + (handle.includes("n") ? -dy : handle.includes("s") ? dy : 0)), ...(e.kind === "text" && /[ns]/.test(handle) ? { autoHeight: false } : {}) });
      } else if (e.kind === "stroke") patch(g.id, { points: e.points.map(q => ({ ...q, x: q.x + dx, y: q.y + dy })) });
      else if (e.kind === "line" || e.kind === "arrow") {
        if (g.kind === "resize") patch(g.id, { [g.handle === "start" ? "start" : "end"]: { ...p, pageId: "whiteboard" } });
        else patch(g.id, { start: { ...e.start, x: e.start.x + dx, y: e.start.y + dy }, end: { ...e.end, x: e.end.x + dx, y: e.end.y + dy } });
      } else patch(g.id, { x: e.x + dx, y: e.y + dy });
    }
  }
  function beginMove(event: PointerEvent<SVGElement>, id: string, handle?: AnnotationResizeHandle) {
    if (!editable(id) || hand || space.current) return;
    const initial = elementsRef.current.find(e => e.id === id); if (!initial) return;
    event.stopPropagation(); runtime.stopCapturing(); setSelected(id);
    gesture.current = { kind: handle ? "resize" : "move", id, start: point(event), initial, handle };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function captureDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest("textarea,input")) return;
    if (event.pointerType === "touch" && penPointer.current !== null) { event.stopPropagation(); event.preventDefault(); return; }
    if (event.pointerType === "pen") { if (gesture.current?.kind === "draw") runtime.remove(gesture.current.id); gesture.current = null; penPointer.current = event.pointerId; pointers.current.clear(); pinch.current = null; }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (event.pointerType === "touch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: cameraRef.current };
      if (gesture.current?.kind === "draw") runtime.remove(gesture.current.id);
      gesture.current = null; suppressTouch.current = true; event.stopPropagation(); event.preventDefault();
    } else if (hand || space.current || event.button === 1 || !canDraw) {
      event.preventDefault(); event.stopPropagation(); setFollow(false);
      gesture.current = { kind: "pan", start: { x: event.clientX, y: event.clientY }, camera: cameraRef.current };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  function captureMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" && penPointer.current !== null) { event.stopPropagation(); return; }
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()], base = pinch.current;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = stage.current?.getBoundingClientRect();
      const next = boundedCamera({ ...base.camera, scale: base.camera.scale * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, base.distance) });
      if (rect) {
        const before = worldPoint(base.midpoint.x, base.midpoint.y, rect, base.camera), after = worldPoint(midpoint.x, midpoint.y, rect, next);
        setFollow(false); setCamera(boundedCamera({ ...next, x: next.x + before.x - after.x, y: next.y + before.y - after.y }));
      }
      event.stopPropagation(); event.preventDefault();
    } else if (gesture.current?.kind === "pan") {
      const base = gesture.current; setCamera(boundedCamera({ ...base.camera, x: base.camera.x - (event.clientX - base.start.x) / base.camera.scale, y: base.camera.y - (event.clientY - base.start.y) / base.camera.scale })); event.stopPropagation();
    } else if (suppressTouch.current) event.stopPropagation();
  }
  function finish() { gesture.current = null; runtime.stopCapturing(); }
  const zoom = (factor: number) => { setFollow(false); setCamera(current => boundedCamera({ ...current, scale: current.scale * factor })); };
  const selectedElement = live.elements.find(e => e.id === selected);
  const lowContrast = contrast(color, board.background) < 3;

  return <section className="playsay-whiteboard" data-expanded={expanded} aria-label={t("whiteboard.title")}>
    <header className="playsay-whiteboard-controls">
      <span className="playsay-whiteboard-target">{targetLabel}</span>
      {board.canManage && !board.readOnly ? <>
        <label>{t("whiteboard.background")}<input type="color" value={board.background} disabled={pending} onChange={event => onUpdate?.({ background: event.target.value })}/></label>
        <select aria-label={t("whiteboard.background")} value={board.background} disabled={pending} onChange={event => onUpdate?.({ background: event.target.value })}>
          <option value="#ffffff">{t("whiteboard.white")}</option><option value="#fff8e8">{t("whiteboard.cream")}</option><option value="#dcebdc">{t("whiteboard.green")}</option><option value="#202433">{t("whiteboard.dark")}</option>
          {!["#ffffff", "#fff8e8", "#dcebdc", "#202433"].includes(board.background) ? <option value={board.background}>{t("whiteboard.custom")}</option> : null}
        </select>
        <label><input type="checkbox" checked={board.learnerInkEnabled} disabled={pending} onChange={event => onUpdate?.({ learnerInkEnabled: event.target.checked })}/>{t("whiteboard.learnerInk")}</label>
        <button type="button" ref={clearButton} disabled={pending} onClick={() => setConfirm(true)}><Trash2 aria-hidden="true"/>{t("whiteboard.clear")}</button>
        <button type="button" disabled={pending} onClick={() => onUpdate?.({ activeSurface: "MATERIAL" })}><ArrowLeft aria-hidden="true"/>{t("whiteboard.back")}</button>
      </> : null}
    </header>
    <div className="playsay-whiteboard-tools" role="toolbar" aria-label={t("classroom.annotation.toolbar")}>
      <button type="button" aria-pressed={hand} aria-label={t("whiteboard.hand")} onClick={() => { setHand(v => !v); setEditing(null); }}><Hand aria-hidden="true"/></button>
      {canDraw ? <>
        {tools.map(([id, Icon]) => <button key={id} type="button" aria-pressed={!hand && tool === id} aria-label={t(`classroom.annotation.${id}`)} title={t(`classroom.annotation.${id}`)} onClick={() => { setHand(false); setTool(id); setEditing(null); }}><Icon aria-hidden="true"/></button>)}
        <label>{t("whiteboard.ink")}<input type="color" value={color} onChange={event => setColor(event.target.value)}/></label>
        <select aria-label={t("whiteboard.width")} value={strokeWidth} onChange={event => setStrokeWidth(Number(event.target.value) as 4 | 8 | 16)}>{[4, 8, 16].map(value => <option key={value} value={value}>{value}</option>)}</select>
        {tool === "text" || selectedElement?.kind === "text" ? <select aria-label={t("whiteboard.fontSize")} value={fontSize} onChange={event => { const value = Number(event.target.value); setFontSize(value); if (selectedElement?.kind === "text") patch(selectedElement.id, { fontSize: value, ...estimateAnnotationTextSize({ ...selectedElement, fontSize: value as typeof selectedElement.fontSize }) }); }}>{[14, 18, 24, 30, 32].map(value => <option key={value}>{value}</option>)}</select> : null}
        <button type="button" disabled={!live.canUndo} onClick={runtime.undo} aria-label={t("classroom.annotation.undo")}><Undo2 aria-hidden="true"/></button>
        <button type="button" disabled={!live.canRedo} onClick={runtime.redo} aria-label={t("classroom.annotation.redo")}><Redo2 aria-hidden="true"/></button>
      </> : <span role="status">{t(board.readOnly ? "whiteboard.readOnly" : "whiteboard.watching")}</span>}
    </div>
    {board.readOnly && live.status === "error" ? <p role="alert">{t("whiteboard.failed")}</p> : null}
    <div ref={stage} className="playsay-whiteboard-stage" role="region" aria-label={t("whiteboard.title")} tabIndex={0} style={{ background: board.background }} data-hand={hand || !canDraw}
      onPointerDownCapture={captureDown} onPointerMoveCapture={captureMove}
      onPointerUpCapture={event => { if (event.pointerId === penPointer.current) penPointer.current = null; pointers.current.delete(event.pointerId); if (pointers.current.size < 2) pinch.current = null; if (!pointers.current.size) suppressTouch.current = false; if (gesture.current?.kind === "pan") gesture.current = null; }}
      onPointerCancelCapture={event => { if (event.pointerId === penPointer.current) penPointer.current = null; pointers.current.delete(event.pointerId); pinch.current = null; suppressTouch.current = false; finish(); }}
      onPointerLeave={() => runtime.cursor(null)}
      onKeyDown={event => {
        if (event.target instanceof Element && event.target.closest("textarea,input,[contenteditable=true]")) return;
        if (event.key === " ") { event.preventDefault(); space.current = true; }
        if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1.25); }
        if (event.key === "-") { event.preventDefault(); zoom(.8); }
        if (event.key.startsWith("Arrow")) { event.preventDefault(); setFollow(false); setCamera(c => boundedCamera({ ...c, x: c.x + (event.key === "ArrowRight" ? 80 : event.key === "ArrowLeft" ? -80 : 0) / c.scale, y: c.y + (event.key === "ArrowDown" ? 80 : event.key === "ArrowUp" ? -80 : 0) / c.scale })); }
      }} onKeyUp={event => { if (event.key === " ") space.current = false; }}>
      <AnnotationLayer viewport={viewport} elements={visible} tool={hand ? "pointer" : tool} readOnly={!canDraw || hand}
        selectedElementId={selected} editingElementId={editing} onBegin={begin} onMove={move} onEnd={finish}
        onMoveElement={(event, id) => beginMove(event, id)} onResizeElement={beginMove}
        onSelectElement={id => { if (!id || editable(id)) setSelected(id); }} onDeselect={() => setSelected(null)}
        onEditText={id => { if (editable(id)) setEditing(id); }} onFinishTextEditing={() => setEditing(null)}
        onTextChange={(id, text) => { const element = elementsRef.current.find(e => e.id === id); if (element?.kind === "text") patch(id, { text, ...estimateAnnotationTextSize(element, text) }); }} onElementSizeChange={(id, width, height) => patch(id, { width, height })}
        onDeleteSelected={() => { if (selected && editable(selected)) { runtime.remove(selected); setSelected(null); setEditing(null); } }}
        onUndo={runtime.undo} onRedo={runtime.redo} onAddMindMapNode={() => undefined} onMindMapKey={() => undefined}/>
      <svg className="playsay-whiteboard-cursors" viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`} preserveAspectRatio="none" aria-hidden="true">
        {live.cursors.map(cursor => <g key={cursor.id} transform={`translate(${cursor.x} ${cursor.y})`}><circle r={4 / camera.scale} fill={cursor.color}/><text x={8 / camera.scale} y={-8 / camera.scale} fontSize={12 / camera.scale} fill={cursor.color}>{cursor.name}</text></g>)}
      </svg>
    </div>
    <footer className="playsay-whiteboard-footer">
      <button type="button" onClick={() => zoom(.8)} aria-label={t("whiteboard.zoomOut")}><Minus aria-hidden="true"/></button>
      <output aria-label={t("whiteboard.zoom")}>{Math.round(camera.scale * 100)}%</output>
      <button type="button" onClick={() => zoom(1.25)} aria-label={t("whiteboard.zoomIn")}><Plus aria-hidden="true"/></button>
      <button type="button" onClick={() => { setFollow(false); setCamera(fitWhiteboardContent(live.elements, size.width, size.height)); }}>{t("whiteboard.fit")}</button>
      {!board.canManage && !follow && !board.readOnly ? <button type="button" onClick={() => setFollow(true)}>{t("whiteboard.follow")}</button> : null}
      <button type="button" aria-pressed={expanded} onClick={() => setExpanded(v => !v)} aria-label={t("whiteboard.expand")}><Maximize2 aria-hidden="true"/></button>
      <span role="status" aria-live="polite">{t(board.readOnly ? "whiteboard.readOnly" : live.status === "unsupported" ? "whiteboard.unsupported" : `whiteboard.status.${live.status}`)}</span>
      {["error", "unsupported"].includes(live.status) && !board.readOnly ? <button type="button" onClick={runtime.retry}>{t("whiteboard.retry")}</button> : null}
      {lowContrast && canDraw ? <span role="status">{t("whiteboard.contrast")}</span> : null}
      {limit || live.limited ? <span role="status">{t("whiteboard.limit")}</span> : null}
    </footer>
    {confirm ? <div className="playsay-whiteboard-confirm" role="alertdialog" aria-modal="true" aria-label={t("whiteboard.clearTitle")} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setConfirm(false); clearButton.current?.focus(); }
      if (event.key === "Tab") { const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); }
    }}><p>{t("whiteboard.clearMessage", { target: targetLabel })}</p><div><button type="button" ref={cancelButton} onClick={() => { setConfirm(false); clearButton.current?.focus(); }}>{t("whiteboard.cancel")}</button><button type="button" disabled={pending} onClick={() => { onUpdate?.({ clear: true }); setConfirm(false); clearButton.current?.focus(); }}>{t("whiteboard.clear")}</button></div></div> : null}
  </section>;
}

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
