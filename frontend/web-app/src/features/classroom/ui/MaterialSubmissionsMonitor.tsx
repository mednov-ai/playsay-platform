import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { LessonMaterialSubmission, ScheduledLesson } from "../../../shared/api/playsay";
import {
  formatMaterialScore,
  formatSubmissionTime,
  materialSubmissionAssessmentSummary,
  materialSubmissionUserLabel,
} from "../../materials";
import type { StudentHealthView } from "../model/studentHealth";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialSubmissionsMonitor({
  activeStudentSubject,
  error,
  health,
  onSelectStudent,
  participants,
  submissions,
}: {
  activeStudentSubject?: string | null;
  error: string | null;
  health?: StudentHealthView[];
  onSelectStudent?: (subject: string) => void;
  participants?: ScheduledLesson["participants"];
  submissions: LessonMaterialSubmission[];
}) {
  const { t } = useAppTranslation();
  const latestSubmissions = submissions.slice(0, 4);
  const healthBySubject = new Map((health ?? []).map((item) => [item.subject, item]));
  const showStudentHealth = Boolean(participants?.length && health?.length);

  if (!error && latestSubmissions.length === 0 && !showStudentHealth) {
    return null;
  }

  return (
    <section
      className="playsay-submission-monitor"
      aria-label={showStudentHealth ? t("classroom.health.aria") : t("classroom.submissions.aria")}
      data-mode={showStudentHealth ? "health" : "submissions"}
    >
      <div className="playsay-submission-monitor-summary">
        <span>{showStudentHealth ? t("classroom.health.title") : t("classroom.submissions.title")}</span>
        <strong>{showStudentHealth ? participants?.length ?? 0 : submissions.length}</strong>
      </div>
      <div className="playsay-submission-monitor-list">
        {error ? (
          <span className="playsay-submission-monitor-error">
            <AlertCircle className="h-3.5 w-3.5" />
            {t("classroom.submissions.loadError")}
          </span>
        ) : showStudentHealth ? (
          participants?.map((participant) => {
            const view = healthBySubject.get(participant.subject);
            const tone = view?.tone ?? "clear";
            const label = participant.displayName ?? participant.username ?? participant.subject;
            return (
              <button
                aria-label={t("classroom.health.openStudent", { name: label })}
                className="playsay-student-health-card"
                data-active={activeStudentSubject === participant.subject ? "true" : "false"}
                data-health={tone}
                key={participant.subject}
                onClick={() => onSelectStudent?.(participant.subject)}
                title={`${label} · ${t(`classroom.health.${tone}`)}`}
                type="button"
              >
                <span>{label}</span>
                {participant.materialTitle ? <small>{participant.materialTitle}</small> : null}
              </button>
            );
          })
        ) : latestSubmissions.length === 0 ? (
          <span className="playsay-submission-monitor-empty">{t("classroom.submissions.empty")}</span>
        ) : (
          latestSubmissions.map((submission) => {
            const assessment = materialSubmissionAssessmentSummary(submission);
            return (
              <span className="playsay-submission-pill" key={submission.id} title={`${materialSubmissionUserLabel(submission)} · ${assessment.label}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{materialSubmissionUserLabel(submission)}</span>
                {typeof submission.score === "number" ? <strong>{formatMaterialScore(submission.score)}</strong> : null}
                {assessment.hints > 0 ? <small>{t("classroom.submissions.hint", { count: assessment.hints })}</small> : null}
                {assessment.retries > 0 ? <small>{t("classroom.submissions.retry", { count: assessment.retries })}</small> : null}
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
