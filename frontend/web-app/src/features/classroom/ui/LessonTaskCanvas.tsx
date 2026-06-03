import { useEffect, useState, type PointerEvent, type ReactNode } from "react";
import { Eraser, Loader2, MousePointer2, PenLine, Send, Undo2 } from "lucide-react";
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
  materialAnswersFromSubmission,
  materialLiveScore,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
} from "../../materials";
import {
  pointsToSvgPath,
  type AnnotationStroke,
} from "../model/annotation";
import type { CollaborationCursor, CollaborationParticipant } from "../hooks/useYjsWorkspace";
import { useAppTranslation } from "../../../shared/i18n";
import { PresenceCursorLayer } from "./PresenceCursorLayer";

type LiveAnnotationSync = {
  participants: CollaborationParticipant[];
  ready: boolean;
  setStrokes: (updater: (current: AnnotationStroke[]) => AnnotationStroke[]) => void;
  strokes: AnnotationStroke[];
  updateCursor: (cursor: CollaborationCursor | null) => void;
};

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
}: {
  annotationSync?: LiveAnnotationSync | null;
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
  const {
    annotationColor,
    annotationStrokes,
    annotationTool,
    beginAnnotation,
    endAnnotation,
    extendAnnotation,
    setAnnotationColor,
    setAnnotationStrokes,
    setAnnotationTool,
  } = useLessonAnnotation({ lessonId, liveAnnotation: annotationSync, materialId: material?.id });
  const [answers, setAnswers] = useState<MaterialAnswerState>({});

  useEffect(() => {
    setAnswers(materialAnswersFromSubmission(submission));
  }, [material?.id, submission?.id, submission?.updatedAt]);

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
    <>
      <Button disabled={!material || submissionSaving} onClick={submitAnswers} type="button">
        {submissionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {submissionSaving ? t("classroom.actions.submitting") : t("classroom.actions.submit")}
      </Button>
      {submissionMessage ? <span className="playsay-task-submit-status">{submissionMessage}</span> : null}
    </>
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
    <div className="playsay-task-board">
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
        <AnnotationToolButton
          active={false}
          disabled={annotationStrokes.length === 0}
          label={t("classroom.annotation.undo")}
          onClick={() => setAnnotationStrokes((current) => current.slice(0, -1))}
          testId="annotation-tool-undo"
        >
          <Undo2 className="h-4 w-4" />
        </AnnotationToolButton>
        <div className="playsay-color-swatches" aria-label={t("classroom.annotation.color")}>
          {["#ff5c00", "#00a878", "#2574ff"].map((color) => (
            <button
              aria-label={color}
              className="playsay-color-swatch"
              data-active={annotationColor === color ? "true" : "false"}
              key={color}
              onClick={() => setAnnotationColor(color)}
              style={{ backgroundColor: color }}
              type="button"
            />
          ))}
        </div>
      </aside>

      <div className="playsay-task-page">
        <div className="playsay-task-document">
          <div
            className="playsay-task-document-surface"
            data-live-presence={annotationSync ? "true" : "false"}
            data-live-presence-ready={annotationSync?.ready ? "true" : "false"}
            data-testid="lesson-material-surface"
            onPointerLeave={clearMaterialCursor}
            onPointerMove={updateMaterialCursor}
          >
            {material ? (
              <LessonMaterialDocumentView
                answers={answers}
                material={material}
                mode="classroom"
                onAnswerChange={updateAnswer}
                score={displayScore}
              />
            ) : (
              <FallbackLessonDocument />
            )}
            <svg
              aria-label={t("classroom.annotation.layer")}
              className="playsay-annotation-layer"
              data-tool={annotationTool}
              onPointerCancel={endAnnotation}
              onPointerDown={beginAnnotation}
              onPointerMove={extendAnnotation}
              onPointerUp={endAnnotation}
              preserveAspectRatio="none"
              viewBox="0 0 1000 1000"
            >
              {annotationStrokes.map((stroke) => (
                <path
                  d={pointsToSvgPath(stroke.points)}
                  fill="none"
                  key={stroke.id}
                  stroke={stroke.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="8"
                />
              ))}
            </svg>
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
