import { normalizeMaterialVideoClip, type MaterialVideoClip } from "../../model/materialDocument";

export type RelayVideoClip = {
  startSeconds: number;
  endSeconds?: number;
};

export function normalizeRelayVideoClip(value: MaterialVideoClip | undefined): RelayVideoClip | undefined {
  const clip = normalizeMaterialVideoClip(value);
  if (!clip) {
    return undefined;
  }
  return {
    startSeconds: clip.startSeconds ?? 0,
    endSeconds: clip.endSeconds,
  };
}

export function displayTimeForRelayClip(clip: RelayVideoClip | undefined, absoluteTime: number): number {
  const start = clip?.startSeconds ?? 0;
  const duration = clip?.endSeconds !== undefined ? clip.endSeconds - start : null;
  const relativeTime = Math.max(0, absoluteTime - start);
  return duration !== null ? Math.min(relativeTime, duration) : relativeTime;
}

export function absoluteTimeForRelayClip(clip: RelayVideoClip | undefined, displayTime: number): number {
  const start = clip?.startSeconds ?? 0;
  const duration = clip?.endSeconds !== undefined ? clip.endSeconds - start : null;
  const safeDisplayTime = Number.isFinite(displayTime) ? Math.max(0, displayTime) : 0;
  const relativeTime = duration !== null ? Math.min(safeDisplayTime, duration) : safeDisplayTime;
  return start + relativeTime;
}

export function relayClipDuration(clip: RelayVideoClip | undefined, nativeDuration: number): number {
  const safeDuration = Number.isFinite(nativeDuration) && nativeDuration > 0 ? nativeDuration : 0;
  if (!clip) {
    return safeDuration;
  }
  if (clip.endSeconds !== undefined) {
    return Math.max(0, clip.endSeconds - clip.startSeconds);
  }
  return Math.max(0, safeDuration - clip.startSeconds);
}

export function relayClipEndReached(clip: RelayVideoClip | undefined, absoluteTime: number): boolean {
  return clip?.endSeconds !== undefined && absoluteTime >= clip.endSeconds;
}
