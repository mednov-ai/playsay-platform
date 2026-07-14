import { authConfig } from "./auth";
import { apiJson } from "./http";

export type AgePolicy = "CHILD" | "TEEN" | "ADULT";
export type FeedbackMode = "EVERY_TURN" | "SIGNIFICANT" | "SESSION_END";
export type TurnEvaluation = {
  clientTurnId: string;
  verdict: "ACCEPTED" | "IMPROVE";
  goalResult: "MET" | "PARTIAL" | "NOT_MET";
  original: string;
  improved: string;
  explanation: string;
  category: "GRAMMAR" | "VOCABULARY" | "RELEVANCE" | "CLARITY";
  encouragement: string;
};

export type TutorPersona = { id: string; name: string; voice: string; accent: string; avatarAsset: string };
export type ConversationScenario = { id: string; title: string; description: string; cefrLevel: string; category: string; conversationGoal: string; successCriteria: string[]; turnGoals: string[]; freeConversation: boolean };
export type DialogAllowance = {
  limited: boolean;
  remainingDialogs?: number | null;
  canStart: boolean;
  maxDurationSeconds: number;
  nextAction: "NONE" | "CONTACT_TEACHER" | "PURCHASE";
  teacherDisplayName?: string | null;
};
export type StudentDialogAllowance = {
  studentUserId: string;
  studentSubject: string;
  displayName: string;
  remainingDialogs: number;
  updatedAt?: string | null;
};
export type AiTutorSession = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "FAILED" | "EXPIRED";
  personaId: string;
  scenarioId: string;
  feedbackMode: FeedbackMode;
  startedAt: string;
  expiresAt?: string | null;
  completedAt?: string;
  realtime?: { available: boolean; clientSecret?: string; model: string; voice: string };
  summary?: { acceptedTurns: number; improvedTurns: number; goalsMet: number; recurringIssues: string[]; recommendedScenarioId: string };
  allowance?: DialogAllowance | null;
};

export async function fetchAiTutorCatalog() {
  const [personas, scenarios, allowance] = await Promise.all([
    apiJson<TutorPersona[]>("/api/ai-tutor/personas", { method: "GET" }, authConfig),
    apiJson<ConversationScenario[]>("/api/ai-tutor/scenarios", { method: "GET" }, authConfig),
    fetchDialogAllowance(),
  ]);
  return { personas, scenarios, allowance };
}

export function fetchDialogAllowance() {
  return apiJson<DialogAllowance>("/api/ai-tutor/dialog-allowance", { method: "GET" }, authConfig);
}

export function createAiTutorSession(input: {
  personaId: string;
  scenarioId: string;
  feedbackMode: FeedbackMode;
  freeTopic?: string;
  clientRequestId?: string;
}) {
  return apiJson<AiTutorSession>("/api/ai-tutor/sessions", { method: "POST", body: JSON.stringify(input) }, authConfig, 201);
}

export function fetchTeacherDialogAllowances() {
  return apiJson<StudentDialogAllowance[]>("/api/ai-tutor/teacher/dialog-allowances", { method: "GET" }, authConfig);
}

export function grantTeacherDialogCredits(studentUserId: string, quantity: number, requestId: string) {
  return apiJson<StudentDialogAllowance>(
    `/api/ai-tutor/teacher/dialog-allowances/${encodeURIComponent(studentUserId)}/grants`,
    { method: "POST", body: JSON.stringify({ quantity, requestId }) },
    authConfig,
  );
}

export function finishAiTutorSession(sessionId: string) {
  return apiJson<AiTutorSession>(`/api/ai-tutor/sessions/${sessionId}/finish`, { method: "POST" }, authConfig);
}

export function appendTurnEvaluation(sessionId: string, clientEventId: string, turnEvaluation: TurnEvaluation) {
  return apiJson<AiTutorSession>(`/api/ai-tutor/sessions/${sessionId}/events`, {
    method: "POST",
    body: JSON.stringify({ clientEventId, type: "TURN_EVALUATION", turnEvaluation }),
  }, authConfig);
}
