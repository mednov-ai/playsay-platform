import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  fetchScheduledLessonMaterialAnnotation,
  saveScheduledLessonMaterialAnnotation,
} from "../../../shared/api/playsay";
import {
  annotationContentFromJson,
  annotationContentFromStrokes,
  emptyAnnotationContent,
  eraseAnnotationAt,
  svgPointFromEvent,
  type AnnotationStroke,
  type AnnotationTool,
} from "../model/annotation";

export function useLessonAnnotation({
  lessonId,
  materialId,
}: {
  lessonId: string;
  materialId?: string | null;
}) {
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pointer");
  const [annotationColor, setAnnotationColor] = useState("#ff5c00");
  const [annotationStrokes, setAnnotationStrokes] = useState<AnnotationStroke[]>([]);
  const [annotationReady, setAnnotationReady] = useState(false);
  const activeStrokeId = useRef<string | null>(null);
  const lastSyncedAnnotationRef = useRef("");

  useEffect(() => {
    if (!materialId) {
      setAnnotationReady(false);
      setAnnotationStrokes([]);
      lastSyncedAnnotationRef.current = "";
      return undefined;
    }

    let cancelled = false;

    async function loadAnnotation() {
      try {
        const annotation = await fetchScheduledLessonMaterialAnnotation(lessonId);
        const content = annotationContentFromJson(annotation?.content);
        const serialized = JSON.stringify(content);
        if (!cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          setAnnotationStrokes(content.strokes);
        }
      } catch {
        const content = emptyAnnotationContent();
        const serialized = JSON.stringify(content);
        if (!cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          setAnnotationStrokes(content.strokes);
        }
      } finally {
        if (!cancelled) {
          setAnnotationReady(true);
        }
      }
    }

    setAnnotationReady(false);
    lastSyncedAnnotationRef.current = "";
    setAnnotationStrokes([]);
    void loadAnnotation();
    const intervalId = window.setInterval(() => {
      void loadAnnotation();
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [lessonId, materialId]);

  useEffect(() => {
    if (!materialId || !annotationReady) {
      return undefined;
    }

    const content = annotationContentFromStrokes(annotationStrokes);
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
  }, [annotationReady, annotationStrokes, lessonId, materialId]);

  function beginAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (annotationTool === "pointer") {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = svgPointFromEvent(event);
    if (annotationTool === "eraser") {
      eraseAnnotationAt(point, setAnnotationStrokes);
      return;
    }

    const id = `stroke-${Date.now()}-${Math.round(point.x)}-${Math.round(point.y)}`;
    activeStrokeId.current = id;
    setAnnotationStrokes((current) => [...current, { color: annotationColor, id, pageId: point.pageId, points: [point] }]);
  }

  function extendAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (annotationTool === "pointer") {
      return;
    }

    event.preventDefault();
    const point = svgPointFromEvent(event);
    if (annotationTool === "eraser") {
      eraseAnnotationAt(point, setAnnotationStrokes);
      return;
    }

    const id = activeStrokeId.current;
    if (!id) {
      return;
    }

    setAnnotationStrokes((current) =>
      current.map((stroke) => (stroke.id === id ? { ...stroke, points: [...stroke.points, point] } : stroke)),
    );
  }

  function endAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (activeStrokeId.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be gone after browser-level cancellation.
      }
    }
    activeStrokeId.current = null;
  }

  return {
    annotationColor,
    annotationStrokes,
    annotationTool,
    beginAnnotation,
    endAnnotation,
    extendAnnotation,
    setAnnotationColor,
    setAnnotationStrokes,
    setAnnotationTool,
  };
}
