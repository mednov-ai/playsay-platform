import type { ExternalActivityInputResultCode } from "./externalActivityProtocol";

export type ExternalActivityDiagnosticTransport = "local" | "fast-lane" | "livekit";
export type ExternalActivityDiagnosticStage = "created" | "transport" | "host" | "extension" | "dispatch" | "acknowledgement" | "fallback";

export type ExternalActivityFailureRecord = {
  correlationId: string;
  result: ExternalActivityInputResultCode;
  stage: ExternalActivityDiagnosticStage;
  timestamp: string;
  transport: ExternalActivityDiagnosticTransport;
};

const storageKey = "playsay.external-activity.diagnostics.v1";
const maximumFailures = 50;

export function createExternalActivityDiagnostics(storage: Pick<Storage, "getItem" | "setItem"> | null = safeSessionStorage()) {
  let failures = readFailures(storage);
  const successes = new Map<string, number>();

  return {
    failures: () => [...failures],
    recordFailure(record: ExternalActivityFailureRecord) {
      failures = [...failures, sanitizeFailure(record)].slice(-maximumFailures);
      storage?.setItem(storageKey, JSON.stringify(failures));
    },
    recordSuccess(stage: ExternalActivityDiagnosticStage, transport: ExternalActivityDiagnosticTransport) {
      const key = `${stage}:${transport}`;
      successes.set(key, (successes.get(key) ?? 0) + 1);
    },
    exportJson() {
      return JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        successCounts: Object.fromEntries(successes),
        failures,
      }, null, 2);
    },
  };
}

function readFailures(storage: Pick<Storage, "getItem"> | null): ExternalActivityFailureRecord[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validFailure).map(sanitizeFailure).slice(-maximumFailures);
  } catch {
    return [];
  }
}

function validFailure(value: unknown): value is ExternalActivityFailureRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ExternalActivityFailureRecord>;
  return typeof record.timestamp === "string"
    && typeof record.correlationId === "string"
    && ["local", "fast-lane", "livekit"].includes(record.transport ?? "")
    && ["created", "transport", "host", "extension", "dispatch", "acknowledgement", "fallback"].includes(record.stage ?? "")
    && ["BRIDGE_UNAVAILABLE", "STALE_SESSION", "INPUT_DISABLED", "TARGET_UNAVAILABLE", "VIEWPORT_STALE", "DEBUGGER_FAILED", "ACK_TIMEOUT"].includes(record.result ?? "");
}

function sanitizeFailure(record: ExternalActivityFailureRecord): ExternalActivityFailureRecord {
  return {
    timestamp: String(record.timestamp).slice(0, 32),
    correlationId: String(record.correlationId).slice(0, 160),
    transport: record.transport,
    stage: record.stage,
    result: record.result,
  };
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
