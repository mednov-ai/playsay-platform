import type { HomeworkAssignment } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { formatHomeworkDate } from "../model/homeworkUtils";

export function HomeworkAssignmentList({
  assignments,
  canManage,
  onSelectAssignment,
  selectedAssignmentId,
}: {
  assignments: HomeworkAssignment[];
  canManage: boolean;
  onSelectAssignment: (assignmentId: string) => void;
  selectedAssignmentId: string | null;
}) {
  const { t } = useAppTranslation();

  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        {canManage ? t("homework.empty.teacher") : t("homework.empty.student")}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {assignments.map((assignment) => (
        <button
          className="rounded-2xl border border-border bg-white p-3 text-left transition hover:border-primary/40"
          data-active={assignment.id === selectedAssignmentId ? "true" : "false"}
          key={assignment.id}
          onClick={() => onSelectAssignment(assignment.id)}
          type="button"
        >
          <span className="block text-sm font-extrabold text-foreground">{assignment.title}</span>
          <span className="mt-1 block text-xs font-bold text-muted-foreground">{assignment.materialTitle}</span>
          <span className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {t("homework.summary.progress", {
                scored: assignment.scoredCount,
                total: assignment.recipientCount,
              })}
            </span>
            {assignment.dueAt ? (
              <span className="inline-flex rounded-full bg-[#fff3eb] px-2 py-1 text-xs font-extrabold text-primary">
                {t("homework.summary.dueAt", { date: formatHomeworkDate(assignment.dueAt) })}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
