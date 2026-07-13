import { useEffect, useRef, useState } from "react";
import type { TutorPersona } from "../../../shared/api/aiTutor";
import {
  avatarAnimationManifest,
  createAvatarBlinkScheduler,
  markAvatarLayerBroken,
  mouthFrameForLevel,
  voiceLevelForTimeDomainSignal,
  type AvatarActivity,
  type MouthFrame,
} from "../model/avatarAnimation";

type TutorPortraitProps = {
  className?: string;
  imageClassName?: string;
  loading?: "eager" | "lazy";
  persona?: TutorPersona;
  testId?: string;
};

export function TutorPortrait({ className, imageClassName, loading = "lazy", persona, testId }: TutorPortraitProps) {
  const [failedAsset, setFailedAsset] = useState<string | null>(null);
  const avatarAsset = persona?.avatarAsset;
  const canShowImage = Boolean(avatarAsset) && failedAsset !== avatarAsset;
  const initial = persona?.name.trim().charAt(0).toUpperCase() ?? "";

  return (
    <span className={className} data-avatar-fallback={!canShowImage}>
      {canShowImage ? (
        <img
          alt=""
          className={imageClassName}
          data-testid={testId}
          decoding="async"
          loading={loading}
          onError={() => setFailedAsset(avatarAsset ?? null)}
          src={avatarAsset}
        />
      ) : (
        <span aria-hidden="true" className="grid h-full w-full place-items-center bg-gradient-to-br from-orange-100 via-amber-50 to-emerald-100 text-lg font-black text-primary dark:from-orange-950 dark:via-zinc-900 dark:to-emerald-950">
          {initial}
        </span>
      )}
    </span>
  );
}

export function AiTutorAvatarStage({ activity, audioContext, audioStream, persona }: {
  activity: AvatarActivity;
  audioContext?: AudioContext | null;
  audioStream: MediaStream | null;
  persona?: TutorPersona;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPreference();
  const animationAssets = persona ? avatarAnimationManifest[persona.id] : undefined;
  const blinking = useBlinkScheduler(Boolean(animationAssets), reducedMotion);

  useAudioReactiveMouth({
    activity,
    audioContext,
    audioStream,
    enabled: Boolean(animationAssets),
    reducedMotion,
    stageRef,
  });

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-[#fff5e9] dark:bg-[#21160f]"
      data-activity={activity}
      data-blinking={blinking}
      data-persona-id={persona?.id ?? ""}
      data-reduced-motion={reducedMotion}
      data-speaking={activity === "speaking"}
      data-testid="ai-tutor-avatar-stage"
      ref={stageRef}
    >
      <div className="playsay-ai-avatar-portrait absolute inset-0" key={persona?.avatarAsset ?? "fallback"}>
        <TutorPortrait
          className="block h-full w-full"
          imageClassName="h-full w-full object-cover object-center"
          loading="eager"
          persona={persona}
          testId="ai-tutor-avatar-image"
        />
        {animationAssets && !reducedMotion ? (
          <>
            <AvatarLayer asset={animationAssets.blinkHalf} kind="blink-half" />
            <AvatarLayer asset={animationAssets.blinkClosed} kind="blink-closed" />
            <AvatarLayer asset={animationAssets.mouthSmall} kind="mouth-small" />
            <AvatarLayer asset={animationAssets.mouthOpen} kind="mouth-open" />
            <AvatarLayer asset={animationAssets.mouthWide} kind="mouth-wide" />
          </>
        ) : null}
      </div>
      <span className="playsay-ai-avatar-glow pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_42%,rgba(255,92,0,.22)_100%)]" />
    </div>
  );
}

function AvatarLayer({ asset, kind }: { asset: string; kind: "blink-half" | "blink-closed" | "mouth-small" | "mouth-open" | "mouth-wide" }) {
  return (
    <img
      alt=""
      className="playsay-ai-avatar-layer"
      data-avatar-layer={kind}
      decoding="async"
      draggable={false}
      loading="eager"
      onError={(event) => markAvatarLayerBroken(event.currentTarget)}
      src={asset}
    />
  );
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

function useBlinkScheduler(enabled: boolean, reducedMotion: boolean) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (!enabled || reducedMotion) {
      setBlinking(false);
      return;
    }

    const scheduler = createAvatarBlinkScheduler({
      clearTimeout: (timerId) => window.clearTimeout(timerId),
      isHidden: () => document.visibilityState === "hidden",
      onBlinkingChange: setBlinking,
      setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    });
    const handleVisibilityChange = () => {
      scheduler.reset();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      scheduler.stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, reducedMotion]);

  return blinking;
}

function useAudioReactiveMouth({ activity, audioContext, audioStream, enabled, reducedMotion, stageRef }: {
  activity: AvatarActivity;
  audioContext?: AudioContext | null;
  audioStream: MediaStream | null;
  enabled: boolean;
  reducedMotion: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.dataset.mouthFrame = "neutral";
    if (!enabled || reducedMotion || activity !== "speaking" || !audioStream || (!audioContext && typeof AudioContext === "undefined")) return;

    let activeAudioContext: AudioContext | null = null;
    let ownsAudioContext = false;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    try {
      activeAudioContext = audioContext && audioContext.state !== "closed" ? audioContext : new AudioContext();
      ownsAudioContext = activeAudioContext !== audioContext;
      analyser = activeAudioContext.createAnalyser();
      source = activeAudioContext.createMediaStreamSource(audioStream);
      source.connect(analyser);
    } catch {
      if (ownsAudioContext && activeAudioContext) void activeAudioContext.close().catch(() => undefined);
      return;
    }
    const signal = new Uint8Array(analyser.fftSize = 256);
    analyser.smoothingTimeConstant = 0.2;

    let animationFrame = 0;
    let lastSampleAt = 0;
    let smoothedLevel = 0;
    let mouthFrame: MouthFrame = "neutral";

    const sample = (timestamp: number) => {
      if (timestamp - lastSampleAt >= 1_000 / 12) {
        analyser.getByteTimeDomainData(signal);
        const level = voiceLevelForTimeDomainSignal(signal);
        const smoothing = level > smoothedLevel ? 0.55 : 0.28;
        smoothedLevel += (level - smoothedLevel) * smoothing;
        const nextFrame = mouthFrameForLevel(smoothedLevel, mouthFrame);
        if (nextFrame !== mouthFrame) {
          mouthFrame = nextFrame;
          stage.dataset.mouthFrame = nextFrame;
        }
        lastSampleAt = timestamp;
      }
      animationFrame = window.requestAnimationFrame(sample);
    };
    const start = () => {
      if (document.visibilityState === "hidden") return;
      void activeAudioContext.resume().catch(() => undefined);
      animationFrame = window.requestAnimationFrame(sample);
    };
    const handleVisibilityChange = () => {
      window.cancelAnimationFrame(animationFrame);
      stage.dataset.mouthFrame = "neutral";
      mouthFrame = "neutral";
      if (document.visibilityState === "hidden") {
        void activeAudioContext.suspend().catch(() => undefined);
      } else {
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.cancelAnimationFrame(animationFrame);
      source.disconnect();
      analyser.disconnect();
      stage.dataset.mouthFrame = "neutral";
      if (ownsAudioContext) void activeAudioContext.close().catch(() => undefined);
    };
  }, [activity, audioContext, audioStream, enabled, reducedMotion, stageRef]);
}
