export type CollaborationDocumentScope = "INDIVIDUAL" | "GROUP";
export type CollaborationWorkspaceMode = "individual" | "group";

export type CollaborationRoomKeyInput = {
  documentKind?: string | null;
  lessonId: string;
  materialId: string;
  scope: CollaborationDocumentScope;
  studentUserId?: string | null;
};

export type CollaborationDocumentLike = {
  studentName?: string | null;
  studentSubject?: string | null;
  scope: string;
  updatedAt?: string | null;
  version?: number | null;
};

export function collaborationRoomKey(input: CollaborationRoomKeyInput): string {
  const documentKind = cleanDocumentKind(input.documentKind);
  if (input.scope === "GROUP") {
    return `lesson:${input.lessonId}:material:${input.materialId}:group:kind:${documentKind}`;
  }

  const studentUserId = input.studentUserId?.trim();
  if (!studentUserId) {
    throw new Error("studentUserId is required for individual collaboration rooms");
  }
  return `lesson:${input.lessonId}:material:${input.materialId}:student:${studentUserId}:kind:${documentKind}`;
}

export function collaborationScopeForMode(mode: CollaborationWorkspaceMode): CollaborationDocumentScope {
  return mode === "group" ? "GROUP" : "INDIVIDUAL";
}

export function canFinalizeCollaborationMode(mode: CollaborationWorkspaceMode): boolean {
  return mode === "individual";
}

export function isGroupCollaborationDocument(document: CollaborationDocumentLike): boolean {
  return document.scope === "GROUP";
}

export function formatCollaborationUpdatedAt(value: Date | number | string | null | undefined, locale: string): string {
  if (value == null || value === "") {
    return "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function collaborationParticipantColor(seed: string | null | undefined): string {
  const colors = ["#ff5c00", "#00a878", "#2574ff", "#b547ff", "#e04f7a", "#0e9384"];
  const value = seed?.trim() || "playsay";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return colors[hash % colors.length];
}

export function collaborationDocumentDisplayName(document: CollaborationDocumentLike, fallback: string): string {
  const value = document.studentName?.trim() || document.studentSubject?.trim();
  return value || fallback;
}

export function collaborationDocumentStatus(document: CollaborationDocumentLike): "empty" | "saved" {
  return (document.version ?? 0) > 0 ? "saved" : "empty";
}

function cleanDocumentKind(value: string | null | undefined): string {
  return value?.trim().toUpperCase() || "MATERIAL_WORK";
}
