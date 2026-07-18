import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowRight,
  Circle,
  Eraser,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Network,
  PenLine,
  RectangleHorizontal,
  Redo2,
  Send,
  StickyNote,
  Type as TypeIcon,
  Undo2,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  type LessonMaterial,
  type LessonMaterialJson,
  type LessonMaterialSubmission,
} from "../../../shared/api/playsay";
import { useLessonAnnotation } from "../hooks/useLessonAnnotation";
import {
  AnnotationToolButton,
  FallbackLessonDocument,
  LessonMaterialDocumentView,
  editorDocumentFromJson,
  materialAnswersFromSubmission,
  materialPageAcceptsAnswers,
  materialLiveScore,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
  type MaterialHtmlGameSync,
} from "../../materials";
import {
  annotationFontSizePresets,
  annotationElementsForPage,
  type AnnotationElement,
  type AnnotationFontSize,
  type AnnotationStrokeWidth,
} from "../model/annotation";
import type { CollaborationCursor, CollaborationParticipant } from "../hooks/useYjsWorkspace";
import { useAppTranslation } from "../../../shared/i18n";
import { PresenceCursorLayer } from "./PresenceCursorLayer";
import { AnnotationLayer, type AnnotationLayerBounds } from "./AnnotationLayer";

type LiveAnnotationSync = {
  elements: AnnotationElement[];
  participants: CollaborationParticipant[];
  ready: boolean;
  setElements: (updater: (current: AnnotationElement[]) => AnnotationElement[]) => void;
  updateCursor: (cursor: CollaborationCursor | null) => void;
};

