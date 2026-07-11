import { CheckCircle2, Loader2, Send } from "lucide-react";
import type { StudentHomeworkDetail } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import {
  formatMaterialScore,
  formatSubmissionTime,
  LessonMaterialDocumentView,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
} from "../../materials";
import { formatHomeworkDate } from "../model/homeworkUtils";
import { VocabularyQuickAdd } from "../../vocabulary/ui/VocabularyQuickAdd";

export function StudentHomeworkDetailView({
  answers,
  detail,
  disabled,
  onAnswerChange,
  onSubmit,
  saving,
  score,
}: {
  answers: MaterialAnswerState;
  detail: StudentHomeworkDetail | null;
  disabled: boolean;
  onAnswerChange: (blockId: string, answer: MaterialAnswerBlock) => void;
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
    <div className="grid gap-4">
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold">{detail.assignment.title}</h3>
            <p className="text-sm font-semibold text-muted-foreground">{detail.assignment.materialTitle}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-3 py-1 text-sm font-extrabold text-primary">
            <CheckCircle2 className="h-4 w-4" />
            {formatMaterialScore(score)}
          </span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-extrabold text-muted-foreground">
          {detail.assignment.dueAt ? (
            <span className="rounded-full bg-muted px-2 py-1">
              {t("homework.summary.dueAt", { date: formatHomeworkDate(detail.assignment.dueAt) })}
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
          <LessonMaterialDocumentView
            answers={answers}
            material={detail.material}
            mode="classroom"
            onAnswerChange={onAnswerChange}
            score={score}
            showScoreBadge={false}
          />
        </VocabularyQuickAdd>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={disabled} onClick={onSubmit} type="button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {saving ? t("homework.actions.submitting") : t("homework.actions.submit")}
        </Button>
        <span className="text-sm font-bold text-muted-foreground">
          {detail.submission.submittedAt
            ? t("homework.submission.submittedAt", { time: formatSubmissionTime(detail.submission.submittedAt) })
            : t("homework.submission.draft")}
        </span>
      </div>
    </div>
  );
}
