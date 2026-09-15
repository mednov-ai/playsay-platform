import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "../i18n";
import { ApiError } from "./errors";
import {
  HTML_GAME_MAX_BYTES,
  htmlGameUploadErrorMessage,
  validateHtmlGameUpload,
} from "./htmlGameUploadPolicy";

describe("HTML game upload policy", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("accepts the exact 20 MiB boundary and rejects one byte over before upload", () => {
    expect(() => validateHtmlGameUpload({ size: HTML_GAME_MAX_BYTES } as File)).not.toThrow();
    expect(() => validateHtmlGameUpload({ size: HTML_GAME_MAX_BYTES + 1 } as File)).toThrowError(
      expect.objectContaining({ errorCode: "MATERIAL_HTML_GAME_TOO_LARGE", status: 413 }),
    );
  });

  it("normalizes structured and proxy-style 413 responses to recovery guidance", () => {
    const structured = new ApiError(413, "MATERIAL_HTML_GAME_TOO_LARGE", "backend message");
    const proxy = new ApiError(413, "HTTP_ERROR", "Request failed with HTTP 413");

    expect(htmlGameUploadErrorMessage(structured)).toContain("20 MB");
    expect(htmlGameUploadErrorMessage(proxy)).toContain("20 MB");
  });

  it("keeps safe backend validation and normalizes network and unknown failures", () => {
    expect(htmlGameUploadErrorMessage(new ApiError(400, "MATERIAL_HTML_GAME_UNSAFE", "Unsafe HTML"))).toBe("Unsafe HTML");
    expect(htmlGameUploadErrorMessage(new ApiError(0, "NETWORK_ERROR", "raw"))).toContain("connection");
    expect(htmlGameUploadErrorMessage(new Error("HTTP 500"))).not.toContain("HTTP 500");
  });

  it("maps image optimization failures to stable retry guidance", () => {
    expect(htmlGameUploadErrorMessage(new ApiError(422, "MATERIAL_HTML_GAME_IMAGE_INVALID", "internal")))
      .toContain("image");
    expect(htmlGameUploadErrorMessage(new ApiError(503, "MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE", "internal")))
      .toContain("current material was kept");
  });

  it("has equivalent recovery copy in every supported locale", async () => {
    for (const language of ["ru", "en", "de", "fr"]) {
      await i18n.changeLanguage(language);
      expect(i18n.t("materials.htmlGameUpload.tooLarge", { max: 20 })).toContain("20");
      expect(i18n.t("materials.htmlGameUpload.networkError")).not.toBe("materials.htmlGameUpload.networkError");
      expect(i18n.t("materials.htmlGameUpload.imageInvalid")).not.toBe("materials.htmlGameUpload.imageInvalid");
      expect(i18n.t("materials.htmlGameUpload.optimizationUnavailable")).not.toBe("materials.htmlGameUpload.optimizationUnavailable");
      expect(i18n.t("materials.draft.externalActivityGuidance")).not.toBe("materials.draft.externalActivityGuidance");
      expect(i18n.t("materials.blockEditor.externalActivitySaveOrValidationFailed")).not.toBe("materials.blockEditor.externalActivitySaveOrValidationFailed");
    }
  });
});
