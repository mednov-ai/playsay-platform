import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  fetchScheduledLessonMaterialAnnotation,
  saveScheduledLessonMaterialAnnotation,
} from "../../../shared/api/playsay";
import {
  annotationContentFromElements,
  annotationContentFromJson,
  compareAnnotationElements,
  emptyAnnotationContent,
  eraseAnnotationElementsAt,
  isStrokeStyledElement,
  moveAnnotationElement,
  resizeAnnotationElement,
  svgPointFromEvent,
  type AnnotationElement,
  type AnnotationPoint,
  type AnnotationStroke,
  type AnnotationStrokeWidth,
  type AnnotationTool,
} from "../model/annotation";

type LiveAnnotationSync = {
  elements: AnnotationElement[];
  ready: boolean;
  setElements: (updater: (current: AnnotationElement[]) => AnnotationElement[]) => void;
};

type AnnotationHistoryEntry = {
  after: AnnotationElement[];
  before: AnnotationElement[];
};

type ActiveInteraction =
  | { erased: AnnotationStroke[]; mode: "erase" }
  | { before: AnnotationElement; id: string; mode: "create" }
  | {
      before: AnnotationElement;
      handle?: "end" | "ne" | "nw" | "se" | "start" | "sw";
      id: string;
      mode: "move" | "resize";
      start: AnnotationPoint;
    };

