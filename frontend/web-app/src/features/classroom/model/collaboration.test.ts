import { describe, expect, it } from "vitest";
import {
  canFinalizeCollaborationMode,
  collaborationRoomKey,
  collaborationScopeForMode,
  collaborationDocumentDisplayName,
  collaborationDocumentStatus,
  collaborationParticipantColor,
  formatCollaborationUpdatedAt,
  isGroupCollaborationDocument,
} from "./collaboration";

describe("collaboration model", () => {
  it("builds individual and group Yjs room keys with the backend naming contract", () => {
    expect(
      collaborationRoomKey({
        lessonId: "lesson-1",
        materialId: "material-1",
        studentUserId: "student-1",
        documentKind: "material_work",
        scope: "INDIVIDUAL",
      }),
    ).toBe("lesson:lesson-1:material:material-1:student:student-1:kind:MATERIAL_WORK");

    expect(
      collaborationRoomKey({
        lessonId: "lesson-1",
        materialId: "material-1",
        studentUserId: "ignored",
        scope: "GROUP",
      }),
    ).toBe("lesson:lesson-1:material:material-1:group:kind:MATERIAL_WORK");
  });

  it("requires a student id for individual room keys", () => {
    expect(() =>
      collaborationRoomKey({
        lessonId: "lesson-1",
        materialId: "material-1",
        scope: "INDIVIDUAL",
      }),
    ).toThrow(/studentUserId/);
  });

  it("maps workspace modes to backend document scopes", () => {
    expect(collaborationScopeForMode("individual")).toBe("INDIVIDUAL");
    expect(collaborationScopeForMode("group")).toBe("GROUP");
  });

  it("allows finalize only for individual workspace mode", () => {
    expect(canFinalizeCollaborationMode("individual")).toBe(true);
    expect(canFinalizeCollaborationMode("group")).toBe(false);
  });

  it("detects group collaboration documents by scope", () => {
    expect(isGroupCollaborationDocument({ scope: "GROUP" })).toBe(true);
    expect(isGroupCollaborationDocument({ scope: "INDIVIDUAL" })).toBe(false);
  });

  it("formats updated timestamps through Intl and hides missing values", () => {
    const value = "2026-06-01T06:30:00.000Z";
    expect(formatCollaborationUpdatedAt(value, "en-US")).toBe(
      new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)),
    );
    expect(formatCollaborationUpdatedAt(null, "en-US")).toBe("");
    expect(formatCollaborationUpdatedAt("not-a-date", "en-US")).toBe("");
  });

  it("derives stable participant colors and document labels", () => {
    expect(collaborationParticipantColor("student-1")).toBe(collaborationParticipantColor("student-1"));
    expect(collaborationDocumentDisplayName({ scope: "INDIVIDUAL", studentName: "Alex" }, "Student")).toBe("Alex");
    expect(collaborationDocumentDisplayName({ scope: "INDIVIDUAL", studentSubject: "subject-1" }, "Student")).toBe("subject-1");
    expect(collaborationDocumentDisplayName({ scope: "INDIVIDUAL" }, "Student")).toBe("Student");
  });

  it("marks collaboration documents with saved versions as saved", () => {
    expect(collaborationDocumentStatus({ scope: "INDIVIDUAL", version: 0 })).toBe("empty");
    expect(collaborationDocumentStatus({ scope: "INDIVIDUAL", version: 2 })).toBe("saved");
  });
});
