import { Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppTranslation } from "../../../../shared/i18n";

type PlaySayRelayVideoPlayerProps = {
  src: string;
  title: string;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function PlaySayRelayVideoPlayer({ src, title }: PlaySayRelayVideoPlayerProps) {
  const { t } = useAppTranslation();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previousSrcRef = useRef(src);
  const [activated, setActivated] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (previousSrcRef.current === src) {
      return;
    }
    previousSrcRef.current = src;
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
  }, [src]);

  const progressValue = duration > 0 ? Math.min(currentTime, duration) : 0;
  const progressLabel = useMemo(
    () => t("materials.renderer.videoProgress", { current: formatMediaTime(progressValue), duration: formatMediaTime(duration) }),
    [duration, progressValue, t],
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
    const nextTime = Number(value);
    const video = videoRef.current;
    setCurrentTime(nextTime);
    if (video && Number.isFinite(nextTime)) {
      video.currentTime = nextTime;
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
    video.currentTime = 0;
    setCurrentTime(0);
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
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => {
          setHasError(false);
          setIsLoading(false);
          setIsPlaying(true);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
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
        <div className="playsay-relay-player-controls">
          <button aria-label={playLabel} onClick={activateAndPlay} title={playLabel} type="button">
            {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <span className="playsay-relay-player-time">{formatMediaTime(currentTime)}</span>
          <input
            aria-label={progressLabel}
            max={Math.max(duration, 0)}
            min="0"
            onChange={(event) => seek(event.currentTarget.value)}
            step="0.1"
            type="range"
            value={progressValue}
          />
          <span className="playsay-relay-player-time">{formatMediaTime(duration)}</span>
          <button aria-label={muteLabel} onClick={toggleMute} title={muteLabel} type="button">
            {isMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
          <button aria-label={t("materials.renderer.videoFullscreen")} onClick={requestFullscreen} title={t("materials.renderer.videoFullscreen")} type="button">
            <Maximize2 aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
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
