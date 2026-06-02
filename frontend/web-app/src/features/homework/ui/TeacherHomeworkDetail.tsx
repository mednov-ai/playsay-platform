import { useState } from "react";
import type { HomeworkAssignment, HomeworkAssignmentDetail, HomeworkRecipientProgress } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { formatMaterialScore, formatSubmissionTime } from "../../materials";
import { formatHomeworkDate, progressToneColor, recipientSearchText, type HomeworkProgressFilter } from "../model/homeworkUtils";

export function TeacherHomeworkDetail({
  assignment,
  detail,
  lastLoadedAt,
}: {
  assignment: HomeworkAssignment | null;
  detail: HomeworkAssignmentDetail | null;
  lastLoadedAt: string | null;
}) {
  const { t } = useAppTranslation();
  const [recipientSearch, setRecipientSearch] = useState("");
  const [progressFilter, setProgressFilter] = useState<HomeworkProgressFilter>("all");
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

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-white p-4">
      <div>
        <h3 className="text-lg font-extrabold">{active.title}</h3>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">{active.materialTitle}</p>
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
            <RecipientProgressRow key={recipient.studentUserId} recipient={recipient} />
          ))
        )}
      </div>
    </div>
  );
}

function RecipientProgressRow({ recipient }: { recipient: HomeworkRecipientProgress }) {
  const { t } = useAppTranslation();
  const tone = recipient.progressTone ?? 0;
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-extrabold">{recipient.studentName ?? recipient.studentSubject}</span>
        <span className="text-xs font-extrabold text-muted-foreground">
          {recipient.score === null || recipient.score === undefined
            ? t("homework.progress.notScored")
            : t("homework.progress.score", {
                errors: recipient.errorsCount ?? 0,
                score: formatMaterialScore(recipient.score),
              })}
        </span>
      </div>
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
      <div className="mt-2 text-xs font-bold text-muted-foreground">
        {recipient.updatedAt ? formatSubmissionTime(recipient.updatedAt) : t("homework.progress.notStarted")}
      </div>
    </div>
  );
}
