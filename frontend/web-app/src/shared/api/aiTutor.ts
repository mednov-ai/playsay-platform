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
export type AiTutorSession = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "FAILED";
  personaId: string;
  scenarioId: string;
  feedbackMode: FeedbackMode;
  startedAt: string;
  completedAt?: string;
  realtime?: { available: boolean; clientSecret?: string; model: string; voice: string };
  summary?: { acceptedTurns: number; improvedTurns: number; goalsMet: number; recurringIssues: string[]; recommendedScenarioId: string };
};

export async function fetchAiTutorCatalog() {
  const [personas, scenarios] = await Promise.all([
    apiJson<TutorPersona[]>("/api/ai-tutor/personas", { method: "GET" }, authConfig),
    apiJson<ConversationScenario[]>("/api/ai-tutor/scenarios", { method: "GET" }, authConfig),
  ]);
  return { personas, scenarios };
}

export function createAiTutorSession(input: {
  personaId: string;
  scenarioId: string;
  feedbackMode: FeedbackMode;
  freeTopic?: string;
}) {
  return apiJson<AiTutorSession>("/api/ai-tutor/sessions", { method: "POST", body: JSON.stringify(input) }, authConfig, 201);
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
