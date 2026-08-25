import type { MaterialEditorBlock } from "../../materials/model/materialDocument";

export const externalActivityInputTopic = "playsay.external-activity.input.v1";
export const externalActivityCursorTopic = "playsay.external-activity.cursor.v1";
export const externalActivityHostTopic = "playsay.external-activity.host.v1";
export const externalActivityTrackPrefix = "playsay-external-activity-";
export const externalActivityPageChannel = "playsay.external-activity.page.v1";
export const externalActivityExtensionChannel = "playsay.external-activity.extension.v1";

export type ExternalActivityWirePhase = "REQUESTED" | "AWAITING_EXTENSION" | "STARTING" | "ACTIVE" | "ERROR";
export type ExternalActivityPhase = ExternalActivityWirePhase | "OPENING_PROVIDER" | "AWAITING_ACTION";
export type ExternalActivityErrorCode =
  | "FEATURE_UNAVAILABLE"
  | "EXTENSION_NOT_DETECTED"
  | "EXTENSION_UPDATE_REQUIRED"
  | "TARGET_TAB_CLOSED"
  | "CAPTURE_PERMISSION_DENIED"
  | "CAPTURE_NOT_SUPPORTED"
  | "CAPTURE_START_FAILED"
  | "EXTENSION_ERROR_UNKNOWN";
export type ExternalActivityInput =
  | { type: "pointer"; action: "move" | "down" | "up"; x: number; y: number; normalizedX?: number; normalizedY?: number; sourceWidth?: number; sourceHeight?: number; button?: "left" | "middle" | "right"; clickCount?: number }
  | { type: "scroll"; x: number; y: number; normalizedX?: number; normalizedY?: number; sourceWidth?: number; sourceHeight?: number; deltaX: number; deltaY: number }
  | { type: "key"; action: "down" | "up"; key: string; code?: string; text?: string; modifiers?: number };

export type ExternalActivityRealtimeMessage =
  | {
      blockId: string;
      eventId: string;
      input: ExternalActivityInput;
      kind: "external-input";
      sessionId: string;
    }
  | {
      blockId: string;
      color: string;
      identity: string;
      kind: "external-cursor";
      name: string;
      sessionId: string;
      x: number;
      y: number;
    };

export type ExternalActivityRealtime = {
  acquire: (onMessage: (message: ExternalActivityRealtimeMessage) => void) => () => void;
  close: () => void;
  publish: (message: ExternalActivityRealtimeMessage) => boolean;
};

export function externalActivityInputReliable(input: ExternalActivityInput): boolean {
  return input.type !== "pointer" || input.action !== "move";
}

export type ExternalActivityMessage = {
  version: 1;
  type: "REQUEST_OPEN" | "REQUEST_CLOSE" | "REQUEST_STATE" | "INPUT" | "CURSOR" | "HOST_STATE" | "HOST_IDLE" | "STOPPED" | "SET_LOCK" | "RELOAD" | "BACK";
  sessionId: string;
  blockId: string;
  eventId?: string;
  input?: ExternalActivityInput;
  cursor?: { x: number; y: number; name?: string; color?: string };
  phase?: ExternalActivityWirePhase;
  studentsLocked?: boolean;
  errorCode?: string;
  visible?: boolean;
};

export type ExternalActivityState = {
  blockId: string;
  sessionId: string;
  hostIdentity: string | null;
  phase: ExternalActivityPhase;
  studentsLocked: boolean;
  errorCode?: string;
  visible: boolean;
};

export type ExternalActivityBlock = MaterialEditorBlock & { type: "externalActivity"; url: string };

export function parseExternalActivityMessage(value: unknown): ExternalActivityMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Partial<ExternalActivityMessage>;
  const types = ["REQUEST_OPEN", "REQUEST_CLOSE", "REQUEST_STATE", "INPUT", "CURSOR", "HOST_STATE", "HOST_IDLE", "STOPPED", "SET_LOCK", "RELOAD", "BACK"];
  if (message.version !== 1 || !types.includes(message.type ?? "") || !safeToken(message.sessionId) || !safeToken(message.blockId)) return null;
  if (message.type === "INPUT" && !validInput(message.input)) return null;
  if (message.type === "INPUT" && !safeToken(message.eventId)) return null;
  if (message.type === "CURSOR" && !validCursor(message.cursor)) return null;
  if (message.type === "HOST_STATE" && !["REQUESTED", "AWAITING_EXTENSION", "STARTING", "ACTIVE", "ERROR"].includes(message.phase ?? "")) return null;
  return message as ExternalActivityMessage;
}

