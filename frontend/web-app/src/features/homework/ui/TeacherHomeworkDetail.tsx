import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  fetchVocabularyPracticeSession,
  fetchHomeworkSubmissionResult,
  reviewVocabularyHomeworkAssignment,
  type HomeworkAssignment,
  type HomeworkAssignmentDetail,
  type HomeworkRecipientProgress,
  type VocabularyPracticeSession,
  type TeacherHomeworkSubmissionDetail,
} from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { formatMaterialScore, formatSubmissionTime, materialAnswersFromSubmission } from "../../materials";
import { ControlledAnnotationCanvas } from "../../classroom";
import { annotationContentFromJson } from "../../classroom/model/annotation";
import { formatHomeworkDate, progressToneColor, recipientSearchText, type HomeworkProgressFilter } from "../model/homeworkUtils";
import { VocabularyPracticePlayer } from "../../vocabulary/ui/VocabularyPracticePlayer";

export function TeacherHomeworkDetail({
  assignment,
  detail,
  lastLoadedAt,
  onDetailChange,
}: {
  assignment: HomeworkAssignment | null;
  detail: HomeworkAssignmentDetail | null;
  lastLoadedAt: string | null;
  onDetailChange: (detail: HomeworkAssignmentDetail) => void;
}) {
  const { t } = useAppTranslation();
  const [recipientSearch, setRecipientSearch] = useState("");
  const [progressFilter, setProgressFilter] = useState<HomeworkProgressFilter>("all");
  const [openedSession, setOpenedSession] = useState<VocabularyPracticeSession | null>(null);
  const [openedMaterialResult, setOpenedMaterialResult] = useState<TeacherHomeworkSubmissionDetail | null>(null);
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const active = detail?.assignment ?? assignment;
  if (!active) {
    return (
      <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        {t("homework.detail.empty")}
      </div>
    );
  }

  const recipients = detail?.recipients ?? [];
  const visibleRecipients = recipients.filter((recipient) => {
    const query = recipientSearch.trim().toLocaleLowerCase();
    const matchesQuery = !query || recipientSearchText(recipient).includes(query);
    if (!matchesQuery) {
      return false;
    }
    if (progressFilter === "missing") {
      return !recipient.submitted;
    }
    if (progressFilter === "errors") {
      return (recipient.errorsCount ?? 0) > 0;
    }
    return true;
  });

  async function openVocabularyResult(recipient: HomeworkRecipientProgress) {
    if (!recipient.activityRef) return;
    setOpeningSessionId(recipient.activityRef);
    setResultError(null);
    try {
      setOpenedSession(await fetchVocabularyPracticeSession(recipient.activityRef));
    } catch (caught) {
      setResultError(caught instanceof Error ? caught.message : t("homework.messages.detailLoadFailed"));
    } finally {
      setOpeningSessionId(null);
    }
  }

  async function openMaterialResult(recipient: HomeworkRecipientProgress) {
    if (!active || !recipient.submissionId || !recipient.submitted) return;
    const assignmentId = active.id;
    setOpeningSessionId(recipient.submissionId);
    setResultError(null);
    try {
      setOpenedMaterialResult(await fetchHomeworkSubmissionResult(assignmentId, recipient.submissionId));
    } catch (caught) {
      setResultError(caught instanceof Error ? caught.message : t("homework.messages.detailLoadFailed"));
    } finally {
      setOpeningSessionId(null);
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-white p-4">
      <div>
        <h3 className="text-lg font-extrabold">{active.title}</h3>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {active.contentKind === "VOCABULARY_PRACTICE" ? t("homework.contentKind.words") : active.materialTitle}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-extrabold text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-1">
            {t("homework.summary.recipients", { count: active.recipientCount })}
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            {t("homework.summary.scored", { count: active.scoredCount })}
          </span>
          {active.dueAt ? (
            <span className="rounded-full bg-muted px-2 py-1">
              {t("homework.summary.dueAt", { date: formatHomeworkDate(active.dueAt) })}
            </span>
          ) : null}
          {typeof active.averageScore === "number" ? (
            <span className="rounded-full bg-[#fff3eb] px-2 py-1 text-primary">
              {t("homework.summary.average", { score: formatMaterialScore(active.averageScore) })}
            </span>
          ) : null}
          {lastLoadedAt ? (
            <span className="rounded-full bg-muted px-2 py-1">
              {t("homework.summary.updatedAt", { time: formatSubmissionTime(lastLoadedAt) })}
            </span>
          ) : null}
        </div>
        {active.instructions ? (
          <div className="mt-3 rounded-xl border border-border bg-muted/45 p-3 text-sm font-semibold text-muted-foreground">
            <span className="mb-1 block text-xs font-extrabold uppercase text-primary">{t("homework.detail.instructions")}</span>
            {active.instructions}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        {resultError ? <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm font-bold text-destructive">{resultError}</p> : null}
        {openedSession ? (
          <div className="grid gap-2 rounded-2xl border border-primary/20 bg-[#fff8f3] p-3">
            <div className="flex items-center justify-between gap-2">
              <strong>{openedSession.ownerName ?? openedSession.ownerSubject}</strong>
              <Button className="min-h-9 px-3 py-1.5 text-sm" onClick={() => setOpenedSession(null)} type="button" variant="outline">
                {t("common.actions.close")}
              </Button>
            </div>
            <VocabularyPracticePlayer initialSession={openedSession} readOnly />
          </div>
        ) : null}
        {openedMaterialResult ? (
          <div className="grid gap-2 rounded-2xl border border-primary/20 bg-[#fff8f3] p-3">
            <div className="flex items-center justify-between gap-2">
              <strong>{openedMaterialResult.submission.userName ?? openedMaterialResult.submission.userSubject}</strong>
              <Button className="min-h-9 px-3 py-1.5 text-sm" onClick={() => setOpenedMaterialResult(null)} type="button" variant="outline">
                {t("common.actions.close")}
              </Button>
            </div>
            <ControlledAnnotationCanvas
              answers={materialAnswersFromSubmission(openedMaterialResult.submission)}
              content={annotationContentFromJson(openedMaterialResult.submission.content.annotations)}
              material={openedMaterialResult.material}
              onChange={() => undefined}
              readOnly
              score={openedMaterialResult.submission.score}
            />
          </div>
        ) : null}
        {recipients.length > 0 ? (
          <div className="grid gap-2 rounded-xl border border-border bg-muted/35 p-2">
            <input
              className="playsay-input"
              onChange={(event) => setRecipientSearch(event.target.value)}
              placeholder={t("homework.filters.search")}
              value={recipientSearch}
            />
            <div className="flex flex-wrap gap-2">
              {(["all", "missing", "errors"] as HomeworkProgressFilter[]).map((filter) => (
                <Button
                  data-active={progressFilter === filter ? "true" : "false"}
                  key={filter}
                  onClick={() => setProgressFilter(filter)}
                  type="button"
                  variant={progressFilter === filter ? "default" : "outline"}
                >
                  {t(`homework.filters.${filter}`)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {recipients.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/60 p-3 text-sm font-semibold text-muted-foreground">
            {t("homework.detail.noProgress")}
          </div>
        ) : visibleRecipients.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/60 p-3 text-sm font-semibold text-muted-foreground">
            {t("homework.detail.noFilteredProgress")}
          </div>
        ) : (
          visibleRecipients.map((recipient) => (
            <RecipientProgressRow
              assignmentId={active.id}
              key={recipient.studentUserId}
              onDetailChange={onDetailChange}
              onOpenResult={() => void (
                active.contentKind === "VOCABULARY_PRACTICE"
                  ? openVocabularyResult(recipient)
                  : openMaterialResult(recipient)
              )}
              opening={openingSessionId === (recipient.activityRef ?? recipient.submissionId)}
              recipient={recipient}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RecipientProgressRow({
  assignmentId,
  onDetailChange,
  onOpenResult,
  opening,
  recipient,
}: {
  assignmentId: string;
  onDetailChange: (detail: HomeworkAssignmentDetail) => void;
  onOpenResult: () => void;
  opening: boolean;
  recipient: HomeworkRecipientProgress;
}) {
  const { t } = useAppTranslation();
  const [reviewing, setReviewing] = useState(false);
  const [reviewNote, setReviewNote] = useState(recipient.reviewNote ?? "");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const tone = recipient.progressTone ?? 0;
  const vocabularyProgress = recipient.activityState !== null && recipient.activityState !== undefined;
  async function review(action: "ACCEPT" | "RETURN") {
    setReviewing(true);
    setReviewError(null);
    try {
      onDetailChange(await reviewVocabularyHomeworkAssignment(assignmentId, recipient.studentSubject, action, reviewNote));
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : t("homework.review.failed"));
    } finally {
      setReviewing(false);
    }
  }
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-extrabold">{recipient.studentName ?? recipient.studentSubject}</span>
        <span className="text-xs font-extrabold text-muted-foreground">
          {vocabularyProgress
            ? t("homework.progress.vocabulary", {
                accuracy: recipient.accuracy === null || recipient.accuracy === undefined ? "—" : `${Math.round(recipient.accuracy * 100)}%`,
                progress: recipient.completionRatio === null || recipient.completionRatio === undefined ? 0 : Math.round(recipient.completionRatio * 100),
              })
            : recipient.score === null || recipient.score === undefined
            ? t("homework.progress.notScored")
            : t("homework.progress.score", {
                errors: recipient.errorsCount ?? 0,
                score: formatMaterialScore(recipient.score),
              })}
        </span>
      </div>
      {vocabularyProgress ? (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((recipient.completionRatio ?? 0) * 100)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted-foreground">
              {t("homework.progress.vocabularyDetail", {
                difficult: recipient.difficultWordCount ?? 0,
                state: t(`homework.activityState.${recipient.activityState ?? "NOT_STARTED"}`),
              })}
            </span>
            {recipient.activityRef ? (
              <Button className="min-h-8 px-2.5 py-1 text-xs" disabled={opening} onClick={onOpenResult} type="button" variant="outline">
                {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t("homework.actions.openVocabularyResult")}
              </Button>
            ) : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white p-2 text-xs sm:grid-cols-3">
            <Metric label={t("homework.report.activity")} value={t("homework.report.activityValue", { entries: recipient.distinctEntries ?? 0, prompts: recipient.distinctGradedPrompts ?? 0 })} />
            <Metric label={t("homework.report.duration")} value={recipient.activeDurationMs == null ? t("homework.report.notAvailable") : t("homework.report.minutes", { count: Math.max(0, Math.round(recipient.activeDurationMs / 60_000)) })} />
            <Metric label={t("homework.report.accuracy")} value={recipient.accuracy == null ? t("homework.report.notAvailable") : `${Math.round(recipient.accuracy * 100)}%`} />
            <Metric label={t("homework.report.hints")} value={String(recipient.hintsUsed ?? 0)} />
            <Metric label={t("homework.report.difficult")} value={String(recipient.difficultWordCount ?? 0)} />
            <Metric label={t("homework.report.mastery")} value={recipient.masteryRatio == null ? t("homework.report.notAvailable") : `${Math.round(recipient.masteryRatio * 100)}%`} />
          </dl>
          {recipient.activityState === "AWAITING_REVIEW" ? (
            <div className="mt-3 grid gap-2 rounded-xl border border-primary/20 bg-[#fff8f3] p-3">
              <strong className="text-sm">{t("homework.review.title")}</strong>
              <input className="playsay-input" maxLength={1000} onChange={(event) => setReviewNote(event.target.value)} placeholder={t("homework.review.note")} value={reviewNote} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={reviewing} onClick={() => void review("ACCEPT")} type="button">{t("homework.review.accept")}</Button>
                <Button disabled={reviewing} onClick={() => void review("RETURN")} type="button" variant="outline">{t("homework.review.return")}</Button>
              </div>
              {reviewError ? <p aria-live="assertive" className="text-xs font-bold text-destructive">{reviewError}</p> : null}
            </div>
          ) : recipient.reviewState ? (
            <p className="mt-2 text-xs font-bold text-muted-foreground">{t("homework.review.state", { state: recipient.reviewState })}</p>
          ) : null}
        </>
      ) : (
        <>
          {recipient.showGroupIndicator ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full"
                style={{
                  backgroundColor: progressToneColor(tone),
                  width: `${tone}%`,
                }}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs font-bold text-muted-foreground">{t("homework.progress.groupOnly")}</p>
          )}
          {recipient.submitted && recipient.submissionId ? (
            <div className="mt-2 flex justify-end">
              <Button className="min-h-8 px-2.5 py-1 text-xs" disabled={opening} onClick={onOpenResult} type="button" variant="outline">
                {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t("homework.actions.openMaterialResult")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <div className="mt-2 text-xs font-bold text-muted-foreground">
        {recipient.updatedAt ? formatSubmissionTime(recipient.updatedAt) : t("homework.progress.notStarted")}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-bold text-muted-foreground">{label}</dt><dd className="mt-0.5 font-black">{value}</dd></div>;
}
