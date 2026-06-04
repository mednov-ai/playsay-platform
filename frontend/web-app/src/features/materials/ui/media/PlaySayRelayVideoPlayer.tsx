import { Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  src: string;
  title: string;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function PlaySayRelayVideoPlayer({ allowFullscreen = true, clip, src, title }: PlaySayRelayVideoPlayerProps) {
  const { t } = useAppTranslation();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const normalizedClip = useMemo(() => normalizeRelayVideoClip(clip), [clip?.endSeconds, clip?.startSeconds]);
  const playbackKey = `${src}|${normalizedClip?.startSeconds ?? 0}|${normalizedClip?.endSeconds ?? ""}`;
  const previousPlaybackKeyRef = useRef(playbackKey);
  const [activated, setActivated] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (previousPlaybackKeyRef.current === playbackKey) {
      return;
    }
    previousPlaybackKeyRef.current = playbackKey;
    setActivated(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
    setIsLoading(false);
    setIsPlaying(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }, [playbackKey]);

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
        seekVideo(video, normalizedClip?.startSeconds ?? 0);
        setCurrentTime(normalizedClip?.startSeconds ?? 0);
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
    setIsMuted((muted) => !muted);
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

  const playLabel = isPlaying ? t("materials.renderer.videoPause") : t("materials.renderer.videoPlay");
  const muteLabel = isMuted ? t("materials.renderer.videoUnmute") : t("materials.renderer.videoMute");

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
        muted={isMuted}
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
          title={hasError ? t("materials.renderer.videoRetry") : t("materials.renderer.videoPlay")}
          type="button"
        >
          {hasError ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span>{hasError ? t("materials.renderer.videoLoadFailed") : title}</span>
        </button>
      ) : null}

      {isLoading ? (
        <div className="playsay-relay-player-loading" role="status">
          <span className="playsay-visually-hidden">{t("materials.renderer.videoLoading")}</span>
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
            {isMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
          {allowFullscreen ? (
            <button aria-label={t("materials.renderer.videoFullscreen")} onClick={requestFullscreen} title={t("materials.renderer.videoFullscreen")} type="button">
              <Maximize2 aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
