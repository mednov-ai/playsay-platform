import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { LessonMaterialSubmission } from "../../../shared/api/playsay";
import {
  formatMaterialScore,
  formatSubmissionTime,
  materialSubmissionAssessmentSummary,
  materialSubmissionUserLabel,
} from "../../materials";

export function MaterialSubmissionsMonitor({
  error,
  submissions,
}: {
  error: string | null;
  submissions: LessonMaterialSubmission[];
}) {
  const latestSubmissions = submissions.slice(0, 4);

  return (
    <section className="playsay-submission-monitor" aria-label="Ответы учеников">
      <div className="playsay-submission-monitor-summary">
        <span>Ответы учеников</span>
        <strong>{submissions.length}</strong>
      </div>
      <div className="playsay-submission-monitor-list">
        {error ? (
          <span className="playsay-submission-monitor-error">
            <AlertCircle className="h-3.5 w-3.5" />
            Ошибка загрузки
          </span>
        ) : latestSubmissions.length === 0 ? (
          <span className="playsay-submission-monitor-empty">пока нет ответов</span>
        ) : (
          latestSubmissions.map((submission) => {
            const assessment = materialSubmissionAssessmentSummary(submission);
            return (
              <span className="playsay-submission-pill" key={submission.id} title={`${materialSubmissionUserLabel(submission)} · ${assessment.label}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{materialSubmissionUserLabel(submission)}</span>
                {typeof submission.score === "number" ? <strong>{formatMaterialScore(submission.score)}</strong> : null}
                {assessment.hints > 0 ? <small>{assessment.hints} hint</small> : null}
                {assessment.retries > 0 ? <small>{assessment.retries} retry</small> : null}
                <time dateTime={submission.submittedAt ?? submission.updatedAt}>
                  {formatSubmissionTime(submission.submittedAt ?? submission.updatedAt)}
                </time>
              </span>
            );
          })
        )}
      </div>
    </section>
  );
}