export function useLessonAnnotation({
  initialPageId,
  liveAnnotation,
  lessonId,
  materialId,
}: {
  initialPageId?: string | null;
  liveAnnotation?: LiveAnnotationSync | null;
  lessonId: string;
  materialId?: string | null;
}) {
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pointer");
  const [annotationColor, setAnnotationColor] = useState("#ff5c00");
  const [annotationStrokeWidth, setAnnotationStrokeWidth] = useState<AnnotationStrokeWidth>(8);
  const [activePageId, setActivePageId] = useState(initialPageId?.trim() || defaultAnnotationPageId);
  const [localAnnotationElements, setLocalAnnotationElements] = useState<AnnotationElement[]>([]);
  const [annotationReady, setAnnotationReady] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canRedo: false, canUndo: false });
  const activeInteractionRef = useRef<ActiveInteraction | null>(null);
  const captureTargetRef = useRef<SVGSVGElement | null>(null);
  const elementsRef = useRef<AnnotationElement[]>([]);
  const lastSyncedAnnotationRef = useRef("");
  const liveAnnotationRef = useRef<LiveAnnotationSync | null>(liveAnnotation ?? null);
  const liveElementCountRef = useRef(0);
  const redoHistoryRef = useRef<AnnotationHistoryEntry[]>([]);
  const textEditBeforeRef = useRef<AnnotationElement | null>(null);
  const undoHistoryRef = useRef<AnnotationHistoryEntry[]>([]);
  const annotationElements = liveAnnotation?.elements ?? localAnnotationElements;
  const setAnnotationElements = liveAnnotation?.setElements ?? setLocalAnnotationElements;
  const normalizedInitialPageId = initialPageId?.trim() || defaultAnnotationPageId;

  useEffect(() => {
    liveAnnotationRef.current = liveAnnotation ?? null;
  }, [liveAnnotation]);

  useEffect(() => {
    elementsRef.current = annotationElements;
  }, [annotationElements]);

  useEffect(() => {
    liveElementCountRef.current = liveAnnotation?.elements.length ?? 0;
  }, [liveAnnotation?.elements.length]);

  useEffect(() => {
    if (!materialId) {
      setAnnotationReady(false);
      setActivePageId(normalizedInitialPageId);
      replaceLocalElements([]);
      lastSyncedAnnotationRef.current = "";
      return undefined;
    }

    let cancelled = false;

    async function loadAnnotation() {
      try {
        const annotation = await fetchScheduledLessonMaterialAnnotation(lessonId);
        const content = annotationContentFromJson(annotation?.content, normalizedInitialPageId);
        const serialized = JSON.stringify(content);
        if (!cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          setActivePageId(content.activePageId);
          const currentLiveAnnotation = liveAnnotationRef.current;
          if (currentLiveAnnotation) {
            if (liveElementCountRef.current === 0 && content.elements.length > 0) {
              currentLiveAnnotation.setElements(() => content.elements);
            }
          } else {
            replaceLocalElements(content.elements);
          }
        }
      } catch {
        const content = emptyAnnotationContent(normalizedInitialPageId);
        const serialized = JSON.stringify(content);
        if (!liveAnnotationRef.current && !cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          replaceLocalElements(content.elements);
        }
      } finally {
        if (!cancelled) {
          setAnnotationReady(true);
        }
      }
    }

    setAnnotationReady(false);
    setActivePageId(normalizedInitialPageId);
    lastSyncedAnnotationRef.current = "";
    replaceLocalElements([]);
    resetHistory();
    setSelectedElementId(null);
    setEditingElementId(null);
    void loadAnnotation();

    const intervalId = window.setInterval(() => {
      void loadAnnotation();
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [lessonId, materialId, normalizedInitialPageId]);

  useEffect(() => {
    if (!materialId || !annotationReady) {
      return undefined;
    }

    const content = annotationContentFromElements(annotationElements, activePageId);
    const serialized = JSON.stringify(content);
    if (serialized === lastSyncedAnnotationRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      saveScheduledLessonMaterialAnnotation(lessonId, { content })
        .then(() => {
          lastSyncedAnnotationRef.current = serialized;
        })
        .catch(() => {
          // The next local edit or polling cycle will retry without blocking the lesson UI.
        });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [activePageId, annotationElements, annotationReady, lessonId, materialId]);

  function replaceLocalElements(elements: AnnotationElement[]) {
    elementsRef.current = elements;
    setLocalAnnotationElements(elements);
  }

  function updateElements(updater: (current: AnnotationElement[]) => AnnotationElement[]) {
    setAnnotationElements((current) => {
      const next = [...updater(current)].sort(compareAnnotationElements);
      elementsRef.current = next;
      return next;
    });
  }

  function beginAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || annotationTool === "pointer") {
      if (annotationTool === "pointer" && event.target === event.currentTarget) {
        setSelectedElementId(null);
        setEditingElementId(null);
      }
      return;
    }

    event.preventDefault();
    const point = svgPointFromEvent(event, activePageId);
    if (annotationTool === "text" || annotationTool === "stickyNote") {
      createTextElement(annotationTool, point);
      return;
    }

    capturePointer(event);
    if (annotationTool === "eraser") {
      activeInteractionRef.current = { erased: [], mode: "erase" };
      eraseAt(point);
      return;
    }

    const element = createDrawableElement(annotationTool, point);
    if (!element) {
      return;
    }
    activeInteractionRef.current = { before: element, id: element.id, mode: "create" };
    updateElements((current) => [...current, element]);
    setSelectedElementId(element.id);
  }

  function extendAnnotation(event: PointerEvent<SVGSVGElement>) {
    const interaction = activeInteractionRef.current;
    if (!interaction) {
      return;
    }
    event.preventDefault();
    const point = svgPointFromEvent(event, activePageId);

    if (interaction.mode === "erase") {
      eraseAt(point);
      return;
    }
    if (interaction.mode === "move") {
      updateElementWithoutHistory(
        interaction.id,
        moveAnnotationElement(
          interaction.before,
          point.x - interaction.start.x,
          point.y - interaction.start.y,
        ),
      );
      return;
    }
    if (interaction.mode === "resize" && interaction.handle) {
      updateElementWithoutHistory(
        interaction.id,
        resizeAnnotationElement(interaction.before, interaction.handle, point),
      );
      return;
    }

    updateElements((current) => current.map((element) => {
      if (element.id !== interaction.id) {
        return element;
      }
      if (element.kind === "stroke") {
        const previous = element.points.at(-1);
        return previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1.5
          ? element
          : { ...element, points: [...element.points, point] };
      }
      if (element.kind === "line" || element.kind === "arrow") {
        return { ...element, end: point };
      }
      if (element.kind === "rectangle" || element.kind === "ellipse") {
        return boxElementFromPoints(element, interaction.before, point);
      }
      return element;
    }));
  }

  function endAnnotation(event: PointerEvent<SVGSVGElement>) {
    const interaction = activeInteractionRef.current;
    if (!interaction) {
      releasePointer(event.pointerId);
      return;
    }
    activeInteractionRef.current = null;
    releasePointer(event.pointerId);

    if (interaction.mode === "erase") {
      recordHistory(interaction.erased, []);
      return;
    }
    const currentElement = elementsRef.current.find((element) => element.id === interaction.id);
    if (!currentElement) {
      return;
    }
    if (interaction.mode === "create") {
      const finalized = normalizeCreatedElement(currentElement);
      updateElementWithoutHistory(currentElement.id, finalized);
      recordHistory([], [finalized]);
      if (finalized.kind !== "stroke") {
        setAnnotationTool("pointer");
      }
      return;
    }
    recordHistory([interaction.before], [currentElement]);
  }

  function beginElementMove(event: PointerEvent<SVGElement>, elementId: string) {
    if (annotationTool !== "pointer" || editingElementId === elementId) {
      return;
    }
    const element = elementsRef.current.find((candidate) => candidate.id === elementId);
    if (!element) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedElementId(elementId);
    setEditingElementId(null);
    capturePointer(event);
    activeInteractionRef.current = {
      before: element,
      id: elementId,
      mode: "move",
      start: svgPointFromEvent(event, activePageId),
    };
  }

  function beginElementResize(
    event: PointerEvent<SVGElement>,
    elementId: string,
    handle: "end" | "ne" | "nw" | "se" | "start" | "sw",
  ) {
    const element = elementsRef.current.find((candidate) => candidate.id === elementId);
    if (!element) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    capturePointer(event);
    activeInteractionRef.current = {
      before: element,
      handle,
      id: elementId,
      mode: "resize",
      start: svgPointFromEvent(event, activePageId),
    };
  }

  function deleteSelectedElement() {
    if (!selectedElementId) {
      return;
    }
    const element = elementsRef.current.find((candidate) => candidate.id === selectedElementId);
    if (!element) {
      return;
    }
    updateElements((current) => current.filter((candidate) => candidate.id !== selectedElementId));
    recordHistory([element], []);
    setSelectedElementId(null);
    setEditingElementId(null);
  }

  function updateSelectedColor(color: string) {
    setAnnotationColor(color);
    const selected = selectedElementId
      ? elementsRef.current.find((element) => element.id === selectedElementId)
      : null;
    if (!selected || selected.kind === "stickyNote") {
      return;
    }
    const next = { ...selected, color };
    updateElementWithoutHistory(selected.id, next);
    recordHistory([selected], [next]);
  }

  function updateSelectedStrokeWidth(strokeWidth: AnnotationStrokeWidth) {
    setAnnotationStrokeWidth(strokeWidth);
    const selected = selectedElementId
      ? elementsRef.current.find((element) => element.id === selectedElementId)
      : null;
    if (!selected || !isStrokeStyledElement(selected)) {
      return;
    }
    const next = { ...selected, strokeWidth };
    updateElementWithoutHistory(selected.id, next);
    recordHistory([selected], [next]);
  }

  function beginTextEditing(elementId: string) {
    const element = elementsRef.current.find((candidate) => candidate.id === elementId);
    if (!element || (element.kind !== "text" && element.kind !== "stickyNote")) {
      return;
    }
    textEditBeforeRef.current = element;
    setSelectedElementId(elementId);
    setEditingElementId(elementId);
  }

  function updateAnnotationText(elementId: string, text: string) {
    updateElements((current) => current.map((element) => (
      element.id === elementId && (element.kind === "text" || element.kind === "stickyNote")
        ? { ...element, text: text.slice(0, 3_000) }
        : element
    )));
  }

  function finishTextEditing() {
    const before = textEditBeforeRef.current;
    const after = before ? elementsRef.current.find((element) => element.id === before.id) : null;
    if (before && after) {
      recordHistory([before], [after]);
    }
    textEditBeforeRef.current = null;
    setEditingElementId(null);
  }

  function undo() {
    const entry = undoHistoryRef.current.pop();
    if (!entry) {
      return;
    }
    applyHistoryElements(entry.after, entry.before);
    redoHistoryRef.current.push(entry);
    updateHistoryState();
  }

  function redo() {
    const entry = redoHistoryRef.current.pop();
    if (!entry) {
      return;
    }
    applyHistoryElements(entry.before, entry.after);
    undoHistoryRef.current.push(entry);
    updateHistoryState();
  }

  function eraseAt(point: AnnotationPoint) {
    updateElements((current) => {
      const result = eraseAnnotationElementsAt(current, point);
      const interaction = activeInteractionRef.current;
      if (interaction?.mode === "erase" && result.erased.length > 0) {
        const knownIds = new Set(interaction.erased.map((stroke) => stroke.id));
        interaction.erased.push(...result.erased.filter((stroke) => !knownIds.has(stroke.id)));
      }
      return result.elements;
    });
  }

  function createDrawableElement(tool: AnnotationTool, point: AnnotationPoint): AnnotationElement | null {
    const base = {
      color: annotationColor,
      createdAt: Date.now(),
      id: annotationElementId(tool),
      pageId: point.pageId,
    };
    if (tool === "pen") {
      return { ...base, kind: "stroke", points: [point], strokeWidth: annotationStrokeWidth };
    }
    if (tool === "line" || tool === "arrow") {
      return { ...base, end: point, kind: tool, start: point, strokeWidth: annotationStrokeWidth };
    }
    if (tool === "rectangle" || tool === "ellipse") {
      return {
        ...base,
        fill: "transparent",
        height: 1,
        kind: tool,
        strokeWidth: annotationStrokeWidth,
        width: 1,
        x: point.x,
        y: point.y,
      };
    }
    return null;
  }

  function createTextElement(tool: "stickyNote" | "text", point: AnnotationPoint) {
    const width = tool === "stickyNote" ? 220 : 260;
    const height = tool === "stickyNote" ? 160 : 90;
    const element: AnnotationElement = {
      color: tool === "stickyNote" ? "#111111" : annotationColor,
      createdAt: Date.now(),
      fill: tool === "stickyNote" ? "#fff0a8" : "transparent",
      height,
      id: annotationElementId(tool),
      kind: tool,
      pageId: point.pageId,
      text: "",
      width,
      x: Math.min(point.x, 1000 - width),
      y: Math.min(point.y, 1000 - height),
    };
    updateElements((current) => [...current, element]);
    recordHistory([], [element]);
    textEditBeforeRef.current = element;
    setSelectedElementId(element.id);
    setEditingElementId(element.id);
    setAnnotationTool("pointer");
  }

  function capturePointer(event: PointerEvent<SVGElement>) {
    const target = event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;
    if (!target) {
      return;
    }
    target.setPointerCapture(event.pointerId);
    captureTargetRef.current = target;
  }

  function releasePointer(pointerId: number) {
    const target = captureTargetRef.current;
    captureTargetRef.current = null;
    if (!target) {
      return;
    }
    try {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      // Pointer capture may already be gone after browser-level cancellation.
    }
  }

  function updateElementWithoutHistory(elementId: string, next: AnnotationElement) {
    updateElements((current) => current.map((element) => element.id === elementId ? next : element));
  }

  function recordHistory(before: AnnotationElement[], after: AnnotationElement[]) {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    undoHistoryRef.current.push({ after, before });
    if (undoHistoryRef.current.length > historyLimit) {
      undoHistoryRef.current.shift();
    }
    redoHistoryRef.current = [];
    updateHistoryState();
  }

  function applyHistoryElements(remove: AnnotationElement[], insert: AnnotationElement[]) {
    const affectedIds = new Set([...remove, ...insert].map((element) => element.id));
    updateElements((current) => [
      ...current.filter((element) => !affectedIds.has(element.id)),
      ...insert,
    ]);
    if (selectedElementId && affectedIds.has(selectedElementId) && !insert.some((element) => element.id === selectedElementId)) {
      setSelectedElementId(null);
      setEditingElementId(null);
    }
  }

  function resetHistory() {
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    updateHistoryState();
  }

  function updateHistoryState() {
    setHistoryState({
      canRedo: redoHistoryRef.current.length > 0,
      canUndo: undoHistoryRef.current.length > 0,
    });
  }

  return {
    activePageId,
    annotationColor,
    annotationElements,
    annotationStrokeWidth,
    annotationTool,
    beginAnnotation,
    beginElementMove,
    beginElementResize,
    beginTextEditing,
    canRedo: historyState.canRedo,
    canUndo: historyState.canUndo,
    deleteSelectedElement,
    editingElementId,
    endAnnotation,
    finishTextEditing,
    redo,
    selectedElementId,
    setActivePageId,
    setAnnotationTool,
    setSelectedElementId,
    undo,
    updateAnnotationText,
    updateSelectedColor,
    updateSelectedStrokeWidth,
    extendAnnotation,
  };
}

function boxElementFromPoints(
  element: Extract<AnnotationElement, { kind: "ellipse" | "rectangle" }>,
  initial: AnnotationElement,
  point: AnnotationPoint,
): AnnotationElement {
  if (initial.kind !== "ellipse" && initial.kind !== "rectangle") {
    return element;
  }
  return {
    ...element,
    height: Math.max(1, Math.abs(point.y - initial.y)),
    width: Math.max(1, Math.abs(point.x - initial.x)),
    x: Math.min(point.x, initial.x),
    y: Math.min(point.y, initial.y),
  };
}

function normalizeCreatedElement(element: AnnotationElement): AnnotationElement {
  if (element.kind === "line" || element.kind === "arrow") {
    if (Math.hypot(element.end.x - element.start.x, element.end.y - element.start.y) >= minimumCreatedSize) {
      return element;
    }
    return { ...element, end: { ...element.end, x: Math.min(1000, element.start.x + 120) } };
  }
  if (element.kind === "rectangle" || element.kind === "ellipse") {
    return {
      ...element,
      height: Math.max(minimumCreatedSize, element.height),
      width: Math.max(minimumCreatedSize, element.width),
    };
  }
  return element;
}

function annotationElementId(tool: AnnotationTool): string {
  return `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const defaultAnnotationPageId = "material";
const historyLimit = 50;
const minimumCreatedSize = 36;
