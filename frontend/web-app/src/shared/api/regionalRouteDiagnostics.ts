import { readTokens } from "./auth";

export type RegionalRouteDiagnosticEvent = {
  attemptId: string;
  stage: "ENTRY" | "AUTH" | "POLICY" | "SIGNALING" | "ICE" | "MEDIA";
  outcome: "STARTED" | "SUCCESS" | "FAILURE" | "UNAVAILABLE";
  connectionRole: "PUBLISHER" | "SUBSCRIBER" | "NONE";
  regionalEndpointMatched: boolean | null;
  transportClass: "DIRECT" | "TURN_UDP" | "TURN_TCP" | "TURN_TLS" | "UNKNOWN";
};

const storageKey = "honey-school:regional-route-diagnostics";
const maxBufferedEvents = 50;
const traceLifetimeMs = 15 * 60 * 1_000;
export type BufferedRouteDiagnostic = RegionalRouteDiagnosticEvent & { recordedAt: number };

function sanitizeEvent(value: unknown): RegionalRouteDiagnosticEvent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.attemptId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.attemptId)
    || !["ENTRY", "AUTH", "POLICY", "SIGNALING", "ICE", "MEDIA"].includes(String(item.stage))
    || !["STARTED", "SUCCESS", "FAILURE", "UNAVAILABLE"].includes(String(item.outcome))
    || !["PUBLISHER", "SUBSCRIBER", "NONE"].includes(String(item.connectionRole))
    || !["DIRECT", "TURN_UDP", "TURN_TCP", "TURN_TLS", "UNKNOWN"].includes(String(item.transportClass))
    || (item.regionalEndpointMatched !== null && typeof item.regionalEndpointMatched !== "boolean")) return null;
  return {
    attemptId: item.attemptId,
    stage: item.stage as RegionalRouteDiagnosticEvent["stage"],
    outcome: item.outcome as RegionalRouteDiagnosticEvent["outcome"],
    connectionRole: item.connectionRole as RegionalRouteDiagnosticEvent["connectionRole"],
    transportClass: item.transportClass as RegionalRouteDiagnosticEvent["transportClass"],
    regionalEndpointMatched: item.regionalEndpointMatched as boolean | null,
  };
}

export function readRegionalRouteDiagnostics(): BufferedRouteDiagnostic[] {
  try {
    const stored = window.sessionStorage.getItem(storageKey) ?? "[]";
    if (stored.length > 64_000) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.slice(-maxBufferedEvents).flatMap((value: unknown) => {
      const event = sanitizeEvent(value);
      const recordedAt = (value as Partial<BufferedRouteDiagnostic> | null)?.recordedAt;
      return event && typeof recordedAt === "number" && Number.isFinite(recordedAt)
        && recordedAt <= now && now - recordedAt < traceLifetimeMs ? [{ ...event, recordedAt }] : [];
    });
  } catch {
    return [];
  }
}

export async function reportRegionalRouteDiagnostic(event: RegionalRouteDiagnosticEvent): Promise<void> {
  const sanitized = sanitizeEvent(event);
  if (!sanitized) return;
  bufferDiagnostic(sanitized);
  try {
    const tokens = readTokens();
    if (!tokens || tokens.expiresAt <= Date.now()) return;
    await fetch("/api/diagnostics/regional-route", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify(sanitized),
      signal: AbortSignal.timeout(5_000),
      keepalive: true,
    });
  } catch {
    // The bounded local trace remains available when diagnostic delivery is unavailable.
  }
}

function bufferDiagnostic(event: RegionalRouteDiagnosticEvent): void {
  try {
    const current = readRegionalRouteDiagnostics();
    window.sessionStorage.setItem(storageKey, JSON.stringify([
      ...current, { ...event, recordedAt: Date.now() },
    ].slice(-maxBufferedEvents)));
  } catch {
    // Diagnostics must never affect classroom entry or media.
  }
}
