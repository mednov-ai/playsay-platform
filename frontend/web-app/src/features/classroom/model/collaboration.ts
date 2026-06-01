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
  scope: string;
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

function cleanDocumentKind(value: string | null | undefined): string {
  return value?.trim().toUpperCase() || "MATERIAL_WORK";
}
