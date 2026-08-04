import { AlertCircle, ArrowLeft, CheckCircle2, Cloud, Loader2, RotateCcw, Send } from "lucide-react";
import type { StudentHomeworkDetail } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import {
  formatMaterialScore,
  formatSubmissionTime,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
} from "../../materials";
import { ControlledAnnotationCanvas } from "../../classroom";
import type { AnnotationContent } from "../../classroom/model/annotation";
import { formatHomeworkDate } from "../model/homeworkUtils";
import { VocabularyQuickAdd } from "../../vocabulary/ui/VocabularyQuickAdd";

export function StudentHomeworkDetailView({
  answers,
  annotations,
  detail,
  disabled,
  draftSaveState,
  draftSaving,
  hasUnsavedChanges,
  onAnswerChange,
  onAnnotationsChange,
  onBack,
  onRetryDraftSave,
  onSubmit,
  saving,
  score,
}: {
  answers: MaterialAnswerState;
  annotations: AnnotationContent;
  detail: StudentHomeworkDetail | null;
  disabled: boolean;
  draftSaveState: "idle" | "saved" | "error";
  draftSaving: boolean;
  hasUnsavedChanges: boolean;
  onAnswerChange: (blockId: string, answer: MaterialAnswerBlock) => void;
  onAnnotationsChange: (content: AnnotationContent) => void;
  onBack: () => void;
  onRetryDraftSave: () => void;
  onSubmit: () => void;
  saving: boolean;
  score: number | null;
}) {
  const { t } = useAppTranslation();
  if (!detail) {
    return (
      <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        {t("homework.detail.empty")}
      </div>
    );
  }

  return (
    <div className="playsay-student-homework-detail grid gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Button aria-label={t("homework.actions.backToList")} onClick={onBack} type="button" variant="outline">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{t("homework.actions.backToList")}</span>
        </Button>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-extrabold">{detail.assignment.title}</h3>
          <p className="truncate text-sm font-semibold text-muted-foreground">{detail.assignment.materialTitle}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs font-extrabold text-muted-foreground">
          {detail.assignment.dueAt ? (
            <span className="rounded-full bg-muted px-2 py-1">
              {t("homework.summary.dueAt", { date: formatHomeworkDate(detail.assignment.dueAt) })}
            </span>
          ) : null}
          </div>
          {detail.submission.submittedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-3 py-1 text-sm font-extrabold text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {formatMaterialScore(score)}
            </span>
          ) : null}
        </div>
        {detail.assignment.instructions ? (
          <div className="mb-3 rounded-xl border border-border bg-muted/45 p-3 text-sm font-semibold text-muted-foreground">
            <span className="mb-1 block text-xs font-extrabold uppercase text-primary">{t("homework.detail.instructions")}</span>
            {detail.assignment.instructions}
          </div>
        ) : null}
        <VocabularyQuickAdd source={{ sourceType: "HOMEWORK", assignmentId: detail.assignment.id, materialId: detail.material.id }}>
          <ControlledAnnotationCanvas
            answers={answers}
            content={annotations}
            material={detail.material}
            onAnswerChange={onAnswerChange}
            onChange={onAnnotationsChange}
            score={score}
          />
        </VocabularyQuickAdd>
      </div>

      <div className="playsay-homework-submit-bar">
        <Button disabled={disabled} onClick={onSubmit} type="button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {saving
            ? t("homework.actions.submitting")
            : detail.submission.submittedAt
              ? t("homework.actions.resubmit")
              : t("homework.actions.submit")}
        </Button>
        <div className="min-w-0 flex-1 text-sm font-bold text-muted-foreground" aria-live="polite">
          {draftSaving ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />{t("homework.submission.savingDraft")}</span>
          ) : draftSaveState === "error" ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {t("homework.submission.saveFailed")}
              <button className="inline-flex items-center gap-1 underline" onClick={onRetryDraftSave} type="button">
                <RotateCcw className="h-3.5 w-3.5" />
                {t("homework.actions.retrySave")}
              </button>
            </span>
          ) : detail.submission.submittedAt && hasUnsavedChanges ? (
            <span className="text-primary">{t("homework.submission.unsentChanges")}</span>
          ) : detail.submission.submittedAt ? (
            <span>{t("homework.submission.submittedAt", { time: formatSubmissionTime(detail.submission.submittedAt) })}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Cloud className="h-4 w-4" />
              {draftSaveState === "saved"
                ? t("homework.submission.draftSaved")
                : t("homework.submission.draft")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
