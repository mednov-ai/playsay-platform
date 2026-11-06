import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Minus, MoveDownLeft, MoveDownRight, MoveUpLeft, MoveUpRight, Plus } from "lucide-react";
import { useAppTranslation } from "../../../shared/i18n";
import {
  FLOATING_ASPECT,
  FLOATING_DEFAULT_WIDTH,
  FLOATING_INSET,
  FLOATING_MIN_WIDTH,
  clampFloatingPosition,
  cornerPosition,
  floatingWidth,
  nearestFloatingCorner,
  type FloatingBounds,
  type FloatingCorner,
  type FloatingPosition,
} from "./classroomFloatingGeometry";
import "./ClassroomFloatingWindow.css";

type Gesture = {
  pointerId: number;
  kind: "move" | "resize";
  startX: number;
  startY: number;
  position: FloatingPosition;
  width: number;
  moved: boolean;
};

/** The positioned parent defines the area in which the window may dock. */
export function ClassroomFloatingWindow({ children }: { children: ReactNode }) {
  const { t } = useAppTranslation();
  const elementRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLButtonElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressResizeClickRef = useRef(false);
  const [bounds, setBounds] = useState<FloatingBounds | null>(null);
  const [corner, setCorner] = useState<FloatingCorner>("bottom-right");
  const [preferredWidth, setPreferredWidth] = useState(FLOATING_DEFAULT_WIDTH);
  const [dragPosition, setDragPosition] = useState<FloatingPosition | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useLayoutEffect(() => {
    const parent = elementRef.current?.parentElement;
    if (!parent) return;
    const shell = parent.closest(".playsay-classroom-shell");
    let observedBoard: Element | null = null;
    let normalInsets: { left: number; top: number; right: number; bottom: number } | null = null;
    let remeasure: number | null = null;
    const measure = () => {
      const rect = parent.getBoundingClientRect();
      const shellRect = shell?.getBoundingClientRect();
      const fallback = parent.dataset.boardFallback === "true";
      if (!fallback && shellRect) normalInsets = { left: rect.left - shellRect.left, top: rect.top - shellRect.top, right: shellRect.right - rect.right, bottom: shellRect.bottom - rect.bottom };
      const visual = window.visualViewport;
      const viewLeft = visual?.offsetLeft ?? 0;
      const viewTop = visual?.offsetTop ?? 0;
      const viewRight = viewLeft + (visual?.width ?? window.innerWidth);
      const viewBottom = viewTop + (visual?.height ?? window.innerHeight);
      const normal = fallback && shellRect && normalInsets ? { left: shellRect.left + normalInsets.left, top: shellRect.top + normalInsets.top, right: shellRect.right - normalInsets.right, bottom: shellRect.bottom - normalInsets.bottom } : rect;
      let left = Math.max(normal.left, viewLeft);
      let top = Math.max(normal.top, viewTop);
      let right = Math.min(normal.right, viewRight);
      let bottom = Math.min(normal.bottom, viewBottom);
      const boardWorkbench = shell?.querySelector('.playsay-workbench[data-whiteboard-active="true"]');
      const tabs = shell?.querySelector(".playsay-whiteboard-tabs");
      // Evaluate whether the board fits in the normal layout, even while the
      // temporary video row shifts the workbench down; otherwise the row could
      // cause its own entrance/exit condition to oscillate on scroll.
      const rowOffset = fallback ? rect.height : 0;
      if (tabs && tabs.getClientRects().length) top = Math.max(top, tabs.getBoundingClientRect().bottom - rowOffset);
      const stage = boardWorkbench?.querySelector(".playsay-whiteboard-stage") ?? null;
      if (stage !== observedBoard) {
        if (observedBoard) observer?.unobserve(observedBoard);
        if (stage) observer?.observe(stage);
        observedBoard = stage;
      }
      if (boardWorkbench) {
        // Dock inside the visible drawing surface, never over the board's controls.
        const stageRect = stage?.getBoundingClientRect();
        const workbenchRect = boardWorkbench.getBoundingClientRect();
        if (!stageRect) {
          right = left;
          bottom = top;
        } else {
          left = Math.max(left, stageRect.left, workbenchRect.left);
          top = Math.max(top, stageRect.top - rowOffset, workbenchRect.top - rowOffset);
          right = Math.min(right, stageRect.right, workbenchRect.right);
          bottom = Math.min(bottom, stageRect.bottom - rowOffset, workbenchRect.bottom);
        }
      }
      const needsFallback = Boolean(boardWorkbench && (right - left < FLOATING_MIN_WIDTH + FLOATING_INSET * 2 || bottom - top < FLOATING_MIN_WIDTH / FLOATING_ASPECT + FLOATING_INSET * 2));
      if (needsFallback !== fallback) {
        parent.dataset.boardFallback = String(needsFallback);
        if (remeasure !== null) cancelAnimationFrame(remeasure);
        remeasure = requestAnimationFrame(() => { remeasure = null; measure(); });
        return;
      }
      if (fallback) {
        left = Math.max(rect.left, viewLeft);
        top = Math.max(rect.top, viewTop);
        right = Math.min(rect.right, viewRight);
        bottom = Math.min(rect.bottom, viewBottom);
      }
      setBounds({ left: left - rect.left, top: top - rect.top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(parent);
    if (shell) observer?.observe(shell);
    const mutations = shell && typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    mutations?.observe(shell!, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-whiteboard-active", "data-expanded"] });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      if (remeasure !== null) cancelAnimationFrame(remeasure);
      delete parent.dataset.boardFallback;
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, []);

  const width = bounds ? floatingWidth(preferredWidth, bounds) : FLOATING_DEFAULT_WIDTH;
  const position = bounds ? (dragPosition ? clampFloatingPosition(dragPosition, width, bounds) : cornerPosition(corner, width, bounds)) : { left: 12, top: 12 };

  function startGesture(event: PointerEvent<HTMLElement>, kind: Gesture["kind"]) {
    if (!bounds || event.button !== 0) return;
    if (kind === "move" && (event.target as HTMLElement).closest("button, a, input, select, textarea, summary, [role=button], .playsay-tablet-other-list")) return;
    // Keep the native click produced by a short touch on the resize button in WebKit.
    // touch-action on the handle prevents scrolling during the gesture.
    if (kind === "move") event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (kind === "resize") suppressResizeClickRef.current = false;
    gestureRef.current = { pointerId: event.pointerId, kind, startX: event.clientX, startY: event.clientY, position, width, moved: false };
    if (kind === "move") setMenuOpen(false);
  }

  function moveGesture(event: PointerEvent<HTMLElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !bounds) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) <= 4) return;
    if (!gesture.moved) {
      gesture.moved = true;
      if (gesture.kind === "resize") setMenuOpen(false);
    }
    if (gesture.kind === "move") {
      setDragPosition(clampFloatingPosition({ left: gesture.position.left + dx, top: gesture.position.top + dy }, width, bounds));
    } else {
      // The inward-facing edge moves vertically; the opposite corner stays anchored.
      const delta = (corner.startsWith("bottom") ? -dy : dy) * FLOATING_ASPECT;
      setPreferredWidth(floatingWidth(gesture.width + delta, bounds));
    }
  }

  function endGesture(event: PointerEvent<HTMLElement>, cancelled: boolean) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (gesture.kind === "move" && !cancelled && bounds) {
      const positionAtRelease = clampFloatingPosition({ left: gesture.position.left + event.clientX - gesture.startX, top: gesture.position.top + event.clientY - gesture.startY }, width, bounds);
      setCorner(nearestFloatingCorner(positionAtRelease, width, bounds));
    }
    if (gesture.kind === "resize" && cancelled) setPreferredWidth(gesture.width);
    if (gesture.kind === "resize" && !cancelled && (gesture.moved || Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4)) {
      suppressResizeClickRef.current = true;
      // A browser-generated click follows pointerup in the same event turn; do not suppress a later intentional tap.
      window.setTimeout(() => { suppressResizeClickRef.current = false; }, 0);
    }
    gestureRef.current = null;
    setDragPosition(null);
  }

  const style: CSSProperties = { left: position.left, top: position.top, width, aspectRatio: `${FLOATING_ASPECT}` };
  // Open toward the center of the usable area, keeping the grip available when there is room.
  const menuStyle: CSSProperties = bounds ? {
    left: Math.max(bounds.left + 12 - position.left, Math.min((width - 132) / 2, bounds.left + bounds.width - 12 - position.left - 132)),
    top: Math.max(bounds.top + 12 - position.top, Math.min(corner.startsWith("bottom") ? -92 : width / FLOATING_ASPECT + 4, bounds.top + bounds.height - 12 - position.top - 88)),
  } : {};
  const corners: Array<{ corner: FloatingCorner; label: string; icon: ReactNode }> = [
    { corner: "top-left", label: t("classroom.floatingVideo.topLeft"), icon: <MoveUpLeft /> },
    { corner: "top-right", label: t("classroom.floatingVideo.topRight"), icon: <MoveUpRight /> },
    { corner: "bottom-left", label: t("classroom.floatingVideo.bottomLeft"), icon: <MoveDownLeft /> },
    { corner: "bottom-right", label: t("classroom.floatingVideo.bottomRight"), icon: <MoveDownRight /> },
  ];

  return (
    <div
      ref={elementRef}
      className="classroom-floating-window"
      data-resize-edge={corner.startsWith("bottom") ? "top" : "bottom"}
      style={style}
      onPointerDown={(event) => startGesture(event, "move")}
      onPointerMove={moveGesture}
      onPointerUp={(event) => endGesture(event, false)}
      onPointerCancel={(event) => endGesture(event, true)}
      onLostPointerCapture={(event) => endGesture(event, true)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          event.stopPropagation();
          setMenuOpen(false);
          resizeRef.current?.focus();
        }
      }}
    >
      <div className="classroom-floating-window__content">{children}</div>
      <button
        ref={resizeRef}
        type="button"
        className="classroom-floating-window__resize"
        data-edge={corner.startsWith("bottom") ? "top" : "bottom"}
        aria-label={`${t("classroom.floatingVideo.resize")}. ${t("classroom.floatingVideo.options")}`}
        aria-expanded={menuOpen}
        title={t("classroom.floatingVideo.resize")}
        onPointerDown={(event) => startGesture(event, "resize")}
        onPointerMove={moveGesture}
        onPointerUp={(event) => endGesture(event, false)}
        onPointerCancel={(event) => endGesture(event, true)}
        onLostPointerCapture={(event) => endGesture(event, true)}
        onClick={(event) => {
          if (suppressResizeClickRef.current && event.detail !== 0) {
            suppressResizeClickRef.current = false;
            return;
          }
          // WebKit does not consistently focus buttons after mouse or touch activation.
          if (!menuOpen) resizeRef.current?.focus();
          setMenuOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (!bounds) return;
          if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
            event.preventDefault();
            const grows = event.key === "ArrowRight" || (event.key === "ArrowUp" && corner.startsWith("bottom")) || (event.key === "ArrowDown" && corner.startsWith("top"));
            const delta = grows ? 40 : -40;
            setPreferredWidth(floatingWidth(width + delta, bounds));
          }
        }}
      >
        <span className="classroom-floating-window__grip" aria-hidden="true"><span /><span /><span /></span>
      </button>
      {menuOpen && (
        <div className="classroom-floating-window__menu" style={menuStyle} role="group" aria-label={t("classroom.floatingVideo.options")} onPointerDown={(event) => event.stopPropagation()}>
          {corners.map((item) => (
            <button key={item.corner} type="button" aria-label={item.label} title={item.label} aria-pressed={corner === item.corner} onClick={() => { setCorner(item.corner); setMenuOpen(false); resizeRef.current?.focus(); }}>
              {item.icon}
            </button>
          ))}
          <button type="button" aria-label={t("classroom.floatingVideo.smaller")} title={t("classroom.floatingVideo.smaller")} onClick={() => bounds && setPreferredWidth(floatingWidth(width - 40, bounds))}><Minus aria-hidden="true" /></button>
          <button type="button" aria-label={t("classroom.floatingVideo.larger")} title={t("classroom.floatingVideo.larger")} onClick={() => bounds && setPreferredWidth(floatingWidth(width + 40, bounds))}><Plus aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
}
