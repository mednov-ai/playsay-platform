import type { MaterialVideoClip } from "./types";
import { asJsonObject, asNumber } from "./formatters";

export function normalizeMaterialVideoClip(value: unknown): MaterialVideoClip | undefined {
  const source = asJsonObject(value);
  const startSeconds = normalizeVideoClipSecond(source.startSeconds ?? source.start);
  const endSeconds = normalizeVideoClipSecond(source.endSeconds ?? source.end);
  const start = startSeconds ?? 0;

  if (endSeconds !== undefined && endSeconds <= start) {
    return undefined;
  }

  const clip: MaterialVideoClip = {};
  if (startSeconds !== undefined && startSeconds > 0) {
    clip.startSeconds = startSeconds;
  }
  if (endSeconds !== undefined && endSeconds > 0) {
    clip.endSeconds = endSeconds;
  }

  return clip.startSeconds !== undefined || clip.endSeconds !== undefined ? clip : undefined;
}

export function parseMaterialVideoClipTime(value: string): number | undefined {
  const cleanValue = value.trim().replace(",", ".");
  if (!cleanValue) {
    return undefined;
  }

  if (/^\d+(?:\.\d+)?$/.test(cleanValue)) {
    return Math.floor(Number(cleanValue));
  }

  const parts = cleanValue.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return undefined;
  }

  const numbers = parts.map(Number);
  if (numbers.length === 2) {
    return (numbers[0] * 60) + numbers[1];
  }

  return (numbers[0] * 3600) + (numbers[1] * 60) + numbers[2];
}

export function formatMaterialVideoClipTime(value?: number): string {
  const seconds = normalizeVideoClipSecond(value);
  if (seconds === undefined) {
    return "";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function normalizeVideoClipSecond(value: unknown): number | undefined {
  const parsed = asNumber(value);
  if (parsed === null || parsed < 0) {
    return undefined;
  }
  return Math.floor(parsed);
}
