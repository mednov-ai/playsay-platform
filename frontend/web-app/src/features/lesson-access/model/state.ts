export type LessonEntryStep =
  | "starting"
  | "choose"
  | "email-code"
  | "waiting"
  | "denied"
  | "closed"
  | "error";

export function stepForStatus(status: string): LessonEntryStep {
  switch (status) {
    case "CONFIRMATION_REQUIRED": return "choose";
    case "CODE_SENT_IF_ELIGIBLE": return "email-code";
    case "WAITING_FOR_WINDOW":
    case "WAITING_FOR_TEACHER": return "waiting";
    case "DENIED": return "denied";
    case "CLOSED": return "closed";
    default: return "error";
  }
}

export function accountLabelFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(globalThis.atob(normalized)) as Record<string, unknown>;
    for (const key of ["email", "preferred_username", "name"]) {
      const value = claims[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function lessonTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token?.trim() || null;
}
