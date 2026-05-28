import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eraser, Loader2, MousePointer2, PenLine, Send, Undo2 } from "lucide-react";
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
} from "../model/annotation";

export function LessonTaskCanvas({
  lessonId,
  material,
  onSaveAnswers,
  score,
  submission,
  submissionMessage,
  submissionSaving,
  teacherName,
}: {
  lessonId: string;
  material?: LessonMaterial | null;
  onSaveAnswers: (content: LessonMaterialJson) => void;
  score: number | null;
  submission: LessonMaterialSubmission | null;
  submissionMessage: string | null;
  submissionSaving: boolean;
  teacherName: string;
}) {
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
  } = useLessonAnnotation({ lessonId, materialId: material?.id });
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

  return (
    <div className="playsay-task-board">
      <aside className="playsay-annotation-toolbar" aria-label="Инструменты задания">
        <AnnotationToolButton active={annotationTool === "pointer"} label="Курсор" onClick={() => setAnnotationTool("pointer")}>
          <MousePointer2 className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "pen"} label="Карандаш" onClick={() => setAnnotationTool("pen")}>
          <PenLine className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "eraser"} label="Ластик" onClick={() => setAnnotationTool("eraser")}>
          <Eraser className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton
          active={false}
          disabled={annotationStrokes.length === 0}
          label="Отменить"
          onClick={() => setAnnotationStrokes((current) => current.slice(0, -1))}
        >
          <Undo2 className="h-4 w-4" />
        </AnnotationToolButton>
        <div className="playsay-color-swatches" aria-label="Цвет">
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
        </div>

        <svg
          className="playsay-annotation-layer"
          data-tool={annotationTool}
          onPointerCancel={endAnnotation}
          onPointerDown={beginAnnotation}
          onPointerMove={extendAnnotation}
          onPointerUp={endAnnotation}
          viewBox="0 0 1000 700"
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
      </div>

      <footer className="playsay-task-footer">
        <button aria-label="Предыдущее задание" className="playsay-page-button" type="button">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>1 из 14</span>
        <button aria-label="Следующее задание" className="playsay-page-button" type="button">
          <ChevronRight className="h-4 w-4" />
        </button>
        <Button disabled={!material || submissionSaving} onClick={submitAnswers} type="button">
          {submissionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submissionSaving ? "Отправляем" : "Отправить"}
        </Button>
        {submissionMessage ? <span className="playsay-task-submit-status">{submissionMessage}</span> : null}
        <span className="playsay-task-teacher">{teacherName}</span>
      </footer>
    </div>
  );
}
