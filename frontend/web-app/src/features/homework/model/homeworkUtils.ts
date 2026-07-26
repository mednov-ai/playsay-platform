import type { AdminUserProfile, HomeworkAssignment, HomeworkRecipientProgress } from "../../../shared/api/playsay";

export type HomeworkProgressFilter = "all" | "missing" | "errors";
export type StudentHomeworkStatus = "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "OVERDUE";

export function localDateTimeToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatHomeworkDate(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function studentHomeworkStatus(
  assignment: HomeworkAssignment,
  nowMs = Date.now(),
): StudentHomeworkStatus {
  if (assignment.mySubmissionState === "SUBMITTED") {
    return "SUBMITTED";
  }
  if (assignment.dueAt) {
    const dueAtMs = Date.parse(assignment.dueAt);
    if (Number.isFinite(dueAtMs) && dueAtMs < nowMs) {
      return "OVERDUE";
    }
  }
  return assignment.mySubmissionState === "DRAFT" ? "DRAFT" : "NOT_STARTED";
}

export function studentSearchText(student: AdminUserProfile): string {
  return [
    student.displayName,
    student.username,
    student.email,
    student.subject,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

export function recipientSearchText(recipient: HomeworkRecipientProgress): string {
  return [
    recipient.studentName,
    recipient.studentSubject,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

export function progressToneColor(tone: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, tone)) / 100) * 120);
  return `hsl(${hue} 72% 42%)`;
}
