import { memo, useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useAppTranslation } from "../../../shared/i18n";
import {
  annotationElementBounds,
  annotationTextSizingConstraints,
  estimateAnnotationTextSize,
  pointsToSvgPath,
  type AnnotationElement,
  type AnnotationTool,
} from "../model/annotation";

export const AnnotationLayer = memo(function AnnotationLayer({
  anchorBounds,
  editingElementId,
  elements,
  onBegin,
  onAddMindMapNode,
  onDeleteSelected,
  onDeselect,
  onEditText,
  onEnd,
  onElementSizeChange,
  onFinishTextEditing,
  onMove,
  onMoveElement,
  onMindMapKey,
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
  onAddMindMapNode: (parentId: string, relation: "child" | "sibling", side?: "left" | "right") => void;
  onDeleteSelected: () => void;
  onDeselect: () => void;
  onEditText: (elementId: string) => void;
  onEnd: (event: PointerEvent<SVGSVGElement>) => void;
  onElementSizeChange: (elementId: string, width: number, height: number) => void;
  onFinishTextEditing: () => void;
  onMove: (event: PointerEvent<SVGSVGElement>) => void;
  onMoveElement: (event: PointerEvent<SVGElement>, elementId: string) => void;
  onMindMapKey: (elementId: string, key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "Enter" | "Tab") => void;
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
  const mindMapElements = elements.filter((element): element is Extract<AnnotationElement, { kind: "mindMapNode" }> => (
    element.kind === "mindMapNode"
  ));

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
          <polygon fill="context-stroke" points="0,0 10,5 0,10" />
        </marker>
      </defs>
      {mindMapElements.filter((element) => element.parentId).map((element) => {
        const parent = mindMapElements.find((candidate) => candidate.id === element.parentId);
        return parent ? <MindMapConnector child={element} key={`connector-${element.id}`} parent={parent} /> : null;
      })}
      {elements.map((element) => (
        <AnnotationElementView
          editing={editingElementId === element.id}
          element={element}
          key={element.id}
          markerId={markerId}
          onEditText={onEditText}
          onFinishTextEditing={onFinishTextEditing}
          onElementSizeChange={onElementSizeChange}
          onMoveElement={onMoveElement}
          onMindMapKey={onMindMapKey}
          onSelectElement={onSelectElement}
          onTextChange={onTextChange}
          selected={selectedElementId === element.id}
          tool={tool}
        />
      ))}
      {selectedElement && tool === "pointer" ? (
        <SelectionOutline element={selectedElement} onAddMindMapNode={onAddMindMapNode} onDeleteSelected={onDeleteSelected} onResizeElement={onResizeElement} />
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
  onElementSizeChange,
  onMoveElement,
  onMindMapKey,
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
  onElementSizeChange: (elementId: string, width: number, height: number) => void;
  onMoveElement: (event: PointerEvent<SVGElement>, elementId: string) => void;
  onMindMapKey: (elementId: string, key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "Enter" | "Tab") => void;
  onSelectElement: (elementId: string | null) => void;
  onTextChange: (elementId: string, text: string) => void;
  selected: boolean;
  tool: AnnotationTool;
}) {
  const { t } = useAppTranslation();
  const measurementRef = useRef<HTMLSpanElement>(null);
  const onElementSizeChangeRef = useRef(onElementSizeChange);
  const label = t(`classroom.annotation.element.${element.kind}`);
  const sizeableTextElement = element.kind === "text" || element.kind === "mindMapNode" ? element : null;
  const sizeableAutoWidth = sizeableTextElement?.kind === "text" ? sizeableTextElement.autoWidth : undefined;
  const sizeableParentId = sizeableTextElement?.kind === "mindMapNode" ? sizeableTextElement.parentId : undefined;

  useEffect(() => {
    onElementSizeChangeRef.current = onElementSizeChange;
  }, [onElementSizeChange]);

  useLayoutEffect(() => {
    if (!sizeableTextElement) return undefined;
    let cancelled = false;
    const measure = () => {
      const measurement = measurementRef.current;
      if (!measurement || cancelled) return;
      const constraints = annotationTextSizingConstraints(sizeableTextElement);
      const fallback = estimateAnnotationTextSize(sizeableTextElement);
      const autoWidth = sizeableTextElement.kind === "mindMapNode" || sizeableTextElement.autoWidth !== false;
      const availableWidth = Math.max(
        1,
        (autoWidth ? constraints.maxWidth : sizeableTextElement.width) - constraints.horizontalPadding * 2,
      );
      measurement.style.width = autoWidth ? "max-content" : `${availableWidth}px`;
      measurement.style.maxWidth = `${availableWidth}px`;
      const naturalBounds = measurement.getBoundingClientRect();
      const measurementScale = annotationMeasurementScale(measurement);
      const naturalWidth = naturalBounds.width / measurementScale.x;
      const nextWidth = autoWidth && naturalWidth > 0
        ? clampMeasurement(
          Math.ceil(naturalWidth * 1.2 + constraints.horizontalPadding * 2),
          constraints.minWidth,
          constraints.maxWidth,
        )
        : autoWidth ? fallback.width : sizeableTextElement.width;
      measurement.style.width = `${Math.max(1, nextWidth - constraints.horizontalPadding * 2)}px`;
      measurement.style.maxWidth = measurement.style.width;
      const wrappedBounds = measurement.getBoundingClientRect();
      const wrappedHeight = wrappedBounds.height / measurementScale.y;
      const nextHeight = wrappedHeight > 0
        ? clampMeasurement(
          Math.ceil(wrappedHeight + constraints.verticalPadding * 2),
          constraints.minHeight,
          constraints.maxHeight,
        )
        : fallback.height;
      onElementSizeChangeRef.current(sizeableTextElement.id, nextWidth, nextHeight);
    };
    measure();
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [
    sizeableAutoWidth,
    sizeableTextElement?.fontSize,
    sizeableTextElement?.id,
    sizeableTextElement?.kind,
    sizeableParentId,
    sizeableTextElement?.text,
    sizeableTextElement?.width,
  ]);
  const commonProps = {
    "aria-label": label,
    className: "playsay-annotation-element",
    "data-selected": selected ? "true" : "false",
    onKeyDown: (event: KeyboardEvent<SVGElement>) => {
      if (element.kind === "mindMapNode" && ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Enter", "Tab"].includes(event.key)) {
        event.preventDefault();
        onMindMapKey(element.id, event.key as "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "Enter" | "Tab");
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onSelectElement(element.id);
        if (element.kind === "text" || element.kind === "stickyNote" || element.kind === "mindMapNode") {
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
        data-mind-map-root={element.kind === "mindMapNode" && element.parentId === null ? "true" : undefined}
        data-text-clamped={element.kind === "mindMapNode" && element.height >= 160 ? "true" : undefined}
        style={{ backgroundColor: element.fill, color: element.color, fontSize: `${element.fontSize}px` }}
      >
        {sizeableTextElement ? (
          <span aria-hidden="true" className="playsay-annotation-text-measure" ref={measurementRef}>
            {sizeableTextElement.text || " "}
          </span>
        ) : null}
        {editing ? (
          <textarea
            aria-label={label}
            autoFocus
            maxLength={element.kind === "mindMapNode" ? 500 : 3_000}
            onBlur={onFinishTextEditing}
            onChange={(event) => onTextChange(element.id, event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (element.kind === "mindMapNode" && event.key === "Tab") {
                event.preventDefault();
                event.currentTarget.blur();
                onMindMapKey(element.id, "Tab");
                return;
              }
              if (element.kind === "mindMapNode" && event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.blur();
                onMindMapKey(element.id, "Enter");
                return;
              }
              if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
                event.currentTarget.blur();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={element.kind === "stickyNote"
              ? t("classroom.annotation.stickyPlaceholder")
              : element.kind === "mindMapNode"
                ? t("classroom.annotation.mindMapPlaceholder")
                : t("classroom.annotation.textPlaceholder")}
            value={element.text}
          />
        ) : (
          <span>{element.text || (element.kind === "stickyNote"
            ? t("classroom.annotation.stickyPlaceholder")
            : element.kind === "mindMapNode"
              ? t("classroom.annotation.mindMapPlaceholder")
              : t("classroom.annotation.textPlaceholder"))}</span>
        )}
      </div>
    </foreignObject>
  );
});

function MindMapConnector({
  child,
  parent,
}: {
  child: Extract<AnnotationElement, { kind: "mindMapNode" }>;
  parent: Extract<AnnotationElement, { kind: "mindMapNode" }>;
}) {
  const fromX = child.side === "left" ? parent.x : parent.x + parent.width;
  const toX = child.side === "left" ? child.x + child.width : child.x;
  const fromY = parent.y + parent.height / 2;
  const toY = child.y + child.height / 2;
  const control = Math.max(24, Math.abs(toX - fromX) * 0.45);
  const path = child.side === "left"
    ? `M ${fromX} ${fromY} C ${fromX - control} ${fromY}, ${toX + control} ${toY}, ${toX} ${toY}`
    : `M ${fromX} ${fromY} C ${fromX + control} ${fromY}, ${toX - control} ${toY}, ${toX} ${toY}`;
  return <path className="playsay-mind-map-connector" d={path} fill="none" stroke={child.color} strokeWidth="3" />;
}

function SelectionOutline({
  element,
  onAddMindMapNode,
  onDeleteSelected,
  onResizeElement,
}: {
  element: AnnotationElement;
  onAddMindMapNode: (parentId: string, relation: "child" | "sibling", side?: "left" | "right") => void;
  onDeleteSelected: () => void;
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
  const outlinePadding = element.kind === "text" || element.kind === "mindMapNode" ? 4 : 0;
  const outline = {
    height: bounds.height + outlinePadding * 2,
    width: bounds.width + outlinePadding * 2,
    x: bounds.x - outlinePadding,
    y: bounds.y - outlinePadding,
  };
  const canResize = element.kind !== "stroke" && element.kind !== "mindMapNode";
  return (
    <g className="playsay-annotation-selection">
      <rect
        fill="none"
        height={outline.height}
        pointerEvents="none"
        stroke="#ff5c00"
        strokeDasharray="10 8"
        strokeWidth="3"
        width={outline.width}
        x={outline.x}
        y={outline.y}
      />
      {element.kind === "mindMapNode" ? (
        <MindMapAddHandles element={element} onAdd={onAddMindMapNode} onDelete={onDeleteSelected} />
      ) : null}
      {canResize ? (
        <>
          <ResizeHandle elementId={element.id} handle="nw" onResize={onResizeElement} x={outline.x} y={outline.y} />
          <ResizeHandle elementId={element.id} handle="ne" onResize={onResizeElement} x={outline.x + outline.width} y={outline.y} />
          <ResizeHandle elementId={element.id} handle="sw" onResize={onResizeElement} x={outline.x} y={outline.y + outline.height} />
          <ResizeHandle elementId={element.id} handle="se" onResize={onResizeElement} x={outline.x + outline.width} y={outline.y + outline.height} />
        </>
      ) : null}
    </g>
  );
}

function MindMapAddHandles({
  element,
  onAdd,
  onDelete,
}: {
  element: Extract<AnnotationElement, { kind: "mindMapNode" }>;
  onAdd: (parentId: string, relation: "child" | "sibling", side?: "left" | "right") => void;
  onDelete: () => void;
}) {
  const { t } = useAppTranslation();
  const childHandles = element.parentId === null
    ? [
        { side: "left" as const, x: element.x - 14, y: element.y + element.height / 2 },
        { side: "right" as const, x: element.x + element.width + 14, y: element.y + element.height / 2 },
      ]
    : [{ side: element.side === "left" ? "left" as const : "right" as const, x: element.side === "left" ? element.x - 14 : element.x + element.width + 14, y: element.y + element.height / 2 }];
  return (
    <g className="playsay-mind-map-actions">
      {childHandles.map((handle) => (
        <g
          aria-label={t("classroom.annotation.mindMapAddChild")}
          className="playsay-mind-map-add"
          key={handle.side}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAdd(element.id, "child", handle.side);
          }}
          role="button"
          tabIndex={0}
          transform={`translate(${handle.x} ${handle.y})`}
        >
          <circle r="13" />
          <path d="M -6 0 H 6 M 0 -6 V 6" />
        </g>
      ))}
      {element.parentId ? (
        <g
          aria-label={t("classroom.annotation.mindMapAddSibling")}
          className="playsay-mind-map-add playsay-mind-map-add-sibling"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAdd(element.id, "sibling");
          }}
          role="button"
          tabIndex={0}
          transform={`translate(${element.x + element.width / 2} ${element.y + element.height + 14})`}
        >
          <circle r="12" />
          <path d="M -5 0 H 5 M 0 -5 V 5" />
        </g>
      ) : null}
      <g
        aria-label={t("classroom.annotation.mindMapDelete")}
        className="playsay-mind-map-add playsay-mind-map-delete"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }}
        role="button"
        tabIndex={0}
        transform={`translate(${element.x + element.width - 4} ${element.y + 4})`}
      >
        <circle r="11" />
        <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" />
      </g>
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

function clampMeasurement(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function annotationMeasurementScale(measurement: HTMLElement): { x: number; y: number } {
  const foreignObject = measurement.closest("foreignObject");
  const svg = foreignObject instanceof SVGElement ? foreignObject.ownerSVGElement : null;
  const bounds = svg?.getBoundingClientRect();
  const viewBox = svg?.viewBox.baseVal;
  return {
    x: bounds && viewBox && bounds.width > 0 && viewBox.width > 0 ? bounds.width / viewBox.width : 1,
    y: bounds && viewBox && bounds.height > 0 && viewBox.height > 0 ? bounds.height / viewBox.height : 1,
  };
}
