export type CollaborationScope = "INDIVIDUAL" | "GROUP";

export interface CollaborationClaims {
  subject: string;
  documentId: string;
  lessonId: string;
  materialId: string;
  studentUserId?: string;
  documentKind: string;
  scope: CollaborationScope;
  yjsDocumentId: string;
}

export function collaborationRoomName(claims: CollaborationClaims): string {
  if (claims.scope === "GROUP") {
    return `lesson:${claims.lessonId}:material:${claims.materialId}:group:kind:${claims.documentKind}`;
  }

  if (!claims.studentUserId) {
    throw new Error("studentUserId is required for individual collaboration rooms");
  }

  return `lesson:${claims.lessonId}:material:${claims.materialId}:student:${claims.studentUserId}:kind:${claims.documentKind}`;
}

export function assertRoomMatchesClaims(roomName: string, claims: CollaborationClaims): void {
  if (roomName !== collaborationRoomName(claims)) {
    throw new Error("websocket room does not match token claims");
  }
}

export function validateCollaborationClaims(payload: Record<string, unknown>): CollaborationClaims {
  const subject = requiredString(payload, "sub");
  const documentId = requiredString(payload, "documentId");
  const lessonId = requiredString(payload, "lessonId");
  const materialId = requiredString(payload, "materialId");
  const documentKind = requiredString(payload, "documentKind");
  const scope = requiredScope(payload);
  const yjsDocumentId = requiredString(payload, "yjsDocumentId");
  const studentUserId = optionalString(payload, "studentUserId");
  const claims: CollaborationClaims = {
    subject,
    documentId,
    lessonId,
    materialId,
    studentUserId,
    documentKind,
    scope,
    yjsDocumentId,
  };

  assertRoomMatchesClaims(yjsDocumentId, claims);
  return claims;
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing ${key}`);
  }
  return value.trim();
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`invalid ${key}`);
  }
  return value.trim();
}

function requiredScope(payload: Record<string, unknown>): CollaborationScope {
  const scope = requiredString(payload, "scope");
  if (scope !== "INDIVIDUAL" && scope !== "GROUP") {
    throw new Error("invalid scope");
  }
  return scope;
}
