import { i18n } from "../i18n";
import { ApiError } from "./errors";

export type RecoveryPhase = "ready" | "recovering" | "unavailable" | "signInRequired" | "protocolError";
type Diagnostic = { outcome: RecoveryPhase; attempts: number; elapsedMs: number };
let phase: RecoveryPhase = "ready";
const listeners = new Set<() => void>();
const diagnostics: Diagnostic[] = [];

export function getSessionRecoveryPhase(): RecoveryPhase { return phase; }
export function subscribeSessionRecovery(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function reportSessionRecovery(next: RecoveryPhase, attempts = 0, elapsedMs = 0): void {
  diagnostics.push({ outcome: next, attempts, elapsedMs: Math.max(0, Math.round(elapsedMs)) });
  if (diagnostics.length > 20) diagnostics.shift();
  if (phase === next) return;
  phase = next;
  listeners.forEach((listener) => listener());
}
export function getSessionRecoveryDiagnostics(): readonly Diagnostic[] {
  return diagnostics.map((item) => ({ ...item }));
}
export function resetSessionRecoveryDiagnostics(): void {
  diagnostics.length = 0;
  phase = "ready";
  listeners.forEach((listener) => listener());
}
export function sessionUnavailableError(): ApiError {
  return new ApiError(0, "SESSION_UNAVAILABLE", i18n.t("sessionRecovery.unavailable"));
}
export function sessionRejectedError(): ApiError {
  return new ApiError(401, "SESSION_REJECTED", i18n.t("sessionRecovery.signInRequired"));
}
export function sessionChangedError(): ApiError {
  return new ApiError(409, "SESSION_CHANGED", i18n.t("sessionRecovery.retry"));
}
export function authProtocolError(): ApiError {
  return new ApiError(0, "AUTH_PROTOCOL_ERROR", i18n.t("sessionRecovery.protocolError"));
}
