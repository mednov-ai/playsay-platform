import type { MaterialVideoMeta } from "./types";

export function normalizeMaterialVideoMeta(value: unknown): MaterialVideoMeta | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const durationSeconds = typeof source.durationSeconds === "number"
    && Number.isInteger(source.durationSeconds)
    && source.durationSeconds > 0
    && source.durationSeconds <= 2_147_483_647
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
    ...(typeof source.sourceUrl === "string" ? { sourceUrl: source.sourceUrl } : {}),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(language ? { language } : {}),
    ...(validationStatus ? { validationStatus } : {}),
  };
}

/** Full video duration; clip parsing intentionally has different rounding semantics. */
export function parseMaterialVideoDuration(value: string): number | undefined {
  const source = value.trim();
  if (!/^\d+(?::[0-5]\d){0,2}$/.test(source)) return undefined;
  const seconds = source.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isInteger(seconds) && seconds > 0 && seconds <= 2_147_483_647 ? seconds : undefined;
}
