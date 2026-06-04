import { Maximize2, Minimize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAppTranslation } from "../../../../shared/i18n";
import type { MaterialVideoClip } from "../../model/materialDocument";
import {
  absoluteTimeForRelayClip,
  displayTimeForRelayClip,
  normalizeRelayVideoClip,
  relayClipDuration,
  relayClipEndReached,
} from "./relayVideoTiming";

type PlaySayRelayVideoPlayerProps = {
  allowFullscreen?: boolean;
  clip?: MaterialVideoClip;
  onQualityChange?: (quality: MaterialVideoQuality, currentTimeSeconds: number) => void;
  quality?: MaterialVideoQuality;
  resumeAtSeconds?: number | null;
  src: string;
  thumbnailUrl?: string | null;
  title: string;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type MaterialVideoQuality = "LOW" | "MEDIUM" | "HIGH";

export function PlaySayRelayVideoPlayer({
  allowFullscreen = true,
  clip,
  onQualityChange,
  quality = "MEDIUM",
  resumeAtSeconds,
  src,
  thumbnailUrl,
  title,
}: PlaySayRelayVideoPlayerProps) {
  const { t } = useAppTranslation();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const normalizedClip = useMemo(() => normalizeRelayVideoClip(clip), [clip?.endSeconds, clip?.startSeconds]);
  const playbackKey = `${src}|${normalizedClip?.startSeconds ?? 0}|${normalizedClip?.endSeconds ?? ""}`;
  const previousPlaybackKeyRef = useRef(playbackKey);
  const activatedRef = useRef(false);
  const [activated, setActivated] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);

  useEffect(() => {
    activatedRef.current = activated;
  }, [activated]);

  useEffect(() => {
    function updateFullscreenState() {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    }

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    if (previousPlaybackKeyRef.current === playbackKey) {
      return;
    }
    previousPlaybackKeyRef.current = playbackKey;
    const shouldResume = activatedRef.current;
    const resumeTime = safeResumeTime(resumeAtSeconds, normalizedClip?.startSeconds ?? 0);
    setActivated(shouldResume);
    setCurrentTime(shouldResume ? resumeTime : 0);
    setDuration(0);
    setHasError(false);
    setIsLoading(false);
    setIsPlaying(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (shouldResume) {
        video.src = src;
        video.preload = "metadata";
        video.load();
        seekVideo(video, resumeTime);
        playVideo(video);
      }
    }
  }, [playbackKey, resumeAtSeconds, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.volume = Math.min(1, Math.max(0, volume / 100));
    video.muted = volume === 0;
  }, [volume]);

  const displayDuration = relayClipDuration(normalizedClip, duration);
  const displayCurrentTime = displayTimeForRelayClip(normalizedClip, currentTime);
  const progressValue = displayDuration > 0 ? Math.min(displayCurrentTime, displayDuration) : 0;
  const progressLabel = useMemo(
    () => t("materials.renderer.videoProgress", { current: formatMediaTime(progressValue), duration: formatMediaTime(displayDuration) }),
    [displayDuration, progressValue, t],
  );

  function activateAndPlay() {
    setHasError(false);
    const video = videoRef.current;
    if (!activated) {
      setActivated(true);
      if (video) {
        video.src = src;
        video.preload = "metadata";
        video.load();
        const startSeconds = safeResumeTime(resumeAtSeconds, normalizedClip?.startSeconds ?? 0);
        seekVideo(video, startSeconds);
        setCurrentTime(startSeconds);
        playVideo(video);
      }
      return;
    }
    if (!video) {
      return;
    }
    if (video.paused) {
      playVideo(video);
    } else {
      video.pause();
    }
  }

  function seek(value: string) {
    const nextTime = absoluteTimeForRelayClip(normalizedClip, Number(value));
    const video = videoRef.current;
    setCurrentTime(nextTime);
    if (video && Number.isFinite(nextTime)) {
      seekVideo(video, nextTime);
    }
  }

  function toggleMute() {
    setVolume((current) => (current === 0 ? 100 : 0));
  }

  function changeVolume(value: string) {
    const nextVolume = Number(value);
    if (Number.isFinite(nextVolume)) {
      setVolume(Math.min(100, Math.max(0, nextVolume)));
    }
  }

  function changeQuality(value: string) {
    const nextQuality = normalizedQuality(value);
    if (nextQuality === quality) {
      return;
    }
    onQualityChange?.(nextQuality, currentTime);
  }

  function replay() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const startSeconds = normalizedClip?.startSeconds ?? 0;
    seekVideo(video, startSeconds);
    setCurrentTime(startSeconds);
    setHasError(false);
    video.load();
    playVideo(video);
  }

  function requestFullscreen() {
    const element = shellRef.current as FullscreenElement | null;
    if (!element) {
      return;
    }
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
    void request?.call(element);
  }

  function exitFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
  }

  const playLabel = isPlaying ? t("materials.renderer.videoPause") : t("materials.renderer.videoPlay");
  const muteLabel = volume === 0 ? t("materials.renderer.videoUnmute") : t("materials.renderer.videoMute");
  const volumeLabel = t("materials.renderer.videoVolume", { value: volume });
  const fullscreenLabel = isFullscreen ? t("materials.renderer.videoExitFullscreen") : t("materials.renderer.videoFullscreen");
  const posterStyle = thumbnailUrl
    ? ({
        backgroundImage: `linear-gradient(180deg, rgb(17 17 17 / 0.08), rgb(17 17 17 / 0.62)), url("${thumbnailUrl}")`,
      } as CSSProperties)
    : undefined;

  function playVideo(video: HTMLVideoElement) {
    setIsLoading(true);
    void video.play().catch(() => {
      setIsLoading(false);
      setIsPlaying(false);
      if (video.error) {
        setHasError(true);
      }
    });
  }

  return (
    <div className="playsay-relay-player" data-state={activated ? "active" : "idle"} ref={shellRef}>
      <video
        aria-label={title}
        muted={volume === 0}
        onCanPlay={() => setIsLoading(false)}
        onEnded={() => {
          setIsLoading(false);
          setIsPlaying(false);
        }}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
          setIsPlaying(false);
        }}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration || 0);
          if ((normalizedClip?.startSeconds ?? 0) > 0 && video.currentTime < (normalizedClip?.startSeconds ?? 0)) {
            seekVideo(video, normalizedClip?.startSeconds ?? 0);
            setCurrentTime(normalizedClip?.startSeconds ?? 0);
          }
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => {
          setHasError(false);
          setIsLoading(false);
          setIsPlaying(true);
        }}
        onTimeUpdate={(event) => {
          const absoluteTime = event.currentTarget.currentTime;
          if (relayClipEndReached(normalizedClip, absoluteTime)) {
            seekVideo(event.currentTarget, normalizedClip?.endSeconds ?? absoluteTime);
            setCurrentTime(normalizedClip?.endSeconds ?? absoluteTime);
            event.currentTarget.pause();
            setIsPlaying(false);
            return;
          }
          setCurrentTime(absoluteTime);
        }}
        onWaiting={() => setIsLoading(true)}
        playsInline
        preload={activated ? "metadata" : "none"}
        ref={videoRef}
        src={activated ? src : undefined}
      >
        {t("materials.renderer.videoPlaybackUnsupported")}
      </video>

      {!activated || hasError ? (
        <button
          aria-label={hasError ? t("materials.renderer.videoRetry") : t("materials.renderer.videoPlay")}
          className="playsay-relay-player-poster"
          onClick={hasError ? replay : activateAndPlay}
          style={posterStyle}
          title={hasError ? t("materials.renderer.videoRetry") : t("materials.renderer.videoPlay")}
          type="button"
        >
          {hasError ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
      ) : null}

      {isLoading ? (
        <div className="playsay-relay-player-loading" role="status">
          <span>{t("materials.renderer.videoLoading")}</span>
        </div>
      ) : null}

      {activated && !hasError ? (
        <div className="playsay-relay-player-controls" data-fullscreen={allowFullscreen ? "true" : "false"}>
          <button aria-label={playLabel} onClick={activateAndPlay} title={playLabel} type="button">
            {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <span className="playsay-relay-player-time">{formatMediaTime(displayCurrentTime)}</span>
          <input
            aria-label={progressLabel}
            max={Math.max(displayDuration, 0)}
            min="0"
            onChange={(event) => seek(event.currentTarget.value)}
            step="0.1"
            type="range"
            value={progressValue}
          />
          <span className="playsay-relay-player-time">{formatMediaTime(displayDuration)}</span>
          <button aria-label={muteLabel} onClick={toggleMute} title={muteLabel} type="button">
            {volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
          <input
            aria-label={volumeLabel}
            className="playsay-relay-player-volume"
            max="100"
            min="0"
            onChange={(event) => changeVolume(event.currentTarget.value)}
            step="1"
            type="range"
            value={volume}
          />
          <select
            aria-label={t("materials.renderer.videoQuality")}
            className="playsay-relay-player-quality"
            onChange={(event) => changeQuality(event.currentTarget.value)}
            value={quality}
          >
            <option value="LOW">480p</option>
            <option value="MEDIUM">720p</option>
            <option value="HIGH">1080p</option>
          </select>
          {allowFullscreen ? (
            <button aria-label={fullscreenLabel} onClick={isFullscreen ? exitFullscreen : requestFullscreen} title={fullscreenLabel} type="button">
              {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function normalizedQuality(value: string): MaterialVideoQuality {
  return value === "LOW" || value === "HIGH" ? value : "MEDIUM";
}

function safeResumeTime(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) >= 0 ? value ?? fallback : fallback;
}

function seekVideo(video: HTMLVideoElement, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return;
  }
  try {
    video.currentTime = value;
  } catch {
    // Some browsers reject seeking before metadata is ready; onLoadedMetadata applies it again.
  }
}

function formatMediaTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
