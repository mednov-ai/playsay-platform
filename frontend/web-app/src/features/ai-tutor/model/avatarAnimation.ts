export type AvatarActivity = "idle" | "listening" | "thinking" | "speaking";
export type MouthFrame = "neutral" | "small" | "open" | "wide";

type AvatarFeatureBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type AvatarAnimationAssets = {
  blink: string;
  eyes: AvatarFeatureBox;
  mouth: AvatarFeatureBox;
  mouthOpen: string;
  mouthSmall: string;
  mouthWide: string;
};

export const avatarAnimationManifest: Readonly<Record<string, AvatarAnimationAssets>> = {
  maya: {
    blink: "/avatars/animated/maya/blink.webp",
    eyes: { x: 405, y: 285, width: 270, height: 125 },
    mouth: { x: 435, y: 410, width: 215, height: 145 },
    mouthSmall: "/avatars/animated/maya/mouth-small.webp",
    mouthOpen: "/avatars/animated/maya/mouth-open.webp",
    mouthWide: "/avatars/animated/maya/mouth-wide.webp",
  },
  leo: {
    blink: "/avatars/animated/leo/blink.webp",
    eyes: { x: 390, y: 280, width: 270, height: 110 },
    mouth: { x: 430, y: 405, width: 190, height: 140 },
    mouthSmall: "/avatars/animated/leo/mouth-small.webp",
    mouthOpen: "/avatars/animated/leo/mouth-open.webp",
    mouthWide: "/avatars/animated/leo/mouth-wide.webp",
  },
  nova: {
    blink: "/avatars/animated/nova/blink.webp",
    eyes: { x: 380, y: 315, width: 325, height: 130 },
    mouth: { x: 440, y: 440, width: 220, height: 150 },
    mouthSmall: "/avatars/animated/nova/mouth-small.webp",
    mouthOpen: "/avatars/animated/nova/mouth-open.webp",
    mouthWide: "/avatars/animated/nova/mouth-wide.webp",
  },
};

export function nextBlinkDelay(randomValue = Math.random()): number {
  return 4_500 + Math.max(0, Math.min(1, randomValue)) * 4_000;
}

export function markAvatarLayerBroken(layer: { hidden: boolean }): void {
  layer.hidden = true;
}

export function voiceLevelForTimeDomainSignal(signal: Uint8Array): number {
  if (signal.length === 0) return 0;
  let sumSquares = 0;
  for (const value of signal) {
    const sampleValue = (value - 128) / 128;
    sumSquares += sampleValue * sampleValue;
  }
  const rms = Math.sqrt(sumSquares / signal.length);
  return Math.max(0, Math.min(1, (rms - 0.008) / 0.16));
}

export function mouthFrameForLevel(level: number, previous: MouthFrame): MouthFrame {
  const normalized = Math.max(0, Math.min(1, level));

  switch (previous) {
    case "neutral":
      return normalized > 0.1 ? "small" : "neutral";
    case "small":
      if (normalized < 0.06) return "neutral";
      return normalized > 0.32 ? "open" : "small";
    case "open":
      if (normalized < 0.24) return "small";
      return normalized > 0.62 ? "wide" : "open";
    case "wide":
      return normalized < 0.5 ? "open" : "wide";
  }
}
