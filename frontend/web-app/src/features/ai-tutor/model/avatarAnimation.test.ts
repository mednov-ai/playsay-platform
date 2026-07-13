import { describe, expect, it } from "vitest";
import { avatarAnimationManifest, markAvatarLayerBroken, mouthFrameForLevel, nextBlinkDelay, voiceLevelForTimeDomainSignal } from "./avatarAnimation";

describe("AI tutor avatar animation", () => {
  it("maps each known persona to its own feathered layers", () => {
    expect(Object.keys(avatarAnimationManifest)).toEqual(["maya", "leo", "nova"]);
    expect(avatarAnimationManifest.nova.mouthWide).toBe("/avatars/animated/nova/mouth-wide.webp");
    expect(avatarAnimationManifest.maya.eyes.width).toBeGreaterThan(0);
  });

  it("uses hysteresis when mapping signal levels to mouth frames", () => {
    expect(mouthFrameForLevel(0.09, "neutral")).toBe("neutral");
    expect(mouthFrameForLevel(0.2, "neutral")).toBe("small");
    expect(mouthFrameForLevel(0.08, "small")).toBe("small");
    expect(mouthFrameForLevel(0.4, "small")).toBe("open");
    expect(mouthFrameForLevel(0.7, "open")).toBe("wide");
    expect(mouthFrameForLevel(0.55, "wide")).toBe("wide");
    expect(mouthFrameForLevel(0.4, "wide")).toBe("open");
  });

  it("normalizes quiet and strong remote-audio samples", () => {
    expect(voiceLevelForTimeDomainSignal(new Uint8Array(64).fill(128))).toBe(0);
    expect(voiceLevelForTimeDomainSignal(new Uint8Array([64, 192, 64, 192]))).toBeGreaterThan(0.9);
  });

  it("hides a failed optional layer so the base portrait remains visible", () => {
    const layer = { hidden: false };
    markAvatarLayerBroken(layer);
    expect(layer.hidden).toBe(true);
  });

  it("schedules blinks between 4.5 and 8.5 seconds", () => {
    expect(nextBlinkDelay(0)).toBe(4_500);
    expect(nextBlinkDelay(0.5)).toBe(6_500);
    expect(nextBlinkDelay(1)).toBe(8_500);
  });
});
