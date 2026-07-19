import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  fetchScheduledLessonMaterialAnnotation,
  saveScheduledLessonMaterialAnnotation,
} from "../../../shared/api/playsay";
import {
  annotationContentFromElements,
  annotationContentFromJson,
  canReparentMindMapNode,
  compareAnnotationElements,
  deleteMindMapSubtree,
  emptyAnnotationContent,
  eraseAnnotationElementsAt,
  isStrokeStyledElement,
  layoutMindMap,
  mindMapNodeLimit,
  mindMapNodes,
  moveAnnotationElement,
  resizeAnnotationElement,
  resizeMindMapNodeForText,
  svgPointFromEvent,
  type AnnotationElement,
  type AnnotationFontSize,
  type AnnotationMindMapNode,
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
      beforeGroup?: AnnotationElement[];
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
  const [defaultAnnotationFontSize, setDefaultAnnotationFontSize] = useState<AnnotationFontSize>(18);
  const [activePageId, setActivePageId] = useState(initialPageId?.trim() || defaultAnnotationPageId);
  const [localAnnotationElements, setLocalAnnotationElements] = useState<AnnotationElement[]>([]);
  const [annotationReady, setAnnotationReady] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canRedo: false, canUndo: false });
  const [mindMapLimitReached, setMindMapLimitReached] = useState(false);
  const activeInteractionRef = useRef<ActiveInteraction | null>(null);
  const captureTargetRef = useRef<SVGSVGElement | null>(null);
  const elementsRef = useRef<AnnotationElement[]>([]);
  const lastSyncedAnnotationRef = useRef("");
  const liveAnnotationRef = useRef<LiveAnnotationSync | null>(liveAnnotation ?? null);
  const liveElementCountRef = useRef(0);
  const liveSeedAttemptedRef = useRef(false);
  const localLiveMutationRef = useRef(false);
  const pendingInteractionPointRef = useRef<AnnotationPoint | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const redoHistoryRef = useRef<AnnotationHistoryEntry[]>([]);
  const textEditBeforeRef = useRef<AnnotationElement | null>(null);
  const undoHistoryRef = useRef<AnnotationHistoryEntry[]>([]);
  const annotationElements = liveAnnotation?.elements ?? localAnnotationElements;
  const setAnnotationElements = liveAnnotation?.setElements ?? setLocalAnnotationElements;
  const normalizedInitialPageId = initialPageId?.trim() || defaultAnnotationPageId;
  const selectedFontElement = selectedElementId
    ? annotationElements.find((element): element is Extract<AnnotationElement, { kind: "mindMapNode" | "text" }> => (
        element.id === selectedElementId && (element.kind === "text" || element.kind === "mindMapNode")
      ))
    : null;
  const annotationFontSize = selectedFontElement?.fontSize ?? defaultAnnotationFontSize;

  useEffect(() => {
    liveAnnotationRef.current = liveAnnotation ?? null;
  }, [liveAnnotation]);

  useEffect(() => {
    elementsRef.current = annotationElements;
  }, [annotationElements]);

  useEffect(() => {
    liveElementCountRef.current = liveAnnotation?.elements.length ?? 0;
  }, [liveAnnotation?.elements.length]);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) {
      cancelScheduledPointerFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
  }, []);

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
            if (
              !liveSeedAttemptedRef.current &&
              !localLiveMutationRef.current &&
              liveElementCountRef.current === 0 &&
              content.elements.length > 0
            ) {
              currentLiveAnnotation.setElements(() => content.elements);
            }
            liveSeedAttemptedRef.current = true;
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
    liveSeedAttemptedRef.current = false;
    localLiveMutationRef.current = false;
    pendingInteractionPointRef.current = null;
    cancelPointerFrame();
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
    if (liveAnnotationRef.current) {
      localLiveMutationRef.current = true;
    }
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
    if (annotationTool === "mindMap") {
      createMindMapRoot(point);
      return;
    }
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
    if (!activeInteractionRef.current) {
      return;
    }
    event.preventDefault();
    pendingInteractionPointRef.current = svgPointFromEvent(event, activePageId);
    if (pointerFrameRef.current === null) {
      pointerFrameRef.current = requestPointerFrame(() => {
        pointerFrameRef.current = null;
        flushPendingInteraction();
      });
    }
  }

  function flushPendingInteraction() {
    const interaction = activeInteractionRef.current;
    const point = pendingInteractionPointRef.current;
    pendingInteractionPointRef.current = null;
    if (!interaction || !point) {
      return;
    }

    if (interaction.mode === "erase") {
      eraseAt(point);
      return;
    }
    if (interaction.mode === "move") {
      if (interaction.before.kind === "mindMapNode" && interaction.before.parentId === null && interaction.beforeGroup) {
        const group = interaction.beforeGroup.filter((element): element is AnnotationMindMapNode => element.kind === "mindMapNode");
        const bounds = group.reduce((current, node) => ({
          left: Math.min(current.left, node.x),
          top: Math.min(current.top, node.y),
          right: Math.max(current.right, node.x + node.width),
          bottom: Math.max(current.bottom, node.y + node.height),
        }), { left: 1000, top: 1000, right: 0, bottom: 0 });
        const deltaX = Math.max(-bounds.left, Math.min(1000 - bounds.right, point.x - interaction.start.x));
        const deltaY = Math.max(-bounds.top, Math.min(1000 - bounds.bottom, point.y - interaction.start.y));
        updateElements((current) => current.map((element) => {
          const before = interaction.beforeGroup?.find((candidate) => candidate.id === element.id);
          return before?.kind === "mindMapNode"
            ? { ...before, x: before.x + deltaX, y: before.y + deltaY }
            : element;
        }));
        return;
      }
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
    pendingInteractionPointRef.current = svgPointFromEvent(event, activePageId);
    cancelPointerFrame();
    flushPendingInteraction();
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
    if (interaction.mode === "move" && interaction.before.kind === "mindMapNode") {
      finalizeMindMapMove(interaction.before, interaction.beforeGroup ?? [interaction.before], currentElement);
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
    if (element.kind === "mindMapNode" && window.matchMedia("(max-width: 767px)").matches) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedElementId(elementId);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedElementId(elementId);
    setEditingElementId(null);
    capturePointer(event);
    activeInteractionRef.current = {
      before: element,
      beforeGroup: element.kind === "mindMapNode" ? mindMapNodes(elementsRef.current, element.mapId) : undefined,
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
    if (element.kind === "mindMapNode") {
      const before = mindMapNodes(elementsRef.current, element.mapId);
      const next = deleteMindMapSubtree(elementsRef.current, element.id);
      const after = mindMapNodes(next, element.mapId);
      updateElements(() => layoutMindMap(next, element.mapId));
      recordHistory(before, after);
      setSelectedElementId(null);
      setEditingElementId(null);
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
    const next = selected.kind === "mindMapNode" && selected.parentId === null
      ? { ...selected, fill: color }
      : { ...selected, color };
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

  function updateSelectedFontSize(fontSize: AnnotationFontSize) {
    setDefaultAnnotationFontSize(fontSize);
    const selected = selectedElementId
      ? elementsRef.current.find((element) => element.id === selectedElementId)
      : null;
    if (!selected || (selected.kind !== "text" && selected.kind !== "mindMapNode")) return;
    if (selected.kind === "text") {
      const next = { ...selected, fontSize };
      updateElementWithoutHistory(selected.id, next);
      recordHistory([selected], [next]);
      return;
    }
    const before = mindMapNodes(elementsRef.current, selected.mapId);
    const resized = resizeMindMapNodeForText(selected, fontSize);
    const afterElements = layoutMindMap(elementsRef.current.map((element) => element.id === selected.id ? resized : element), selected.mapId);
    updateElements(() => afterElements);
    recordHistory(before, mindMapNodes(afterElements, selected.mapId));
  }

  function beginTextEditing(elementId: string) {
    const element = elementsRef.current.find((candidate) => candidate.id === elementId);
    if (!element || (element.kind !== "text" && element.kind !== "stickyNote" && element.kind !== "mindMapNode")) {
      return;
    }
    textEditBeforeRef.current = element;
    setSelectedElementId(elementId);
    setEditingElementId(elementId);
  }

  function updateAnnotationText(elementId: string, text: string) {
    updateElements((current) => {
      const selected = current.find((element) => element.id === elementId);
      if (!selected || (selected.kind !== "text" && selected.kind !== "stickyNote" && selected.kind !== "mindMapNode")) return current;
      const nextText = text.slice(0, selected.kind === "mindMapNode" ? 500 : 3_000);
      if (selected.kind !== "mindMapNode") {
        return current.map((element) => element.id === elementId ? { ...selected, text: nextText } : element);
      }
      const resized = resizeMindMapNodeForText(selected, selected.fontSize, nextText);
      return layoutMindMap(current.map((element) => element.id === elementId ? resized : element), selected.mapId);
    });
  }

  const updateAnnotationElementSize = useCallback((elementId: string, width: number, height: number) => {
    updateElements((current) => {
      const selected = current.find((element) => element.id === elementId);
      if (!selected || (selected.kind !== "text" && selected.kind !== "mindMapNode")) return current;
      const nextWidth = Math.max(1, Math.min(1000, Number(width.toFixed(1))));
      const nextHeight = Math.max(1, Math.min(1000, Number(height.toFixed(1))));
      if (Math.abs(selected.width - nextWidth) < 0.5 && Math.abs(selected.height - nextHeight) < 0.5) {
        return current;
      }
      const resized = {
        ...selected,
        height: nextHeight,
        width: nextWidth,
        x: Math.min(selected.x, 1000 - nextWidth),
        y: Math.min(selected.y, 1000 - nextHeight),
      };
      const next = current.map((element) => element.id === elementId ? resized : element);
      return selected.kind === "mindMapNode" ? layoutMindMap(next, selected.mapId) : next;
    });
  }, [updateElements]);

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

  function cancelPointerFrame() {
    if (pointerFrameRef.current === null) {
      return;
    }
    cancelScheduledPointerFrame(pointerFrameRef.current);
    pointerFrameRef.current = null;
  }

  function createTextElement(tool: "stickyNote" | "text", point: AnnotationPoint) {
    const width = tool === "stickyNote" ? 220 : 72;
    const height = tool === "stickyNote" ? 160 : 34;
    const element: AnnotationElement = {
      autoWidth: tool === "text",
      color: tool === "stickyNote" ? "#111111" : annotationColor,
      createdAt: Date.now(),
      fill: tool === "stickyNote" ? "#fff0a8" : "transparent",
      fontSize: tool === "stickyNote" ? 30 : defaultAnnotationFontSize,
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

  function createMindMapRoot(point: AnnotationPoint) {
    const id = annotationElementId("mindMap");
    const element = resizeMindMapNodeForText({
      color: "#ffffff",
      createdAt: Date.now(),
      fill: annotationColor,
      fontSize: defaultAnnotationFontSize,
      height: 40,
      id,
      kind: "mindMapNode",
      mapId: id,
      order: 0,
      pageId: point.pageId,
      parentId: null,
      side: "root",
      text: "",
      width: 96,
      x: Math.max(20, Math.min(884, point.x - 48)),
      y: Math.max(20, Math.min(940, point.y - 20)),
    }, defaultAnnotationFontSize);
    updateElements((current) => [...current, element]);
    recordHistory([], [element]);
    textEditBeforeRef.current = element;
    setSelectedElementId(element.id);
    setEditingElementId(element.id);
    setMindMapLimitReached(false);
    setAnnotationTool("pointer");
  }

  function addMindMapNode(parentId: string, relation: "child" | "sibling", preferredSide?: "left" | "right") {
    const selected = elementsRef.current.find((element): element is AnnotationMindMapNode => (
      element.id === parentId && element.kind === "mindMapNode"
    ));
    if (!selected) return;
    const before = mindMapNodes(elementsRef.current, selected.mapId);
    if (before.length >= mindMapNodeLimit) {
      setMindMapLimitReached(true);
      return;
    }
    const root = before.find((node) => node.parentId === null) ?? selected;
    const actualParent = relation === "sibling" && selected.parentId
      ? before.find((node) => node.id === selected.parentId) ?? root
      : selected;
    const siblings = before.filter((node) => node.parentId === actualParent.id);
    const side = actualParent.parentId === null
      ? preferredSide ?? (siblings.filter((node) => node.side === "right").length <= siblings.filter((node) => node.side === "left").length ? "right" : "left")
      : actualParent.side === "left" ? "left" : "right";
    const id = annotationElementId("mindMap");
    const node: AnnotationMindMapNode = {
      color: annotationColor,
      createdAt: Date.now(),
      fill: "#ffffff",
      fontSize: 14,
      height: 34,
      id,
      kind: "mindMapNode",
      mapId: selected.mapId,
      order: siblings.reduce((maximum, sibling) => Math.max(maximum, sibling.order), -1) + 1,
      pageId: selected.pageId,
      parentId: actualParent.id,
      side,
      text: "",
      width: 72,
      x: actualParent.x,
      y: actualParent.y,
    };
    const afterElements = layoutMindMap([...elementsRef.current, node], node.mapId);
    updateElements(() => afterElements);
    const after = mindMapNodes(afterElements, node.mapId);
    recordHistory(before, after);
    textEditBeforeRef.current = after.find((candidate) => candidate.id === node.id) ?? node;
    setSelectedElementId(node.id);
    setEditingElementId(node.id);
    setMindMapLimitReached(false);
  }

  function handleMindMapKey(elementId: string, key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "Enter" | "Tab") {
    const selected = elementsRef.current.find((element): element is AnnotationMindMapNode => element.id === elementId && element.kind === "mindMapNode");
    if (!selected) return;
    if (key === "Tab") {
      addMindMapNode(selected.id, "child");
      return;
    }
    if (key === "Enter") {
      addMindMapNode(selected.id, selected.parentId ? "sibling" : "child");
      return;
    }
    const nodes = mindMapNodes(elementsRef.current, selected.mapId);
    const siblings = nodes.filter((node) => node.parentId === selected.parentId).sort((left, right) => left.order - right.order);
    const siblingIndex = siblings.findIndex((node) => node.id === selected.id);
    const next = key === "ArrowLeft"
      ? selected.side === "right" ? nodes.find((node) => node.id === selected.parentId) : nodes.find((node) => node.parentId === selected.id)
      : key === "ArrowRight"
        ? selected.side === "left" ? nodes.find((node) => node.id === selected.parentId) : nodes.find((node) => node.parentId === selected.id)
        : key === "ArrowUp"
          ? siblings[siblingIndex - 1]
          : siblings[siblingIndex + 1];
    if (next) setSelectedElementId(next.id);
  }

  function finalizeMindMapMove(before: AnnotationMindMapNode, beforeGroup: AnnotationElement[], current: AnnotationElement) {
    if (current.kind !== "mindMapNode") return;
    if (before.parentId === null) {
      recordHistory(beforeGroup, mindMapNodes(elementsRef.current, before.mapId));
      return;
    }
    const center = { x: current.x + current.width / 2, y: current.y + current.height / 2 };
    const target = mindMapNodes(elementsRef.current, current.mapId).find((node) => (
      node.id !== current.id
      && center.x >= node.x && center.x <= node.x + node.width
      && center.y >= node.y && center.y <= node.y + node.height
      && canReparentMindMapNode(elementsRef.current, current.id, node.id)
    ));
    const elements = elementsRef.current;
    const root = mindMapNodes(elements, current.mapId).find((node) => node.parentId === null);
    const next = elements.map((element) => {
      if (element.id !== current.id || element.kind !== "mindMapNode") return element;
      const parentId = target?.id ?? before.parentId;
      const parent = target ?? mindMapNodes(elements, current.mapId).find((node) => node.id === parentId);
      const side: AnnotationMindMapNode["side"] = parent?.parentId === null
        ? center.x < (root?.x ?? 500) ? "left" : "right"
        : parent?.side === "left" ? "left" : "right";
      const siblings = mindMapNodes(elements, current.mapId).filter((node) => node.parentId === parentId && node.id !== current.id);
      const order = siblings.filter((node) => node.y < center.y).length;
      return { ...element, order, parentId, side };
    });
    const afterElements = layoutMindMap(next, current.mapId);
    updateElements(() => afterElements);
    recordHistory(beforeGroup, mindMapNodes(afterElements, current.mapId));
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
    addMindMapNode,
    annotationColor,
    annotationElements,
    annotationFontSize,
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
    handleMindMapKey,
    mindMapLimitReached,
    redo,
    selectedElementId,
    setActivePageId,
    setAnnotationTool,
    setSelectedElementId,
    undo,
    updateAnnotationText,
    updateAnnotationElementSize,
    updateSelectedColor,
    updateSelectedFontSize,
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

function requestPointerFrame(callback: FrameRequestCallback): number {
  return typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 16);
}

function cancelScheduledPointerFrame(frameId: number) {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(frameId);
  } else {
    window.clearTimeout(frameId);
  }
}

const defaultAnnotationPageId = "material";
const historyLimit = 50;
const minimumCreatedSize = 36;
