import type { MaterialVideoMeta } from "./types";

export function normalizeMaterialVideoMeta(value: unknown): MaterialVideoMeta | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const durationSeconds = typeof source.durationSeconds === "number"
    && Number.isInteger(source.durationSeconds)
    && source.durationSeconds > 0
      ? source.durationSeconds
      : undefined;
  const language = typeof source.language === "string" ? source.language.trim().slice(0, 32) : "";
  const validationStatus = typeof source.validationStatus === "string"
    ? source.validationStatus.trim().slice(0, 64)
    : "";
  if (durationSeconds === undefined && !language) {
    return undefined;
  }
  return {
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(language ? { language } : {}),
    ...(validationStatus ? { validationStatus } : {}),
  };
}