export function parseExtensionEvent(value: unknown, sessionId: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (
    event.version !== 1
    || event.sessionId !== sessionId
    || typeof event.type !== "string"
    || !["AWAITING_ACTION", "CAPTURE_READY", "TAB_CLOSED", "DEBUGGER_DETACHED", "ERROR", "STOPPED"].includes(event.type)
  ) return null;
  if (event.type === "CAPTURE_READY" && (typeof event.streamId !== "string" || !event.streamId)) return null;
  return event;
}

export const minimumTrustedInputExtensionVersion = "0.1.7";

export function extensionSupportsTrustedInput(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const candidate = value.match(/^(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  const minimum = minimumTrustedInputExtensionVersion.split(".").map(Number);
  if (!candidate || candidate.length !== minimum.length) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (candidate[index]! > minimum[index]!) return true;
    if (candidate[index]! < minimum[index]!) return false;
  }
  return true;
}

export function externalActivityParticipantPhase(phase: ExternalActivityPhase): ExternalActivityWirePhase {
  if (phase === "OPENING_PROVIDER" || phase === "AWAITING_ACTION") return "AWAITING_EXTENSION";
  return phase;
}

export function externalActivityTrackName(sessionId: string, kind: "video" | "audio"): string {
  return `${externalActivityTrackPrefix}${sessionId}-${kind}`;
}

export function externalActivitySessionIdFromTrackName(trackName: string | undefined): string | null {
  if (!trackName?.startsWith(externalActivityTrackPrefix)) return null;
  const match = trackName.match(/^playsay-external-activity-(.+)-(?:video|audio)$/);
  return match?.[1] && safeToken(match[1]) ? match[1] : null;
}

export function isCurrentExternalActivityCapture(
  generation: number,
  sessionId: string,
  currentGeneration: number,
  current: Pick<ExternalActivityState, "sessionId"> | null,
): boolean {
  return generation === currentGeneration && current?.sessionId === sessionId;
}

export function participantCanHostExternalActivity(
  metadata: string | undefined,
  participantIdentity?: string,
  trustedHostIdentity?: string | null,
): boolean {
  if (trustedHostIdentity && participantIdentity === trustedHostIdentity) return true;
  if (!metadata) return false;
  try {
    const role = (JSON.parse(metadata) as { playsayRole?: unknown }).playsayRole;
    return role === "TEACHER" || role === "ADMIN";
  } catch {
    return false;
  }
}

export function externalActivityCaptureErrorCode(error: unknown): ExternalActivityErrorCode {
  const name = error instanceof Error ? error.name : "UnknownError";
  if (name === "NotAllowedError" || name === "SecurityError") return "CAPTURE_PERMISSION_DENIED";
  if (name === "NotSupportedError") return "CAPTURE_NOT_SUPPORTED";
  return "CAPTURE_START_FAILED";
}

export function externalActivityExtensionErrorCode(
  eventType: unknown,
  rawError?: unknown,
): ExternalActivityErrorCode {
  if (eventType === "TAB_CLOSED") return "TARGET_TAB_CLOSED";
  const normalized = typeof rawError === "string" ? rawError.toLowerCase() : "";
  if (normalized.includes("notallowed") || normalized.includes("permission") || normalized.includes("denied")) {
    return "CAPTURE_PERMISSION_DENIED";
  }
  if (normalized.includes("notsupported") || normalized.includes("not supported") || normalized.includes("unsupported")) {
    return "CAPTURE_NOT_SUPPORTED";
  }
  if (eventType === "DEBUGGER_DETACHED") return "CAPTURE_START_FAILED";
  return "EXTENSION_ERROR_UNKNOWN";
}

export function externalActivityCaptureConstraints(streamId: string): MediaStreamConstraints {
  const mandatory = { chromeMediaSource: "tab", chromeMediaSourceId: streamId };
  return {
    audio: { mandatory } as unknown as MediaTrackConstraints,
    video: { mandatory } as unknown as MediaTrackConstraints,
  };
}

function validInput(input: ExternalActivityInput | undefined): input is ExternalActivityInput {
  if (!input || typeof input !== "object") return false;
  if (input.type === "pointer") return ["move", "down", "up"].includes(input.action) && coordinate(input.x) && coordinate(input.y);
  if (input.type === "scroll") return coordinate(input.x) && coordinate(input.y) && finite(input.deltaX) && finite(input.deltaY);
  return input.type === "key" && ["down", "up"].includes(input.action) && typeof input.key === "string" && input.key.length <= 64;
}

function validCursor(cursor: ExternalActivityMessage["cursor"]): boolean {
  return Boolean(cursor && coordinate(cursor.x) && coordinate(cursor.y) && cursor.x <= 1 && cursor.y <= 1);
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function coordinate(value: unknown): value is number {
  return finite(value) && value >= 0;
}
