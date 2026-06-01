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

type LiveAnnotationSync = {
  ready: boolean;
  setStrokes: (updater: (current: AnnotationStroke[]) => AnnotationStroke[]) => void;
  strokes: AnnotationStroke[];
};

export function useLessonAnnotation({
  liveAnnotation,
  lessonId,
  materialId,
}: {
  liveAnnotation?: LiveAnnotationSync | null;
  lessonId: string;
  materialId?: string | null;
}) {
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pointer");
  const [annotationColor, setAnnotationColor] = useState("#ff5c00");
  const [localAnnotationStrokes, setLocalAnnotationStrokes] = useState<AnnotationStroke[]>([]);
  const [annotationReady, setAnnotationReady] = useState(false);
  const activeStrokeId = useRef<string | null>(null);
  const lastSyncedAnnotationRef = useRef("");
  const liveAnnotationRef = useRef<LiveAnnotationSync | null>(liveAnnotation ?? null);
  const liveStrokeCountRef = useRef(0);
  const annotationStrokes = liveAnnotation?.strokes ?? localAnnotationStrokes;
  const setAnnotationStrokes = liveAnnotation?.setStrokes ?? setLocalAnnotationStrokes;
  const liveAnnotationEnabled = Boolean(liveAnnotation);

  useEffect(() => {
    liveAnnotationRef.current = liveAnnotation ?? null;
  }, [liveAnnotation]);

  useEffect(() => {
    liveStrokeCountRef.current = liveAnnotation?.strokes.length ?? 0;
  }, [liveAnnotation?.strokes.length]);

  useEffect(() => {
    if (!materialId) {
      setAnnotationReady(false);
      setLocalAnnotationStrokes([]);
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
          const currentLiveAnnotation = liveAnnotationRef.current;
          if (currentLiveAnnotation) {
            if (liveStrokeCountRef.current === 0 && content.strokes.length > 0) {
              currentLiveAnnotation.setStrokes(() => content.strokes);
            }
          } else {
            setLocalAnnotationStrokes(content.strokes);
          }
        }
      } catch {
        const content = emptyAnnotationContent();
        const serialized = JSON.stringify(content);
        if (!liveAnnotationRef.current && !cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          setLocalAnnotationStrokes(content.strokes);
        }
      } finally {
        if (!cancelled) {
          setAnnotationReady(true);
        }
      }
    }

    setAnnotationReady(false);
    lastSyncedAnnotationRef.current = "";
    setLocalAnnotationStrokes([]);
    void loadAnnotation();
    if (liveAnnotationEnabled) {
      return () => {
        cancelled = true;
      };
    }

    const intervalId = window.setInterval(() => {
      void loadAnnotation();
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [lessonId, liveAnnotationEnabled, materialId]);

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
