import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LessonMaterial } from "../../../shared/api/playsay";
import {
  LessonMaterialDocumentView,
  editorDocumentFromJson,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
} from "../../materials";
import { useLessonAnnotation } from "../hooks/useLessonAnnotation";
import {
  annotationElementsForPage,
  type AnnotationContent,
  type AnnotationElement,
} from "../model/annotation";
import { AnnotationLayer } from "./AnnotationLayer";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { useAnnotationAnchors, type LessonPresentationMode } from "./LessonTaskCanvas";
import { useAppTranslation } from "../../../shared/i18n";

export function ControlledAnnotationCanvas({
  answers,
  content,
  material,
  onAnswerChange,
  onChange,
  readOnly = false,
  score,
}: {
  answers: MaterialAnswerState;
  content: AnnotationContent;
  material: LessonMaterial;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  onChange: (content: AnnotationContent) => void;
  readOnly?: boolean;
  score?: number | null;
}) {
  const { t } = useAppTranslation();
  const document = useMemo(
    () => editorDocumentFromJson(material.document, material.title),
    [material.document, material.title],
  );
  const firstPageId = document.pages[0]?.id ?? content.activePageId;
  const setControlledElements = useCallback(
    (updater: (current: AnnotationElement[]) => AnnotationElement[]) => {
      if (readOnly) return;
      onChange({ ...content, elements: updater(content.elements) });
    },
    [content, onChange, readOnly],
  );
  const controlledAnnotation = useMemo(() => ({
    elements: content.elements,
    key: material.id,
    setElements: setControlledElements,
  }), [content.elements, material.id, setControlledElements]);
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
    updateAnnotationElementSize,
    updateAnnotationText,
    updateSelectedColor,
    updateSelectedFontSize,
    updateSelectedStrokeWidth,
  } = useLessonAnnotation({
    controlledAnnotation,
    initialPageId: content.activePageId || firstPageId,
    lessonId: `homework:${material.id}`,
    materialId: material.id,
  });
  const [presentationMode, setPresentationMode] = useState<LessonPresentationMode>("default");
  const surfaceRef = useRef<HTMLDivElement>(null);
  const activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0] ?? null;
  const activePageHasImage = activePage?.blocks.some((block) => block.type === "image" || block.type === "generatedImage") ?? false;
  const anchors = useAnnotationAnchors(surfaceRef, activePage?.id ?? null, presentationMode);
  const pageElements = annotationElementsForPage(annotationElements, activePage?.id ?? activePageId);
  const selectedElement = selectedElementId
    ? pageElements.find((element) => element.id === selectedElementId) ?? null
    : null;

  useEffect(() => {
    if (content.activePageId !== activePageId) {
      onChange({ ...content, activePageId });
    }
  }, [activePageId, content, onChange]);

  return (
    <div
      className="playsay-controlled-annotation-canvas"
      data-has-toolbar={!readOnly && activePageHasImage ? "true" : "false"}
      data-presentation-mode={presentationMode}
      data-read-only={readOnly ? "true" : "false"}
    >
      {!readOnly && activePageHasImage ? (
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
          selectedElement={selectedElement}
        />
      ) : null}
      <div className="playsay-controlled-annotation-surface" ref={surfaceRef}>
        <LessonMaterialDocumentView
          activePageId={activePageId}
          answers={answers}
          canControlPages
          material={material}
          mode="classroom"
          onActivePageIdChange={setActivePageId}
          onAnswerChange={readOnly ? undefined : onAnswerChange}
          onPresentationModeChange={(mode) => setPresentationMode(mode)}
          score={score}
          showScoreBadge={false}
        />
        {activePageHasImage ? anchors.map((anchor, index) => (
          <AnnotationLayer
            anchorId={anchor.id}
            anchorBounds={anchor.bounds}
            editingElementId={readOnly ? null : editingElementId}
            elements={pageElements.filter((element) => element.anchorId === anchor.id || (!element.anchorId && index === 0))}
            key={anchor.id}
            onAddMindMapNode={addMindMapNode}
            onBegin={(event) => beginAnnotation(event, anchor.id, index === 0)}
            onDeleteSelected={deleteSelectedElement}
            onDeselect={() => setSelectedElementId(null)}
            onEditText={beginTextEditing}
            onEnd={endAnnotation}
            onElementSizeChange={updateAnnotationElementSize}
            onFinishTextEditing={finishTextEditing}
            onMindMapKey={handleMindMapKey}
            onMove={extendAnnotation}
            onMoveElement={beginElementMove}
            onRedo={redo}
            onResizeElement={beginElementResize}
            onSelectElement={setSelectedElementId}
            onTextChange={updateAnnotationText}
            onUndo={undo}
            readOnly={readOnly}
            selectedElementId={readOnly ? null : selectedElementId}
            tool={readOnly ? "pointer" : annotationTool}
          />
        )) : null}
        {!readOnly && mindMapLimitReached ? (
          <div className="playsay-mind-map-limit" role="status">{t("classroom.annotation.mindMapLimit")}</div>
        ) : null}
      </div>
    </div>
  );
}
