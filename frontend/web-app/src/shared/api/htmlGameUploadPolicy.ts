import { i18n } from "../i18n";
import { ApiError } from "./errors";

export const HTML_GAME_MAX_MEBIBYTES = 20;
export const HTML_GAME_MAX_BYTES = HTML_GAME_MAX_MEBIBYTES * 1024 * 1024;

export function validateHtmlGameUpload(file: File): void {
  if (file.size > HTML_GAME_MAX_BYTES) {
    throw new ApiError(
      413,
      "MATERIAL_HTML_GAME_TOO_LARGE",
      i18n.t("materials.htmlGameUpload.tooLarge", { max: HTML_GAME_MAX_MEBIBYTES }),
    );
  }
}

export function htmlGameUploadErrorMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.status === 413 || caught.errorCode === "MATERIAL_HTML_GAME_TOO_LARGE") {
      return i18n.t("materials.htmlGameUpload.tooLarge", { max: HTML_GAME_MAX_MEBIBYTES });
    }
    if (caught.status === 0 || caught.errorCode === "NETWORK_ERROR") {
      return i18n.t("materials.htmlGameUpload.networkError");
    }
    if (caught.errorCode === "MATERIAL_HTML_GAME_IMAGE_INVALID") {
      return i18n.t("materials.htmlGameUpload.imageInvalid");
    }
    if (caught.errorCode === "MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE") {
      return i18n.t("materials.htmlGameUpload.optimizationUnavailable");
    }
    if (caught.errorCode.startsWith("MATERIAL_HTML_GAME_") && caught.message.trim()) {
      return caught.message;
    }
  }
  return i18n.t("materials.htmlGameUpload.failed");
}
