import {
  ArrowRight,
  Circle,
  Eraser,
  Minus,
  MousePointer2,
  Network,
  PenLine,
  RectangleHorizontal,
  Redo2,
  StickyNote,
  Type as TypeIcon,
  Undo2,
} from "lucide-react";
import { AnnotationToolButton } from "../../materials";
import { useAppTranslation } from "../../../shared/i18n";
import {
  annotationFontSizePresets,
  type AnnotationElement,
  type AnnotationFontSize,
  type AnnotationStrokeWidth,
  type AnnotationTool,
} from "../model/annotation";

export function AnnotationToolbar({
  annotationColor,
  annotationFontSize,
  annotationStrokeWidth,
  annotationTool,
  canRedo,
  canUndo,
  onClearSelection,
  onRedo,
  onSelectColor,
  onSelectFontSize,
  onSelectStrokeWidth,
  onSelectTool,
  onUndo,
  selectedElement,
}: {
  annotationColor: string;
  annotationFontSize: AnnotationFontSize;
  annotationStrokeWidth: AnnotationStrokeWidth;
  annotationTool: AnnotationTool;
  canRedo: boolean;
  canUndo: boolean;
  onClearSelection: () => void;
  onRedo: () => void;
  onSelectColor: (color: string) => void;
  onSelectFontSize: (fontSize: AnnotationFontSize) => void;
  onSelectStrokeWidth: (strokeWidth: AnnotationStrokeWidth) => void;
  onSelectTool: (tool: AnnotationTool) => void;
  onUndo: () => void;
  selectedElement: AnnotationElement | null;
}) {
  const { t } = useAppTranslation();
  const showFontSizeControls = annotationTool === "text"
    || annotationTool === "mindMap"
    || selectedElement?.kind === "text"
    || selectedElement?.kind === "mindMapNode";
  const smallerFontSize = [...annotationFontSizePresets].reverse().find((fontSize) => fontSize < annotationFontSize);
  const largerFontSize = annotationFontSizePresets.find((fontSize) => fontSize > annotationFontSize);
  const selectTool = (tool: AnnotationTool) => {
    if (tool === "text" || tool === "mindMap") onClearSelection();
    onSelectTool(tool);
  };

  return (
    <aside className="playsay-annotation-toolbar" aria-label={t("classroom.annotation.toolbar")}>
      <AnnotationToolButton active={annotationTool === "pointer"} label={t("classroom.annotation.pointer")} onClick={() => selectTool("pointer")} testId="annotation-tool-pointer">
        <MousePointer2 className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "pen"} label={t("classroom.annotation.pen")} onClick={() => selectTool("pen")} testId="annotation-tool-pen">
        <PenLine className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "eraser"} label={t("classroom.annotation.eraser")} onClick={() => selectTool("eraser")} testId="annotation-tool-eraser">
        <Eraser className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "line"} label={t("classroom.annotation.line")} onClick={() => selectTool("line")} testId="annotation-tool-line">
        <Minus className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "arrow"} label={t("classroom.annotation.arrow")} onClick={() => selectTool("arrow")} testId="annotation-tool-arrow">
        <ArrowRight className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "rectangle"} label={t("classroom.annotation.rectangle")} onClick={() => selectTool("rectangle")} testId="annotation-tool-rectangle">
        <RectangleHorizontal className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "ellipse"} label={t("classroom.annotation.ellipse")} onClick={() => selectTool("ellipse")} testId="annotation-tool-ellipse">
        <Circle className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "text"} label={t("classroom.annotation.text")} onClick={() => selectTool("text")} testId="annotation-tool-text">
        <TypeIcon className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "stickyNote"} label={t("classroom.annotation.stickyNote")} onClick={() => selectTool("stickyNote")} testId="annotation-tool-sticky-note">
        <StickyNote className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={annotationTool === "mindMap"} label={t("classroom.annotation.mindMap")} onClick={() => selectTool("mindMap")} testId="annotation-tool-mind-map">
        <Network className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={false} disabled={!canUndo} label={t("classroom.annotation.undo")} onClick={onUndo} testId="annotation-tool-undo">
        <Undo2 className="h-4 w-4" />
      </AnnotationToolButton>
      <AnnotationToolButton active={false} disabled={!canRedo} label={t("classroom.annotation.redo")} onClick={onRedo} testId="annotation-tool-redo">
        <Redo2 className="h-4 w-4" />
      </AnnotationToolButton>
      <div className="playsay-line-widths" aria-label={t("classroom.annotation.lineWidth")}>
        {([4, 8, 16] satisfies AnnotationStrokeWidth[]).map((strokeWidth) => (
          <button
            aria-label={t("classroom.annotation.lineWidthValue", { value: strokeWidth })}
            className="playsay-line-width"
            data-active={annotationStrokeWidth === strokeWidth ? "true" : "false"}
            key={strokeWidth}
            onClick={() => onSelectStrokeWidth(strokeWidth)}
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
            onClick={() => smallerFontSize && onSelectFontSize(smallerFontSize)}
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
            onClick={() => largerFontSize && onSelectFontSize(largerFontSize)}
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
            onClick={() => onSelectColor(color)}
            style={{ backgroundColor: color }}
            type="button"
          />
        ))}
      </div>
    </aside>
  );
}
