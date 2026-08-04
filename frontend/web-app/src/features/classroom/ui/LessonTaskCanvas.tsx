import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { FileText, Loader2, Send } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  type LessonMaterial,
  type LessonMaterialJson,
  type LessonMaterialSubmission,
} from "../../../shared/api/playsay";
import { useLessonAnnotation } from "../hooks/useLessonAnnotation";
import {
  LessonMaterialDocumentView,
  editorDocumentFromJson,
  materialAnswersFromSubmission,
  materialPageAcceptsAnswers,
  materialLiveScore,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
  type MaterialHtmlGameSync,
  type MaterialExternalActivitySync,
  type MaterialExerciseSync,
  type MaterialVideoSync,
} from "../../materials";
import { annotationElementsForPage, type AnnotationElement } from "../model/annotation";
import type { CollaborationCursor, CollaborationParticipant } from "../hooks/useYjsWorkspace";
import { useAppTranslation } from "../../../shared/i18n";
import { PresenceCursorLayer } from "./PresenceCursorLayer";
import { AnnotationLayer, type AnnotationLayerBounds } from "./AnnotationLayer";
import { AnnotationToolbar } from "./AnnotationToolbar";
import {
  isMaterialViewportNewer,
  type MaterialViewportPublishOptions,
  type MaterialViewportState,
  type MaterialViewportUpdate,
} from "../model/materialViewport";

type LiveAnnotationSync = {
  canRedo?: boolean;
  canUndo?: boolean;
  elements: AnnotationElement[];
  participants: CollaborationParticipant[];
  ready: boolean;
  redo?: () => void;
  setElements: (updater: (current: AnnotationElement[]) => AnnotationElement[]) => void;
  undo?: () => void;
  updateCursor: (cursor: CollaborationCursor | null) => void;
};

type MaterialViewportSync = {
  clientId: number | null;
  publish: (
    viewport: MaterialViewportUpdate,
    options?: MaterialViewportPublishOptions,
  ) => void;
  ready: boolean;
  state: MaterialViewportState | null;
};

export type LessonPresentationMode = "default" | "html-game-focus" | "image-focus" | "external-activity-focus";

