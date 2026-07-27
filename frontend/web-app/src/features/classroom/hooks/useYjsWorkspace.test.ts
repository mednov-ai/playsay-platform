import { describe, expect, it } from "vitest";
import { ApiError } from "../../../shared/api/playsay";
import { isInvalidCollaborationDocumentError } from "./useYjsWorkspace";

describe("isInvalidCollaborationDocumentError", () => {
  it("treats missing and retired documents as terminal for the current socket", () => {
    expect(isInvalidCollaborationDocumentError(new ApiError(404, "NOT_FOUND", "missing"))).toBe(true);
    expect(isInvalidCollaborationDocumentError(new ApiError(410, "GONE", "retired"))).toBe(true);
  });

  it("keeps transient failures on the reconnect path", () => {
    expect(isInvalidCollaborationDocumentError(new ApiError(503, "UNAVAILABLE", "retry"))).toBe(false);
    expect(isInvalidCollaborationDocumentError(new Error("network"))).toBe(false);
  });
});
