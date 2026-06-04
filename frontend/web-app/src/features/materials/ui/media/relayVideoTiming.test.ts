import { describe, expect, it } from "vitest";
import {
  absoluteTimeForRelayClip,
  displayTimeForRelayClip,
  normalizeRelayVideoClip,
  relayClipDuration,
} from "./relayVideoTiming";

describe("relay video clip timing", () => {
  it("maps absolute media time to clip-relative playback time", () => {
    const clip = normalizeRelayVideoClip({ startSeconds: 12, endSeconds: 45 });

    expect(displayTimeForRelayClip(clip, 10)).toBe(0);
    expect(displayTimeForRelayClip(clip, 12)).toBe(0);
    expect(displayTimeForRelayClip(clip, 20.4)).toBeCloseTo(8.4);
    expect(displayTimeForRelayClip(clip, 50)).toBe(33);
  });

  it("maps learner seek time back to the absolute source timeline", () => {
    const clip = normalizeRelayVideoClip({ startSeconds: 12, endSeconds: 45 });

    expect(absoluteTimeForRelayClip(clip, -3)).toBe(12);
    expect(absoluteTimeForRelayClip(clip, 8)).toBe(20);
    expect(absoluteTimeForRelayClip(clip, 40)).toBe(45);
  });

  it("uses the selected segment duration instead of the full video duration", () => {
    const clip = normalizeRelayVideoClip({ startSeconds: 12, endSeconds: 45 });

    expect(relayClipDuration(clip, 120)).toBe(33);
    expect(relayClipDuration(normalizeRelayVideoClip({ startSeconds: 12 }), 120)).toBe(108);
    expect(relayClipDuration(normalizeRelayVideoClip(undefined), 120)).toBe(120);
  });
});
