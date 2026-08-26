import { apiJson, publicApiJson } from "./http";
import { authConfig } from "./auth";

export type LessonAccessAttempt = {
  attemptId: string;
  attemptSecret?: string;
  status: string;
  lessonId?: string;
  opensAt?: string;
  retryAfterSeconds?: number;
  authorizationUrl?: string;
};

export type LessonAdmission = {
  subject: string;
  status: string;
  revision: number;
  admissionMethod?: string | null;
  updatedAt: string;
};

export type LessonAdmissionOverview = {
  lessonId: string;
  pendingLobby: Array<{ attemptId: string; displayLabel: string; createdAt: string; expiresAt: string }>;
  admissions: LessonAdmission[];
};

export async function startLessonAccess(lessonId: string, token: string): Promise<LessonAccessAttempt> {
  return publicApiJson(`/api/public/lesson-access/${encodeURIComponent(lessonId)}/start`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function requestLessonEmailCode(
  lessonId: string,
  attemptId: string,
  attemptSecret: string,
  email: string,
  locale?: string,
): Promise<{ status: string }> {
  return publicApiJson(attemptPath(lessonId, attemptId, "email-code"), {
    method: "POST",
    headers: { "X-Honey-Lesson-Attempt": attemptSecret },
    body: JSON.stringify({ email, locale }),
  }, 202);
}

export async function verifyLessonEmailCode(
  lessonId: string,
  attemptId: string,
  attemptSecret: string,
  code: string,
  rememberMe: boolean,
): Promise<LessonAccessAttempt> {
  return publicApiJson(attemptPath(lessonId, attemptId, "email-code/verify"), {
    method: "POST",
    headers: { "X-Honey-Lesson-Attempt": attemptSecret },
    body: JSON.stringify({ code, rememberMe }),
  });
}

export async function requestLessonLobby(
  lessonId: string,
  attemptId: string,
  attemptSecret: string,
  displayLabel: string,
): Promise<{ status: string }> {
  return publicApiJson(attemptPath(lessonId, attemptId, "lobby"), {
    method: "POST",
    headers: { "X-Honey-Lesson-Attempt": attemptSecret },
    body: JSON.stringify({ displayLabel }),
  });
}

export async function getLessonAccessStatus(
  lessonId: string,
  attemptId: string,
  attemptSecret: string,
): Promise<LessonAccessAttempt> {
  return publicApiJson(attemptPath(lessonId, attemptId, "status"), {
    method: "GET",
    headers: { "X-Honey-Lesson-Attempt": attemptSecret },
  });
}

export async function resumeRememberedLessonAccess(
  lessonId: string,
  attemptId: string,
  attemptSecret: string,
): Promise<LessonAccessAttempt> {
  return apiJson(
    `/api/schedule/lessons/${encodeURIComponent(lessonId)}/access-attempts/${encodeURIComponent(attemptId)}/remembered`,
    { method: "POST", headers: { "X-Honey-Lesson-Attempt": attemptSecret } },
    authConfig,
  );
}

export async function revokeCurrentLessonSession(): Promise<void> {
  return apiJson("/api/users/me/lesson-sessions/current", { method: "DELETE" }, authConfig, 204);
}

export async function revokeAllLessonSessions(): Promise<void> {
  return apiJson("/api/users/me/lesson-sessions", { method: "DELETE" }, authConfig, 204);
}

export async function fetchLessonAdmissions(lessonId: string): Promise<LessonAdmissionOverview> {
  return apiJson(`/api/schedule/lessons/${encodeURIComponent(lessonId)}/admissions`, { method: "GET" }, authConfig);
}

export async function approveLessonLobby(
  lessonId: string,
  attemptId: string,
  studentSubject: string,
  expectedRevision?: number,
): Promise<{ status: string }> {
  return apiJson(`/api/schedule/lessons/${encodeURIComponent(lessonId)}/lobby/${encodeURIComponent(attemptId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ studentSubject, expectedRevision }),
  }, authConfig);
}

export async function denyLessonLobby(lessonId: string, attemptId: string): Promise<{ status: string }> {
  return apiJson(`/api/schedule/lessons/${encodeURIComponent(lessonId)}/lobby/${encodeURIComponent(attemptId)}/deny`, {
    method: "POST",
  }, authConfig);
}

export async function changeLessonAdmission(
  lessonId: string,
  subject: string,
  action: "kick" | "readmit",
  expectedRevision?: number,
): Promise<{ status: string }> {
  return apiJson(`/api/schedule/lessons/${encodeURIComponent(lessonId)}/admissions/${encodeURIComponent(subject)}/${action}`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision }),
  }, authConfig);
}

export async function rotateLessonAccessLink(lessonId: string): Promise<{ url: string; revision: number }> {
  return apiJson(`/api/schedule/lessons/${encodeURIComponent(lessonId)}/access-link/rotate`, { method: "POST" }, authConfig);
}

export async function revokeLessonAccessLink(lessonId: string): Promise<void> {
  return apiJson(`/api/schedule/lessons/${encodeURIComponent(lessonId)}/access-link`, { method: "DELETE" }, authConfig, 204);
}

function attemptPath(lessonId: string, attemptId: string, suffix: string): string {
  return `/api/public/lesson-access/${encodeURIComponent(lessonId)}/attempts/${encodeURIComponent(attemptId)}/${suffix}`;
}