export function LessonTaskCanvas({
  annotationSync,
  collaborationControls,
  lessonId,
  material,
  onSaveAnswers,
  score,
  submission,
  submissionMessage,
  submissionSaving,
  teacherName,
  canControlPages = false,
  htmlGameSync,
  exerciseSync,
  videoSync,
  externalActivitySync,
  liveActivePageId,
  onPresentationModeChange,
  viewportSync,
}: {
  annotationSync?: LiveAnnotationSync | null;
  canControlPages?: boolean;
  htmlGameSync?: MaterialHtmlGameSync;
  exerciseSync?: MaterialExerciseSync;
  videoSync?: MaterialVideoSync;
  externalActivitySync?: MaterialExternalActivitySync;
  liveActivePageId?: string | null;
  onPresentationModeChange?: (mode: LessonPresentationMode) => void;
  viewportSync?: MaterialViewportSync;
  collaborationControls?: ReactNode;
  lessonId: string;
  material?: LessonMaterial | null;
  onSaveAnswers: (content: LessonMaterialJson) => void;
  score: number | null;
  submission: LessonMaterialSubmission | null;
  submissionMessage: string | null;
  submissionSaving: boolean;
  teacherName: string;
}) {
  const { t } = useAppTranslation();
  const document = useMemo(
    () => (material ? editorDocumentFromJson(material.document, material.title) : null),
    [material],
  );
  const firstPageId = document?.pages[0]?.id ?? null;
  const {
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
    canRedo,
    canUndo,
    deleteSelectedElement,
    editingElementId,
    endAnnotation,
    extendAnnotation,
    finishTextEditing,
    handleMindMapKey,
    mindMapLimitReached,
    redo,
    reanchorElement,
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
  } = useLessonAnnotation({ initialPageId: firstPageId, lessonId, liveAnnotation: annotationSync, materialId: material?.id });
  const [answers, setAnswers] = useState<MaterialAnswerState>({});
  const effectiveAnswers = exerciseSync?.answers ?? answers;
  const [presentationMode, setPresentationMode] = useState<LessonPresentationMode>("default");
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const activePage = document?.pages.find((page) => page.id === activePageId) ?? document?.pages[0] ?? null;
  const materialSurfaceRef = useRef<HTMLDivElement>(null);
  const taskDocumentRef = useRef<HTMLDivElement>(null);
  const documentScrollBeforeImageFocusRef = useRef<{ left: number; top: number } | null>(null);
  const previousPresentationModeRef = useRef<LessonPresentationMode>("default");
  const annotationToolBeforeGameRef = useRef<typeof annotationTool | null>(null);
  const applyingRemoteViewportRef = useRef(false);
  const appliedRemoteViewportRef = useRef<MaterialViewportState | null>(null);
  const expectedRemoteScrollRef = useRef<{
    left: number;
    node: HTMLElement;
    top: number;
  } | null>(null);
  const suppressTransitionScrollPublishRef = useRef(false);
  const transitionScrollFrameRef = useRef<number | null>(null);
  const lastViewportPublishAtRef = useRef(0);
  const viewportPublishTimerRef = useRef<number | null>(null);
  const viewportReapplyFrameRef = useRef<number | null>(null);
  const scrollIntentRef = useRef<{
    activePointerId: number | null;
    expiresAt: number;
    node: HTMLElement | null;
  }>({ activePointerId: null, expiresAt: 0, node: null });
  const lastNormalizedViewportRef = useRef<Pick<
    MaterialViewportUpdate,
    "materialId" | "pageId" | "presentationMode" | "scrollContainer" | "x" | "y"
  > | null>(null);

  useLayoutEffect(() => {
    const taskDocument = taskDocumentRef.current;
    const previousMode = previousPresentationModeRef.current;
    previousPresentationModeRef.current = presentationMode;
    if (!taskDocument) return;

    const suppressTransitionScrollPublish = () => {
      suppressTransitionScrollPublishRef.current = true;
      if (viewportPublishTimerRef.current !== null) {
        window.clearTimeout(viewportPublishTimerRef.current);
        viewportPublishTimerRef.current = null;
      }
      if (transitionScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionScrollFrameRef.current);
      }
      transitionScrollFrameRef.current = window.requestAnimationFrame(() => {
        transitionScrollFrameRef.current = null;
        suppressTransitionScrollPublishRef.current = false;
      });
    };

    if (previousMode !== "image-focus" && presentationMode === "image-focus") {
      documentScrollBeforeImageFocusRef.current = {
        left: taskDocument.scrollLeft,
        top: taskDocument.scrollTop,
      };
      suppressTransitionScrollPublish();
      taskDocument.scrollLeft = 0;
      taskDocument.scrollTop = 0;
      return;
    }

    if (previousMode === "image-focus" && presentationMode !== "image-focus") {
      const previousScroll = documentScrollBeforeImageFocusRef.current;
      documentScrollBeforeImageFocusRef.current = null;
      if (previousScroll) {
        suppressTransitionScrollPublish();
        taskDocument.scrollLeft = previousScroll.left;
        taskDocument.scrollTop = previousScroll.top;
      }
    }
  }, [presentationMode]);

  useEffect(() => () => {
    if (transitionScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionScrollFrameRef.current);
      transitionScrollFrameRef.current = null;
    }
    if (viewportReapplyFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportReapplyFrameRef.current);
      viewportReapplyFrameRef.current = null;
    }
  }, []);

  const annotationAnchors = useAnnotationAnchors(
    materialSurfaceRef,
    activePage?.id ?? null,
    presentationMode,
  );
  const visibleAnnotationElements = annotationElementsForPage(annotationElements, activePage?.id ?? activePageId);
  const legacyAnchorId = activePage?.layout === "STATIC_IMAGE"
    ? activePage.blocks.find((block) => block.type === "image" || block.type === "generatedImage")?.id
    : annotationAnchors.find((anchor) => anchor.focused)?.id;
  const pageAnnotationElements = visibleAnnotationElements.filter((element) => (
    !element.anchorId && !legacyAnchorId
  ));
  const selectedAnnotationElement = selectedElementId
    ? visibleAnnotationElements.find((element) => element.id === selectedElementId) ?? null
    : null;
  const activePageAcceptsAnswers = materialPageAcceptsAnswers(activePage);

  useEffect(() => {
    const submittedAnswers = materialAnswersFromSubmission(submission);
    setAnswers(submittedAnswers);
    exerciseSync?.seedAnswers(submittedAnswers);
  }, [exerciseSync?.seedAnswers, material?.id, submission?.id, submission?.updatedAt]);

  useEffect(() => () => exerciseSync?.updateInteraction(null), [exerciseSync?.updateInteraction, material?.id]);

  useEffect(() => {
    if (liveActivePageId && document?.pages.some((page) => page.id === liveActivePageId)) {
      setActivePageId(liveActivePageId);
    }
  }, [document, liveActivePageId, setActivePageId]);

  useEffect(() => {
    onPresentationModeChange?.(presentationMode);
  }, [onPresentationModeChange, presentationMode]);

  useEffect(() => {
    if (presentationMode === "html-game-focus") {
      if (annotationToolBeforeGameRef.current === null) {
        annotationToolBeforeGameRef.current = annotationTool;
      }
      if (annotationTool !== "pointer") {
        setAnnotationTool("pointer");
      }
      annotationSync?.updateCursor(null);
      return;
    }
    if (annotationToolBeforeGameRef.current !== null) {
      setAnnotationTool(annotationToolBeforeGameRef.current);
      annotationToolBeforeGameRef.current = null;
    }
    if (presentationMode === "external-activity-focus") {
      annotationSync?.updateCursor(null);
    }
  }, [annotationSync?.updateCursor, presentationMode, setAnnotationTool]);

  useEffect(() => () => onPresentationModeChange?.("default"), [onPresentationModeChange]);

  const publishViewport = useCallback((
    pageId = activePageId,
    mode = presentationMode,
    blockId = focusedBlockId,
    options?: MaterialViewportPublishOptions,
  ) => {
    if (!viewportSync?.ready || !material) return;
    const scrollContainer = mode === "image-focus" ? "image" : "document";
    const node = scrollContainer === "image"
      ? materialSurfaceRef.current?.querySelector<HTMLElement>(".playsay-material-focused-image") ?? null
      : taskDocumentRef.current;
    if (!node) return;
    const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const maxTop = Math.max(0, node.scrollHeight - node.clientHeight);
    const nextViewport = {
      ...(blockId ? { focusedBlockId: blockId } : {}),
      materialId: material.id,
      pageId,
      presentationMode: mode,
      scrollContainer,
      x: maxLeft > 0 ? node.scrollLeft / maxLeft : 0,
      y: maxTop > 0 ? node.scrollTop / maxTop : 0,
    } satisfies MaterialViewportUpdate;
    lastNormalizedViewportRef.current = nextViewport;
    viewportSync.publish(nextViewport, options);
    lastViewportPublishAtRef.current = performance.now();
  }, [activePageId, focusedBlockId, material, presentationMode, viewportSync?.publish, viewportSync?.ready]);

  useEffect(() => {
    const node = presentationMode === "image-focus"
      ? materialSurfaceRef.current?.querySelector<HTMLElement>(".playsay-material-focused-image") ?? null
      : taskDocumentRef.current;
    if (!node || !viewportSync) return undefined;

    const markScrollIntent = (duration = 500) => {
      scrollIntentRef.current.node = node;
      scrollIntentRef.current.expiresAt = performance.now() + duration;
    };
    const handleWheelOrTouch = () => markScrollIntent();
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const verticalScrollbar = node.scrollHeight > node.clientHeight
        && event.clientX >= node.getBoundingClientRect().right - Math.max(16, node.offsetWidth - node.clientWidth);
      const horizontalScrollbar = node.scrollWidth > node.clientWidth
        && event.clientY >= node.getBoundingClientRect().bottom - Math.max(16, node.offsetHeight - node.clientHeight);
      if (verticalScrollbar || horizontalScrollbar) {
        scrollIntentRef.current.activePointerId = event.pointerId;
        markScrollIntent(2_000);
      }
    };
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (scrollIntentRef.current.activePointerId === event.pointerId) {
        markScrollIntent(2_000);
      }
    };
    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (scrollIntentRef.current.activePointerId === event.pointerId) {
        scrollIntentRef.current.activePointerId = null;
        markScrollIntent(150);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (scrollIntentKeys.has(event.key)) {
        markScrollIntent();
      }
    };
    const handleScroll = () => {
      const expectedRemoteScroll = expectedRemoteScrollRef.current;
      if (expectedRemoteScroll?.node === node) {
        if (
          Math.abs(node.scrollLeft - expectedRemoteScroll.left) <= 1
          && Math.abs(node.scrollTop - expectedRemoteScroll.top) <= 1
        ) {
          return;
        }
        expectedRemoteScrollRef.current = null;
      }
      if (applyingRemoteViewportRef.current || suppressTransitionScrollPublishRef.current) return;
      const intent = scrollIntentRef.current;
      if (intent.node !== node || (intent.activePointerId === null && performance.now() > intent.expiresAt)) {
        return;
      }
      const elapsed = performance.now() - lastViewportPublishAtRef.current;
      if (elapsed >= 50) {
        publishViewport();
        return;
      }
      if (viewportPublishTimerRef.current !== null) return;
      viewportPublishTimerRef.current = window.setTimeout(() => {
        viewportPublishTimerRef.current = null;
        publishViewport();
      }, Math.max(0, 50 - elapsed));
    };
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          if (viewportReapplyFrameRef.current !== null) return;
          viewportReapplyFrameRef.current = window.requestAnimationFrame(() => {
            viewportReapplyFrameRef.current = null;
            const viewport = lastNormalizedViewportRef.current;
            if (
              !viewport
              || viewport.materialId !== material?.id
              || viewport.presentationMode !== presentationMode
              || viewport.scrollContainer !== (presentationMode === "image-focus" ? "image" : "document")
            ) {
              return;
            }
            const left = viewport.x * Math.max(0, node.scrollWidth - node.clientWidth);
            const top = viewport.y * Math.max(0, node.scrollHeight - node.clientHeight);
            if (Math.abs(node.scrollLeft - left) <= 1 && Math.abs(node.scrollTop - top) <= 1) return;
            applyingRemoteViewportRef.current = true;
            expectedRemoteScrollRef.current = { left, node, top };
            node.scrollLeft = left;
            node.scrollTop = top;
            window.requestAnimationFrame(() => {
              applyingRemoteViewportRef.current = false;
            });
          });
        });
    resizeObserver?.observe(node);
    if (node.firstElementChild) resizeObserver?.observe(node.firstElementChild);
    node.addEventListener("wheel", handleWheelOrTouch, { passive: true });
    node.addEventListener("touchstart", handleWheelOrTouch, { passive: true });
    node.addEventListener("touchmove", handleWheelOrTouch, { passive: true });
    node.addEventListener("pointerdown", handlePointerDown, { passive: true });
    node.addEventListener("keydown", handleKeyDown);
    node.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      node.removeEventListener("wheel", handleWheelOrTouch);
      node.removeEventListener("touchstart", handleWheelOrTouch);
      node.removeEventListener("touchmove", handleWheelOrTouch);
      node.removeEventListener("pointerdown", handlePointerDown);
      node.removeEventListener("keydown", handleKeyDown);
      node.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (viewportPublishTimerRef.current !== null) {
        window.clearTimeout(viewportPublishTimerRef.current);
        viewportPublishTimerRef.current = null;
      }
      if (viewportReapplyFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportReapplyFrameRef.current);
        viewportReapplyFrameRef.current = null;
      }
    };
  }, [material?.id, presentationMode, publishViewport, viewportSync]);

  useEffect(() => {
    const viewport = viewportSync?.state;
    if (
      !viewport
      || !material
      || viewport.materialId !== material.id
      || viewport.sourceClientId === viewportSync?.clientId
      || !isMaterialViewportNewer(viewport, appliedRemoteViewportRef.current)
    ) return;
    let cancelled = false;
    let attemptsRemaining = 12;
    applyingRemoteViewportRef.current = true;
    if (document?.pages.some((page) => page.id === viewport.pageId) && viewport.pageId !== activePageId) {
      setActivePageId(viewport.pageId);
    }
    const applyWhenReady = () => {
      if (cancelled) return;
      const node = viewport.scrollContainer === "image"
        ? materialSurfaceRef.current?.querySelector<HTMLElement>(".playsay-material-focused-image") ?? null
        : taskDocumentRef.current;
      if (node) {
        const left = viewport.x * Math.max(0, node.scrollWidth - node.clientWidth);
        const top = viewport.y * Math.max(0, node.scrollHeight - node.clientHeight);
        expectedRemoteScrollRef.current = { left, node, top };
        node.scrollLeft = left;
        node.scrollTop = top;
        lastNormalizedViewportRef.current = viewport;
        appliedRemoteViewportRef.current = viewport;
        window.requestAnimationFrame(() => {
          if (!cancelled) applyingRemoteViewportRef.current = false;
        });
        return;
      }
      attemptsRemaining -= 1;
      if (attemptsRemaining > 0) {
        window.requestAnimationFrame(applyWhenReady);
      } else {
        applyingRemoteViewportRef.current = false;
      }
    };
    window.requestAnimationFrame(applyWhenReady);
    return () => {
      cancelled = true;
      applyingRemoteViewportRef.current = false;
    };
  }, [activePageId, document, material, setActivePageId, viewportSync?.clientId, viewportSync?.state]);

  function updateAnswer(blockId: string, answer: MaterialAnswerBlock) {
    setAnswers((current) => ({
      ...current,
      [blockId]: answer,
    }));
    exerciseSync?.setAnswer(blockId, answer);
  }

  function submitAnswers() {
    if (!material) {
      return;
    }
    onSaveAnswers({
      schemaVersion: 1,
      materialId: material.id,
      answers: effectiveAnswers,
    });
  }

  const savedAnswersKey = JSON.stringify(materialAnswersFromSubmission(submission));
  const answersKey = JSON.stringify(effectiveAnswers);
  const liveScore = material ? materialLiveScore(material, effectiveAnswers) : null;
  const displayScore = answersKey !== savedAnswersKey && liveScore !== null
    ? liveScore
    : score ?? liveScore;
  const footerControls = collaborationControls === undefined ? (
    activePageAcceptsAnswers ? (
      <>
      <Button disabled={!material || submissionSaving} onClick={submitAnswers} type="button">
        {submissionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {submissionSaving ? t("classroom.actions.submitting") : t("classroom.actions.submit")}
      </Button>
      {submissionMessage ? <span className="playsay-task-submit-status">{submissionMessage}</span> : null}
      </>
    ) : null
  ) : collaborationControls;

  function updateMaterialCursor(event: PointerEvent<HTMLDivElement>) {
    if (!annotationSync) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const anchor = annotationAnchors.find(({ bounds }) => (
      event.clientX >= rect.left + bounds.left &&
      event.clientX <= rect.left + bounds.left + bounds.width &&
      event.clientY >= rect.top + bounds.top &&
      event.clientY <= rect.top + bounds.top + bounds.height
    ));
    annotationSync.updateCursor(anchor ? {
      anchorId: anchor.id,
      x: clamp01((event.clientX - rect.left - anchor.bounds.left) / anchor.bounds.width),
      y: clamp01((event.clientY - rect.top - anchor.bounds.top) / anchor.bounds.height),
    } : {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    });
  }

  function clearMaterialCursor() {
    annotationSync?.updateCursor(null);
  }

  function beginElementMoveOnCurrentSurface(event: PointerEvent<SVGElement>, elementId: string) {
    const element = visibleAnnotationElements.find((candidate) => candidate.id === elementId);
    const surface = materialSurfaceRef.current;
    const sourceSvg = event.currentTarget.ownerSVGElement;
    if (element && !element.anchorId && surface && sourceSvg) {
      const surfaceRect = surface.getBoundingClientRect();
      const anchor = annotationAnchors.find(({ bounds }) => (
        event.clientX >= surfaceRect.left + bounds.left &&
        event.clientX <= surfaceRect.left + bounds.left + bounds.width &&
        event.clientY >= surfaceRect.top + bounds.top &&
        event.clientY <= surfaceRect.top + bounds.top + bounds.height
      ));
      if (anchor && reanchorElement(event, elementId, anchor.id, sourceSvg.getBoundingClientRect(), {
        height: anchor.bounds.height,
        left: surfaceRect.left + anchor.bounds.left,
        top: surfaceRect.top + anchor.bounds.top,
        width: anchor.bounds.width,
      })) {
        return;
      }
    }
    beginElementMove(event, elementId);
  }

  return (
    <div className="playsay-task-board" data-presentation-mode={presentationMode}>
      {presentationMode !== "external-activity-focus" && presentationMode !== "html-game-focus" ? (
        <AnnotationToolbar
          annotationColor={annotationColor}
          annotationFontSize={annotationFontSize}
          annotationStrokeWidth={annotationStrokeWidth}
          annotationTool={annotationTool}
          canRedo={canRedo}
          canUndo={canUndo}
          onClearSelection={() => setSelectedElementId(null)}
          onRedo={redo}
          onSelectColor={updateSelectedColor}
          onSelectFontSize={updateSelectedFontSize}
          onSelectStrokeWidth={updateSelectedStrokeWidth}
          onSelectTool={setAnnotationTool}
          onUndo={undo}
          selectedElement={selectedAnnotationElement}
        />
      ) : null}

      <div className="playsay-task-page">
        <div className="playsay-task-document" ref={taskDocumentRef}>
          <div
            className="playsay-task-document-surface"
            data-live-presence={annotationSync && presentationMode !== "external-activity-focus" && presentationMode !== "html-game-focus" ? "true" : "false"}
            data-live-presence-ready={annotationSync?.ready && presentationMode !== "external-activity-focus" && presentationMode !== "html-game-focus" ? "true" : "false"}
            data-testid="lesson-material-surface"
            onPointerLeave={presentationMode === "external-activity-focus" || presentationMode === "html-game-focus" ? undefined : clearMaterialCursor}
            onPointerMove={presentationMode === "external-activity-focus" || presentationMode === "html-game-focus" ? undefined : updateMaterialCursor}
            ref={materialSurfaceRef}
          >
            {material ? (
              <LessonMaterialDocumentView
                activePageId={activePageId}
                answers={effectiveAnswers}
                canControlPages={canControlPages || Boolean(viewportSync)}
                material={material}
                htmlGameSync={htmlGameSync}
                videoSync={videoSync}
                exerciseParticipants={exerciseSync?.participants}
                onExerciseInteractionChange={exerciseSync?.updateInteraction}
                externalActivitySync={externalActivitySync}
                mode="classroom"
                onActivePageIdChange={(pageId) => {
                  setActivePageId(pageId);
                  window.requestAnimationFrame(() => publishViewport(
                    pageId,
                    presentationMode,
                    focusedBlockId,
                    { presentationChanged: true },
                  ));
                }}
                onAnswerChange={updateAnswer}
                onPresentationModeChange={(mode, blockId) => {
                  setPresentationMode(mode);
                  setFocusedBlockId(blockId ?? null);
                  const shared = viewportSync?.state;
                  if (
                    shared?.materialId === material.id
                    && shared.presentationMode === mode
                    && (shared.focusedBlockId ?? null) === (blockId ?? null)
                  ) {
                    return;
                  }
                  window.requestAnimationFrame(() => publishViewport(
                    activePageId,
                    mode,
                    blockId ?? null,
                    { presentationChanged: true },
                  ));
                }}
                sharedImageFocusBlockId={viewportSync?.state?.materialId === material.id
                  ? viewportSync.state.presentationMode === "image-focus"
                    ? viewportSync.state.focusedBlockId ?? null
                    : null
                  : undefined}
                score={displayScore}
              />
            ) : (
              <UnassignedLessonMaterial />
            )}
            {presentationMode !== "external-activity-focus" && presentationMode !== "html-game-focus" ? (
              <>
                <AnnotationLayer
              editingElementId={editingElementId}
              elements={pageAnnotationElements}
              onAddMindMapNode={addMindMapNode}
              onBegin={beginAnnotation}
              onDeleteSelected={deleteSelectedElement}
              onDeselect={() => setSelectedElementId(null)}
              onEditText={beginTextEditing}
              onEnd={endAnnotation}
              onElementSizeChange={updateAnnotationElementSize}
              onFinishTextEditing={finishTextEditing}
              onMove={extendAnnotation}
              onMoveElement={beginElementMoveOnCurrentSurface}
              onMindMapKey={handleMindMapKey}
              onRedo={redo}
              onResizeElement={beginElementResize}
              onSelectElement={setSelectedElementId}
              onTextChange={updateAnnotationText}
              onUndo={undo}
              selectedElementId={selectedElementId}
              tool={annotationTool}
                />
                {annotationAnchors.map((anchor) => (
                  <AnnotationLayer
                anchorId={anchor.id}
                anchorBounds={anchor.bounds}
                editingElementId={editingElementId}
                elements={visibleAnnotationElements.filter((element) => (
                  element.anchorId === anchor.id || (!element.anchorId && legacyAnchorId === anchor.id)
                ))}
                key={anchor.id}
                onAddMindMapNode={addMindMapNode}
                onBegin={(event) => beginAnnotation(event, anchor.id, legacyAnchorId === anchor.id)}
                onDeleteSelected={deleteSelectedElement}
                onDeselect={() => setSelectedElementId(null)}
                onEditText={beginTextEditing}
                onEnd={endAnnotation}
                onElementSizeChange={updateAnnotationElementSize}
                onFinishTextEditing={finishTextEditing}
                onMove={extendAnnotation}
                onMoveElement={beginElementMoveOnCurrentSurface}
                onMindMapKey={handleMindMapKey}
                onRedo={redo}
                onResizeElement={beginElementResize}
                onSelectElement={setSelectedElementId}
                onTextChange={updateAnnotationText}
                onUndo={undo}
                selectedElementId={selectedElementId}
                tool={annotationTool}
                  />
                ))}
                {mindMapLimitReached ? (
                  <div className="playsay-mind-map-limit" role="status">{t("classroom.annotation.mindMapLimit")}</div>
                ) : null}
                <PresenceCursorLayer participants={annotationSync?.participants ?? []} />
                {annotationAnchors.map((anchor) => (
                  <PresenceCursorLayer
                anchorBounds={anchor.bounds}
                anchorId={anchor.id}
                key={anchor.id}
                participants={annotationSync?.participants ?? []}
                  />
                ))}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="playsay-task-footer">
        {footerControls}
        <span className="playsay-task-teacher">{teacherName}</span>
      </footer>
    </div>
  );
}

function UnassignedLessonMaterial() {
  const { t } = useAppTranslation();

  return (
    <div
      className="grid min-h-80 place-content-center justify-items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center"
      data-testid="lesson-material-empty"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-white text-primary shadow-sm">
        <FileText aria-hidden="true" className="h-6 w-6" />
      </span>
      <div aria-level={3} className="text-xl font-extrabold text-foreground" role="heading">
        {t("classroom.material.unassignedTitle")}
      </div>
      <p className="max-w-md text-sm font-semibold leading-6 text-muted-foreground">
        {t("classroom.material.unassignedBody")}
      </p>
    </div>
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const scrollIntentKeys = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  " ",
]);

export type AnnotationAnchor = {
  bounds: AnnotationLayerBounds;
  focused: boolean;
  id: string;
};

export function useAnnotationAnchors(
  surfaceRef: RefObject<HTMLDivElement | null>,
  pageId: string | null,
  presentationMode: LessonPresentationMode,
): AnnotationAnchor[] {
  const [anchors, setAnchors] = useState<AnnotationAnchor[]>([]);

  useLayoutEffect(() => {
    const currentSurface = surfaceRef.current;
    if (!currentSurface) {
      setAnchors([]);
      return;
    }
    const surfaceElement: HTMLDivElement = currentSurface;
    const ownerDocument = surfaceElement.ownerDocument;

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => scheduleMeasure());
    let observedElements = new Set<Element>();
    let measurementFrame: number | null = null;

    function scheduleMeasure() {
      if (measurementFrame !== null) {
        return;
      }
      measurementFrame = window.requestAnimationFrame(() => {
        measurementFrame = null;
        measure();
      });
    }

    function handleRelatedScroll(event: Event) {
      const target = event.target;
      if (target === ownerDocument || (
        target instanceof Element &&
        (target.contains(surfaceElement) || surfaceElement.contains(target))
      )) {
        scheduleMeasure();
      }
    }

    function measure() {
      const surfaceRect = surfaceElement.getBoundingClientRect();
      const candidates = Array.from(surfaceElement.querySelectorAll<HTMLElement>("[data-playsay-annotation-anchor-id]"));
      const nextObservedElements = new Set<Element>([surfaceElement, ...candidates]);
      observedElements.forEach((element) => {
        if (!nextObservedElements.has(element)) resizeObserver?.unobserve(element);
      });
      nextObservedElements.forEach((element) => {
        if (!observedElements.has(element)) resizeObserver?.observe(element);
      });
      observedElements = nextObservedElements;
      const byId = new Map<string, AnnotationAnchor>();
      candidates.forEach((element) => {
        const id = element.dataset.playsayAnnotationAnchorId?.trim();
        const rect = element.getBoundingClientRect();
        if (!id || rect.width <= 0 || rect.height <= 0) return;
        const focused = Boolean(element.closest('.playsay-material-focus-stack[data-active="true"]'));
        const candidate = {
          bounds: {
            height: rect.height,
            left: rect.left - surfaceRect.left,
            top: rect.top - surfaceRect.top,
            width: rect.width,
          },
          focused,
          id,
        };
        const current = byId.get(id);
        if (!current || focused || !current.focused) byId.set(id, candidate);
      });
      const nextAnchors = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
      setAnchors((current) => sameAnnotationAnchors(current, nextAnchors) ? current : nextAnchors);
    }

    const mutationObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(scheduleMeasure);
    mutationObserver?.observe(surfaceElement, { childList: true, subtree: true });
    ownerDocument.addEventListener("scroll", handleRelatedScroll, true);
    window.addEventListener("resize", scheduleMeasure);
    measure();

    return () => {
      ownerDocument.removeEventListener("scroll", handleRelatedScroll, true);
      window.removeEventListener("resize", scheduleMeasure);
      if (measurementFrame !== null) {
        window.cancelAnimationFrame(measurementFrame);
      }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [pageId, presentationMode, surfaceRef]);

  return anchors;
}

function sameAnnotationAnchors(
  current: AnnotationAnchor[],
  next: AnnotationAnchor[],
): boolean {
  return current.length === next.length && current.every((anchor, index) => {
    const candidate = next[index];
    return candidate !== undefined &&
      anchor.id === candidate.id &&
      anchor.focused === candidate.focused &&
      anchor.bounds.height === candidate.bounds.height &&
      anchor.bounds.left === candidate.bounds.left &&
      anchor.bounds.top === candidate.bounds.top &&
      anchor.bounds.width === candidate.bounds.width;
  });
}
