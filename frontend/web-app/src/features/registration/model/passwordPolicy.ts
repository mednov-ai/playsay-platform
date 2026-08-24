export type PasswordIssue =
  | "tooShort"
  | "tooLong"
  | "tooCommon"
  | "containsEmail"
  | "containsName"
  | "needsVariety";

export type PasswordCheck = {
  issues: PasswordIssue[];
  score: number;
  isValid: boolean;
};

export type PasswordReason =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_TOO_COMMON"
  | "PASSWORD_CONTAINS_EMAIL"
  | "PASSWORD_CONTAINS_NAME"
  | "PASSWORD_NEEDS_VARIETY";

const weakFragments = ["password", "qwerty", "12345678", "letmein", "admin", "playsay", "play-and-say"];

export function checkPassword(password: string, email: string, displayName?: string): PasswordCheck {
  const issues: PasswordIssue[] = [];
  const lowered = password.toLowerCase();

  if (password.length < 8) {
    issues.push("tooShort");
  }
  if (password.length > 128) {
    issues.push("tooLong");
  }
  if (weakFragments.some((fragment) => lowered.includes(fragment))) {
    issues.push("tooCommon");
  }
  const emailFragment = normalizedFragment(email.split("@")[0] ?? "");
  if (emailFragment && lowered.includes(emailFragment)) {
    issues.push("containsEmail");
  }
  if (displayNameFragments(displayName).some((fragment) => lowered.includes(fragment))) {
    issues.push("containsName");
  }
  if (characterClassCount(password) < 3) {
    issues.push("needsVariety");
  }

  const score = Math.max(0, Math.min(4, 4 - issues.length));
  return {
    issues,
    score,
    isValid: issues.length === 0,
  };
}

export function passwordIssueReason(issue: PasswordIssue): PasswordReason {
  return passwordReasonByIssue[issue];
}

function characterClassCount(password: string): number {
  return [
    /\p{Ll}/u.test(password),
    /\p{Lu}/u.test(password),
    /\p{N}/u.test(password),
    /[^\p{L}\p{N}]/u.test(password),
  ].filter(Boolean).length;
}

function normalizedFragment(value: string): string | null {
  const fragment = value.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  return fragment.length >= 3 ? fragment : null;
}

function displayNameFragments(displayName?: string): string[] {
  return (displayName ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => normalizedFragment(part))
    .filter((part): part is string => Boolean(part));
}

const passwordReasonByIssue: Record<PasswordIssue, PasswordReason> = {
  tooShort: "PASSWORD_TOO_SHORT",
  tooLong: "PASSWORD_TOO_LONG",
  tooCommon: "PASSWORD_TOO_COMMON",
  containsEmail: "PASSWORD_CONTAINS_EMAIL",
  containsName: "PASSWORD_CONTAINS_NAME",
  needsVariety: "PASSWORD_NEEDS_VARIETY",
};