export type LessonPresentationMode = "default" | "html-game-focus" | "html-game-minimized" | "image-focus";

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
  liveActivePageId,
  onPresentationModeChange,
}: {
  annotationSync?: LiveAnnotationSync | null;
  canControlPages?: boolean;
  htmlGameSync?: MaterialHtmlGameSync;
  liveActivePageId?: string | null;
  onPresentationModeChange?: (mode: LessonPresentationMode) => void;
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
    selectedElementId,
    setActivePageId,
    setAnnotationTool,
    setSelectedElementId,
    undo,
    updateAnnotationText,
    updateSelectedColor,
    updateSelectedFontSize,
    updateSelectedStrokeWidth,
  } = useLessonAnnotation({ initialPageId: firstPageId, lessonId, liveAnnotation: annotationSync, materialId: material?.id });
  const [answers, setAnswers] = useState<MaterialAnswerState>({});
  const [presentationMode, setPresentationMode] = useState<LessonPresentationMode>("default");
  const activePage = document?.pages.find((page) => page.id === activePageId) ?? document?.pages[0] ?? null;
  const materialSurfaceRef = useRef<HTMLDivElement>(null);
  const annotationAnchorBounds = useAnnotationAnchorBounds(
    materialSurfaceRef,
    activePage?.layout === "STATIC_IMAGE",
    activePage?.id ?? null,
    presentationMode,
  );
  const visibleAnnotationElements = annotationElementsForPage(annotationElements, activePage?.id ?? activePageId);
  const selectedAnnotationElement = selectedElementId
    ? visibleAnnotationElements.find((element) => element.id === selectedElementId) ?? null
    : null;
  const showFontSizeControls = annotationTool === "text"
    || annotationTool === "mindMap"
    || selectedAnnotationElement?.kind === "text"
    || selectedAnnotationElement?.kind === "mindMapNode";
  const smallerFontSize = [...annotationFontSizePresets].reverse().find((fontSize) => fontSize < annotationFontSize);
  const largerFontSize = annotationFontSizePresets.find((fontSize) => fontSize > annotationFontSize);
  const activePageAcceptsAnswers = materialPageAcceptsAnswers(activePage);

  useEffect(() => {
    setAnswers(materialAnswersFromSubmission(submission));
  }, [material?.id, submission?.id, submission?.updatedAt]);

  useEffect(() => {
    if (liveActivePageId && document?.pages.some((page) => page.id === liveActivePageId)) {
      setActivePageId(liveActivePageId);
    }
  }, [document, liveActivePageId, setActivePageId]);

  useEffect(() => {
    setPresentationMode(activePage?.layout === "HTML_GAME" ? "html-game-focus" : "default");
  }, [activePage?.id, activePage?.layout, material?.id]);

  useEffect(() => {
    onPresentationModeChange?.(presentationMode);
  }, [onPresentationModeChange, presentationMode]);

  useEffect(() => () => onPresentationModeChange?.("default"), [onPresentationModeChange]);

  function updateAnswer(blockId: string, answer: MaterialAnswerBlock) {
    setAnswers((current) => ({
      ...current,
      [blockId]: answer,
    }));
  }

  function submitAnswers() {
    if (!material) {
      return;
    }
    onSaveAnswers({
      schemaVersion: 1,
      materialId: material.id,
      answers,
    });
  }

  const savedAnswersKey = JSON.stringify(materialAnswersFromSubmission(submission));
  const answersKey = JSON.stringify(answers);
  const liveScore = material ? materialLiveScore(material, answers) : null;
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

    annotationSync.updateCursor({
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    });
  }

  function clearMaterialCursor() {
    annotationSync?.updateCursor(null);
  }

  return (
    <div className="playsay-task-board" data-presentation-mode={presentationMode}>
      <aside className="playsay-annotation-toolbar" aria-label={t("classroom.annotation.toolbar")}>
        <AnnotationToolButton active={annotationTool === "pointer"} label={t("classroom.annotation.pointer")} onClick={() => setAnnotationTool("pointer")} testId="annotation-tool-pointer">
          <MousePointer2 className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "pen"} label={t("classroom.annotation.pen")} onClick={() => setAnnotationTool("pen")} testId="annotation-tool-pen">
          <PenLine className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "eraser"} label={t("classroom.annotation.eraser")} onClick={() => setAnnotationTool("eraser")} testId="annotation-tool-eraser">
          <Eraser className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "line"} label={t("classroom.annotation.line")} onClick={() => setAnnotationTool("line")} testId="annotation-tool-line">
          <Minus className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "arrow"} label={t("classroom.annotation.arrow")} onClick={() => setAnnotationTool("arrow")} testId="annotation-tool-arrow">
          <ArrowRight className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "rectangle"} label={t("classroom.annotation.rectangle")} onClick={() => setAnnotationTool("rectangle")} testId="annotation-tool-rectangle">
          <RectangleHorizontal className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "ellipse"} label={t("classroom.annotation.ellipse")} onClick={() => setAnnotationTool("ellipse")} testId="annotation-tool-ellipse">
          <Circle className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "text"} label={t("classroom.annotation.text")} onClick={() => { setSelectedElementId(null); setAnnotationTool("text"); }} testId="annotation-tool-text">
          <TypeIcon className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "stickyNote"} label={t("classroom.annotation.stickyNote")} onClick={() => setAnnotationTool("stickyNote")} testId="annotation-tool-sticky-note">
          <StickyNote className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "mindMap"} label={t("classroom.annotation.mindMap")} onClick={() => { setSelectedElementId(null); setAnnotationTool("mindMap"); }} testId="annotation-tool-mind-map">
          <Network className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton
          active={false}
          disabled={!canUndo}
          label={t("classroom.annotation.undo")}
          onClick={undo}
          testId="annotation-tool-undo"
        >
          <Undo2 className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton
          active={false}
          disabled={!canRedo}
          label={t("classroom.annotation.redo")}
          onClick={redo}
          testId="annotation-tool-redo"
        >
          <Redo2 className="h-4 w-4" />
        </AnnotationToolButton>
        <div className="playsay-line-widths" aria-label={t("classroom.annotation.lineWidth")}>
          {([4, 8, 16] satisfies AnnotationStrokeWidth[]).map((strokeWidth) => (
            <button
              aria-label={t("classroom.annotation.lineWidthValue", { value: strokeWidth })}
              className="playsay-line-width"
              data-active={annotationStrokeWidth === strokeWidth ? "true" : "false"}
              key={strokeWidth}
              onClick={() => updateSelectedStrokeWidth(strokeWidth)}
              type="button"
            >
              <span style={{ height: Math.max(2, strokeWidth / 2) }} />
            </button>
          ))}
        </div>
        {showFontSizeControls ? (
          <div className="playsay-font-size-controls" aria-label={t("classroom.annotation.fontSize")}>
            <button
              aria-label={t("classroom.annotation.fontSizeDecrease")}
              className="playsay-font-size-button"
              data-testid="annotation-font-size-decrease"
              disabled={!smallerFontSize}
              onClick={() => smallerFontSize && updateSelectedFontSize(smallerFontSize as AnnotationFontSize)}
              title={t("classroom.annotation.fontSizeDecrease")}
              type="button"
            >
              A−
            </button>
            <output aria-label={t("classroom.annotation.fontSizeValue", { value: annotationFontSize })}>{annotationFontSize}</output>
            <button
              aria-label={t("classroom.annotation.fontSizeIncrease")}
              className="playsay-font-size-button"
              data-testid="annotation-font-size-increase"
              disabled={!largerFontSize}
              onClick={() => largerFontSize && updateSelectedFontSize(largerFontSize as AnnotationFontSize)}
              title={t("classroom.annotation.fontSizeIncrease")}
              type="button"
            >
              A+
            </button>
          </div>
        ) : null}
        <div className="playsay-color-swatches" aria-label={t("classroom.annotation.color")}>
          {["#ff5c00", "#00a878", "#2574ff"].map((color) => (
            <button
              aria-label={color}
              className="playsay-color-swatch"
              data-active={annotationColor === color ? "true" : "false"}
              key={color}
              onClick={() => updateSelectedColor(color)}
              style={{ backgroundColor: color }}
              type="button"
            />
          ))}
        </div>
        {activePage?.layout === "STATIC_IMAGE" ? (
          <AnnotationToolButton
            active={presentationMode === "image-focus"}
            label={presentationMode === "image-focus"
              ? t("classroom.presentation.collapseImage")
              : t("classroom.presentation.expandImage")}
            onClick={() => setPresentationMode((current) => current === "image-focus" ? "default" : "image-focus")}
            testId="static-image-focus-toggle"
          >
            {presentationMode === "image-focus" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </AnnotationToolButton>
        ) : null}
      </aside>

      <div className="playsay-task-page">
        {presentationMode === "html-game-focus" ? (
          <button
            aria-label={t("classroom.presentation.minimizeGame")}
            className="playsay-presentation-floating-action"
            data-testid="html-game-minimize"
            onClick={() => setPresentationMode("html-game-minimized")}
            title={t("classroom.presentation.minimizeGame")}
            type="button"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
        ) : null}
        <div className="playsay-task-document">
          <div
            className="playsay-task-document-surface"
            data-live-presence={annotationSync ? "true" : "false"}
            data-live-presence-ready={annotationSync?.ready ? "true" : "false"}
            data-testid="lesson-material-surface"
            onPointerLeave={clearMaterialCursor}
            onPointerMove={updateMaterialCursor}
            ref={materialSurfaceRef}
          >
            {material ? (
              <LessonMaterialDocumentView
                activePageId={activePageId}
                answers={answers}
                canControlPages={canControlPages}
                material={material}
                htmlGameSync={htmlGameSync}
                htmlGamePresentation={presentationMode === "html-game-focus"
                  ? "focus"
                  : presentationMode === "html-game-minimized"
                    ? "minimized"
                    : "normal"}
                mode="classroom"
                onActivePageIdChange={setActivePageId}
                onAnswerChange={updateAnswer}
                onHtmlGameRestore={() => setPresentationMode("html-game-focus")}
                score={displayScore}
              />
            ) : (
              <FallbackLessonDocument />
            )}
            <AnnotationLayer
              anchorBounds={activePage?.layout === "STATIC_IMAGE" ? annotationAnchorBounds : undefined}
              editingElementId={editingElementId}
              elements={visibleAnnotationElements}
              onAddMindMapNode={addMindMapNode}
              onBegin={beginAnnotation}
              onDeleteSelected={deleteSelectedElement}
              onDeselect={() => setSelectedElementId(null)}
              onEditText={beginTextEditing}
              onEnd={endAnnotation}
              onFinishTextEditing={finishTextEditing}
              onMove={extendAnnotation}
              onMoveElement={beginElementMove}
              onMindMapKey={handleMindMapKey}
              onRedo={redo}
              onResizeElement={beginElementResize}
              onSelectElement={setSelectedElementId}
              onTextChange={updateAnnotationText}
              onUndo={undo}
              selectedElementId={selectedElementId}
              tool={annotationTool}
            />
            {mindMapLimitReached ? (
              <div className="playsay-mind-map-limit" role="status">{t("classroom.annotation.mindMapLimit")}</div>
            ) : null}
            <PresenceCursorLayer participants={annotationSync?.participants ?? []} />
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function useAnnotationAnchorBounds(
  surfaceRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  pageId: string | null,
  presentationMode: LessonPresentationMode,
): AnnotationLayerBounds | null {
  const [bounds, setBounds] = useState<AnnotationLayerBounds | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setBounds(null);
      return;
    }

    const currentSurface = surfaceRef.current;
    if (!currentSurface) {
      setBounds(null);
      return;
    }
    const surfaceElement: HTMLDivElement = currentSurface;

    let anchor: HTMLElement | null = null;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => measure());

    function observeCurrentAnchor() {
      const nextAnchor = surfaceElement.querySelector<HTMLElement>('[data-playsay-annotation-anchor="true"]');
      if (nextAnchor === anchor) {
        return;
      }
      if (anchor) {
        resizeObserver?.unobserve(anchor);
      }
      anchor = nextAnchor;
      if (anchor) {
        resizeObserver?.observe(anchor);
      }
    }

    function measure() {
      observeCurrentAnchor();
      if (!anchor) {
        setBounds(null);
        return;
      }
      const surfaceRect = surfaceElement.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      if (anchorRect.width <= 0 || anchorRect.height <= 0) {
        setBounds(null);
        return;
      }
      const nextBounds = {
        height: anchorRect.height,
        left: anchorRect.left - surfaceRect.left,
        top: anchorRect.top - surfaceRect.top,
        width: anchorRect.width,
      };
      setBounds((current) => sameAnnotationBounds(current, nextBounds) ? current : nextBounds);
    }

    resizeObserver?.observe(surfaceElement);
    const mutationObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(measure);
    mutationObserver?.observe(surfaceElement, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    measure();

    return () => {
      window.removeEventListener("resize", measure);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [enabled, pageId, presentationMode, surfaceRef]);

  return bounds;
}

function sameAnnotationBounds(
  current: AnnotationLayerBounds | null,
  next: AnnotationLayerBounds,
): boolean {
  return current !== null &&
    current.height === next.height &&
    current.left === next.left &&
    current.top === next.top &&
    current.width === next.width;
}
