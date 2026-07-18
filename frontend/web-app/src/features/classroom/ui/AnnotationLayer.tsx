import { memo, useEffect, useId, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useAppTranslation } from "../../../shared/i18n";
import {
  annotationElementBounds,
  pointsToSvgPath,
  type AnnotationElement,
  type AnnotationTool,
} from "../model/annotation";

export const AnnotationLayer = memo(function AnnotationLayer({
  anchorBounds,
  editingElementId,
  elements,
  onBegin,
  onDeleteSelected,
  onDeselect,
  onEditText,
  onEnd,
  onFinishTextEditing,
  onMove,
  onMoveElement,
  onRedo,
  onResizeElement,
  onSelectElement,
  onTextChange,
  onUndo,
  selectedElementId,
  tool,
}: {
  anchorBounds?: AnnotationLayerBounds | null;
  editingElementId: string | null;
  elements: AnnotationElement[];
  onBegin: (event: PointerEvent<SVGSVGElement>) => void;
  onDeleteSelected: () => void;
  onDeselect: () => void;
  onEditText: (elementId: string) => void;
  onEnd: (event: PointerEvent<SVGSVGElement>) => void;
  onFinishTextEditing: () => void;
  onMove: (event: PointerEvent<SVGSVGElement>) => void;
  onMoveElement: (event: PointerEvent<SVGElement>, elementId: string) => void;
  onRedo: () => void;
  onResizeElement: (
    event: PointerEvent<SVGElement>,
    elementId: string,
    handle: "end" | "ne" | "nw" | "se" | "start" | "sw",
  ) => void;
  onSelectElement: (elementId: string | null) => void;
  onTextChange: (elementId: string, text: string) => void;
  onUndo: () => void;
  selectedElementId: string | null;
  tool: AnnotationTool;
}) {
  const { t } = useAppTranslation();
  const markerId = `playsay-arrow-${useId().split(":").join("")}`;
  const selectedElement = selectedElementId
    ? elements.find((element) => element.id === selectedElementId) ?? null
    : null;
  const anchored = anchorBounds !== undefined;
  const anchorPending = anchored && anchorBounds === null;
  const anchorStyle: CSSProperties | undefined = anchorBounds
    ? {
        bottom: "auto",
        height: `${anchorBounds.height}px`,
        left: `${anchorBounds.left}px`,
        right: "auto",
        top: `${anchorBounds.top}px`,
        width: `${anchorBounds.width}px`,
      }
    : undefined;

  useEffect(() => {
    function handleKeyboard(event: globalThis.KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        onRedo();
        return;
      }
      if (selectedElementId && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        onDeleteSelected();
        return;
      }
      if (event.key === "Escape") {
        onFinishTextEditing();
        onDeselect();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [onDeleteSelected, onDeselect, onFinishTextEditing, onRedo, onUndo, selectedElementId]);

  return (
    <svg
      aria-label={t("classroom.annotation.layer")}
      className="playsay-annotation-layer"
      data-anchor-pending={anchorPending ? "true" : "false"}
      data-anchored={anchored ? "true" : "false"}
      data-editing={editingElementId ? "true" : "false"}
      data-tool={tool}
      onPointerCancel={onEnd}
      onPointerDown={onBegin}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      preserveAspectRatio="none"
      style={anchorStyle}
      viewBox="0 0 1000 1000"
    >
      <defs>
        <marker
          id={markerId}
          markerHeight="10"
          markerUnits="strokeWidth"
          markerWidth="10"
          orient="auto"
          refX="8"
          refY="5"
          viewBox="0 0 10 10"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {elements.map((element) => (
        <AnnotationElementView
          editing={editingElementId === element.id}
          element={element}
          key={element.id}
          markerId={markerId}
          onEditText={onEditText}
          onFinishTextEditing={onFinishTextEditing}
          onMoveElement={onMoveElement}
          onSelectElement={onSelectElement}
          onTextChange={onTextChange}
          selected={selectedElementId === element.id}
          tool={tool}
        />
      ))}
      {selectedElement && tool === "pointer" ? (
        <SelectionOutline element={selectedElement} onResizeElement={onResizeElement} />
      ) : null}
    </svg>
  );
});

export type AnnotationLayerBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
};

const AnnotationElementView = memo(function AnnotationElementView({
  editing,
  element,
  markerId,
  onEditText,
  onFinishTextEditing,
  onMoveElement,
  onSelectElement,
  onTextChange,
  selected,
  tool,
}: {
  editing: boolean;
  element: AnnotationElement;
  markerId: string;
  onEditText: (elementId: string) => void;
  onFinishTextEditing: () => void;
  onMoveElement: (event: PointerEvent<SVGElement>, elementId: string) => void;
  onSelectElement: (elementId: string | null) => void;
  onTextChange: (elementId: string, text: string) => void;
  selected: boolean;
  tool: AnnotationTool;
}) {
  const { t } = useAppTranslation();
  const label = t(`classroom.annotation.element.${element.kind}`);
  const commonProps = {
    "aria-label": label,
    className: "playsay-annotation-element",
    "data-selected": selected ? "true" : "false",
    onKeyDown: (event: KeyboardEvent<SVGElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSelectElement(element.id);
        if (element.kind === "text" || element.kind === "stickyNote") {
          onEditText(element.id);
        }
      }
    },
    onPointerDown: (event: PointerEvent<SVGElement>) => onMoveElement(event, element.id),
    role: "button",
    tabIndex: tool === "pointer" ? 0 : -1,
  };

  if (element.kind === "stroke") {
    return (
      <path
        {...commonProps}
        d={pointsToSvgPath(element.points)}
        fill="none"
        stroke={element.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={element.strokeWidth}
      />
    );
  }
  if (element.kind === "line" || element.kind === "arrow") {
    return (
      <line
        {...commonProps}
        markerEnd={element.kind === "arrow" ? `url(#${markerId})` : undefined}
        stroke={element.color}
        strokeLinecap="round"
        strokeWidth={element.strokeWidth}
        x1={element.start.x}
        x2={element.end.x}
        y1={element.start.y}
        y2={element.end.y}
      />
    );
  }
  if (element.kind === "rectangle") {
    return (
      <rect
        {...commonProps}
        fill={element.fill}
        height={element.height}
        rx="8"
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        width={element.width}
        x={element.x}
        y={element.y}
      />
    );
  }
  if (element.kind === "ellipse") {
    return (
      <ellipse
        {...commonProps}
        cx={element.x + element.width / 2}
        cy={element.y + element.height / 2}
        fill={element.fill}
        rx={element.width / 2}
        ry={element.height / 2}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
      />
    );
  }

  return (
    <foreignObject
      {...commonProps}
      height={element.height}
      onDoubleClick={(event) => {
        if (tool !== "pointer") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onEditText(element.id);
      }}
      width={element.width}
      x={element.x}
      y={element.y}
    >
      <div
        className={`playsay-annotation-text playsay-annotation-text-${element.kind}`}
        data-empty={element.text ? "false" : "true"}
        style={{ backgroundColor: element.fill, color: element.color }}
      >
        {editing ? (
          <textarea
            aria-label={label}
            autoFocus
            maxLength={3_000}
            onBlur={onFinishTextEditing}
            onChange={(event) => onTextChange(element.id, event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
                event.currentTarget.blur();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={element.kind === "stickyNote"
              ? t("classroom.annotation.stickyPlaceholder")
              : t("classroom.annotation.textPlaceholder")}
            value={element.text}
          />
        ) : (
          <span>{element.text || (element.kind === "stickyNote"
            ? t("classroom.annotation.stickyPlaceholder")
            : t("classroom.annotation.textPlaceholder"))}</span>
        )}
      </div>
    </foreignObject>
  );
});

function SelectionOutline({
  element,
  onResizeElement,
}: {
  element: AnnotationElement;
  onResizeElement: (
    event: PointerEvent<SVGElement>,
    elementId: string,
    handle: "end" | "ne" | "nw" | "se" | "start" | "sw",
  ) => void;
}) {
  if (element.kind === "line" || element.kind === "arrow") {
    return (
      <g className="playsay-annotation-selection">
        <line
          stroke="#ff5c00"
          strokeDasharray="10 8"
          strokeWidth="3"
          x1={element.start.x}
          x2={element.end.x}
          y1={element.start.y}
          y2={element.end.y}
        />
        <ResizeHandle elementId={element.id} handle="start" onResize={onResizeElement} x={element.start.x} y={element.start.y} />
        <ResizeHandle elementId={element.id} handle="end" onResize={onResizeElement} x={element.end.x} y={element.end.y} />
      </g>
    );
  }

  const bounds = annotationElementBounds(element);
  const canResize = element.kind !== "stroke";
  return (
    <g className="playsay-annotation-selection">
      <rect
        fill="none"
        height={bounds.height}
        pointerEvents="none"
        stroke="#ff5c00"
        strokeDasharray="10 8"
        strokeWidth="3"
        width={bounds.width}
        x={bounds.x}
        y={bounds.y}
      />
      {canResize ? (
        <>
          <ResizeHandle elementId={element.id} handle="nw" onResize={onResizeElement} x={bounds.x} y={bounds.y} />
          <ResizeHandle elementId={element.id} handle="ne" onResize={onResizeElement} x={bounds.x + bounds.width} y={bounds.y} />
          <ResizeHandle elementId={element.id} handle="sw" onResize={onResizeElement} x={bounds.x} y={bounds.y + bounds.height} />
          <ResizeHandle elementId={element.id} handle="se" onResize={onResizeElement} x={bounds.x + bounds.width} y={bounds.y + bounds.height} />
        </>
      ) : null}
    </g>
  );
}

function ResizeHandle({
  elementId,
  handle,
  onResize,
  x,
  y,
}: {
  elementId: string;
  handle: "end" | "ne" | "nw" | "se" | "start" | "sw";
  onResize: (
    event: PointerEvent<SVGElement>,
    elementId: string,
    handle: "end" | "ne" | "nw" | "se" | "start" | "sw",
  ) => void;
  x: number;
  y: number;
}) {
  return (
    <circle
      className="playsay-annotation-resize-handle"
      cx={x}
      cy={y}
      onPointerDown={(event) => onResize(event, elementId, handle)}
      r="10"
    />
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable
    || target.tagName === "INPUT"
    || target.tagName === "TEXTAREA"
    || target.tagName === "SELECT"
  );
}
