import type { LessonMaterialSubmission } from "../../../shared/api/playsay";

export type StudentHealthTone = "clear" | "watch" | "warm" | "hot";

export type StudentHealthEntry = {
  baselineErrorsCount: number;
  consecutiveErrorIncreases: number;
  currentErrorsCount: number;
  previousErrorsCount: number;
  subject: string;
  updatedAt: string | null;
};

export type StudentHealthState = Record<string, StudentHealthEntry>;

export type StudentHealthView = StudentHealthEntry & {
  newErrors: number;
  tone: StudentHealthTone;
};

export function updateStudentHealthState(
  previous: StudentHealthState,
  submissions: LessonMaterialSubmission[],
  participantSubjects: string[],
): StudentHealthState {
  const latestBySubject = latestSubmissionsBySubject(submissions);
  return participantSubjects.reduce<StudentHealthState>((next, subject) => {
    const submission = latestBySubject[subject] ?? null;
    const prior = previous[subject] ?? null;
    const currentErrorsCount = normalizeErrorsCount(submission?.errorsCount);
    const updatedAt = submission?.updatedAt ?? null;
    const hasNewSnapshot = updatedAt !== null && updatedAt !== prior?.updatedAt;
    const increased = prior === null
      ? currentErrorsCount > 0
      : hasNewSnapshot && currentErrorsCount > prior.previousErrorsCount;
    const decreasedOrSameOnNewSnapshot = prior !== null && hasNewSnapshot && currentErrorsCount <= prior.previousErrorsCount;

    next[subject] = {
      baselineErrorsCount: prior?.baselineErrorsCount ?? 0,
      consecutiveErrorIncreases: increased
        ? (prior?.consecutiveErrorIncreases ?? 0) + 1
        : decreasedOrSameOnNewSnapshot
          ? 0
          : prior?.consecutiveErrorIncreases ?? 0,
      currentErrorsCount,
      previousErrorsCount: currentErrorsCount,
      subject,
      updatedAt,
    };
    return next;
  }, {});
}

export function acknowledgeStudentHealth(state: StudentHealthState, subject: string): StudentHealthState {
  const current = state[subject];
  if (!current) {
    return state;
  }

  return {
    ...state,
    [subject]: {
      ...current,
      baselineErrorsCount: current.currentErrorsCount,
      consecutiveErrorIncreases: 0,
      previousErrorsCount: current.currentErrorsCount,
    },
  };
}

export function studentHealthForSubject(state: StudentHealthState, subject: string): StudentHealthView | null {
  const entry = state[subject];
  if (!entry) {
    return null;
  }

  const newErrors = Math.max(0, entry.currentErrorsCount - entry.baselineErrorsCount);
  return {
    ...entry,
    newErrors,
    tone: healthTone(newErrors, entry.consecutiveErrorIncreases),
  };
}

export function studentHealthViews(state: StudentHealthState): StudentHealthView[] {
  return Object.keys(state).map((subject) => requireHealthView(state, subject));
}

function requireHealthView(state: StudentHealthState, subject: string): StudentHealthView {
  const view = studentHealthForSubject(state, subject);
  if (!view) {
    throw new Error(`Student health is missing for ${subject}.`);
  }
  return view;
}

function healthTone(newErrors: number, consecutiveErrorIncreases: number): StudentHealthTone {
  if (newErrors <= 0) {
    return "clear";
  }

  if (newErrors >= 3 || consecutiveErrorIncreases >= 2) {
    return "hot";
  }

  if (newErrors >= 2) {
    return "warm";
  }

  return "watch";
}

function latestSubmissionsBySubject(submissions: LessonMaterialSubmission[]): Record<string, LessonMaterialSubmission> {
  return submissions.reduce<Record<string, LessonMaterialSubmission>>((latest, submission) => {
    const subject = submission.userSubject?.trim();
    if (!subject) {
      return latest;
    }

    const current = latest[subject];
    if (!current || timestampMs(submission.updatedAt) >= timestampMs(current.updatedAt)) {
      latest[subject] = submission;
    }
    return latest;
  }, {});
}

function normalizeErrorsCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function timestampMs(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
