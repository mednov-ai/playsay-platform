import { describe, expect, it } from "vitest";
import { avatarAnimationManifest, BLINK_DURATION_MS, createAvatarBlinkScheduler, markAvatarLayerBroken, mouthFrameForLevel, nextBlinkDelay, voiceLevelForTimeDomainSignal } from "./avatarAnimation";

describe("AI tutor avatar animation", () => {
  it("maps each known persona to its own feathered layers", () => {
    expect(Object.keys(avatarAnimationManifest)).toEqual(["maya", "leo", "nova"]);
    expect(avatarAnimationManifest.maya.blinkHalf).toBe("/avatars/animated/maya/blink-half.webp");
    expect(avatarAnimationManifest.leo.blinkClosed).toBe("/avatars/animated/leo/blink.webp");
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

  it("keeps the complete three-frame blink active for 160ms and clears its timers", () => {
    let nextTimerId = 1;
    const timers = new Map<number, { callback: () => void; delay: number }>();
    const changes: boolean[] = [];
    const runTimer = (timerId: number) => {
      const timer = timers.get(timerId);
      timers.delete(timerId);
      timer?.callback();
    };
    const scheduler = createAvatarBlinkScheduler({
      clearTimeout: (timerId) => timers.delete(timerId),
      isHidden: () => false,
      onBlinkingChange: (blinking) => changes.push(blinking),
      random: () => 0,
      setTimeout: (callback, delay) => {
        const timerId = nextTimerId++;
        timers.set(timerId, { callback, delay });
        return timerId;
      },
    });

    expect([...timers.values()].map(({ delay }) => delay)).toEqual([4_500]);
    runTimer(1);
    expect(changes).toEqual([true]);
    expect(timers.get(2)?.delay).toBe(BLINK_DURATION_MS);
    runTimer(2);
    expect(changes).toEqual([true, false]);
    expect(timers.get(3)?.delay).toBe(4_500);

    scheduler.stop();
    expect(timers.size).toBe(0);
  });

  it("pauses blink scheduling while the page is hidden", () => {
    let hidden = false;
    let nextTimerId = 1;
    const timers = new Map<number, () => void>();
    const scheduler = createAvatarBlinkScheduler({
      clearTimeout: (timerId) => timers.delete(timerId),
      isHidden: () => hidden,
      onBlinkingChange: () => undefined,
      random: () => 1,
      setTimeout: (callback) => {
        const timerId = nextTimerId++;
        timers.set(timerId, callback);
        return timerId;
      },
    });

    expect(timers.size).toBe(1);
    hidden = true;
    scheduler.reset();
    expect(timers.size).toBe(0);
    hidden = false;
    scheduler.reset();
    expect(timers.size).toBe(1);
    scheduler.stop();
  });
});
