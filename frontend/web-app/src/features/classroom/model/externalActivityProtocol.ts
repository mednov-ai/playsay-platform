import type { MaterialEditorBlock } from "../../materials/model/materialDocument";

export const externalActivityInputTopic = "playsay.external-activity.input.v1";
export const externalActivityCursorTopic = "playsay.external-activity.cursor.v1";
export const externalActivityHostTopic = "playsay.external-activity.host.v1";
export const externalActivityTrackPrefix = "playsay-external-activity-";
export const externalActivityPageChannel = "playsay.external-activity.page.v1";
export const externalActivityExtensionChannel = "playsay.external-activity.extension.v1";

export type ExternalActivityPhase = "REQUESTED" | "AWAITING_EXTENSION" | "STARTING" | "ACTIVE" | "ERROR";
export type ExternalActivityInput =
  | { type: "pointer"; action: "move" | "down" | "up"; x: number; y: number; button?: "left" | "middle" | "right"; clickCount?: number }
  | { type: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { type: "key"; action: "down" | "up"; key: string; code?: string; text?: string; modifiers?: number };

export type ExternalActivityMessage = {
  version: 1;
  type: "REQUEST_OPEN" | "REQUEST_CLOSE" | "INPUT" | "CURSOR" | "HOST_STATE" | "STOPPED" | "SET_LOCK" | "RELOAD" | "BACK";
  sessionId: string;
  blockId: string;
  eventId?: string;
  input?: ExternalActivityInput;
  cursor?: { x: number; y: number; name?: string; color?: string };
  phase?: ExternalActivityPhase;
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
  const types = ["REQUEST_OPEN", "REQUEST_CLOSE", "INPUT", "CURSOR", "HOST_STATE", "STOPPED", "SET_LOCK", "RELOAD", "BACK"];
  if (message.version !== 1 || !types.includes(message.type ?? "") || !safeToken(message.sessionId) || !safeToken(message.blockId)) return null;
  if (message.type === "INPUT" && !validInput(message.input)) return null;
  if (message.type === "CURSOR" && !validCursor(message.cursor)) return null;
  if (message.type === "HOST_STATE" && !["REQUESTED", "AWAITING_EXTENSION", "STARTING", "ACTIVE", "ERROR"].includes(message.phase ?? "")) return null;
  return message as ExternalActivityMessage;
}

export function parseExtensionEvent(value: unknown, sessionId: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (event.version !== 1 || event.sessionId !== sessionId || typeof event.type !== "string") return null;
  if (event.type === "CAPTURE_READY" && (typeof event.streamId !== "string" || !event.streamId)) return null;
  return event;
}

export function externalActivityTrackName(sessionId: string, kind: "video" | "audio"): string {
  return `${externalActivityTrackPrefix}${sessionId}-${kind}`;
}

export function participantCanHostExternalActivity(metadata: string | undefined): boolean {
  if (!metadata) return false;
  try {
    const role = (JSON.parse(metadata) as { playsayRole?: unknown }).playsayRole;
    return role === "TEACHER" || role === "ADMIN";
  } catch {
    return false;
  }
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
