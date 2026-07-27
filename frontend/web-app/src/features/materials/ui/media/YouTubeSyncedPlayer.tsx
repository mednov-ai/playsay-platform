import { Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppTranslation } from "../../../../shared/i18n";
import type { MaterialVideoSync } from "../../model/materialDocument";

type YouTubeSyncedPlayerProps = {
  allowFullscreen: boolean;
  blockId: string;
  src: string;
  sync: MaterialVideoSync;
  title: string;
};

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
};

type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

export function YouTubeSyncedPlayer({
  allowFullscreen,
  blockId,
  src,
  sync,
  title,
}: YouTubeSyncedPlayerProps) {
  const { t } = useAppTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const applyingRemoteRef = useRef(false);
  const appliedRemoteVersionRef = useRef("");
  const suppressTimerRef = useRef<number | null>(null);
  const autoplayCheckTimerRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const previousObservationRef = useRef<{ at: number; position: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [remotePlaybackBlocked, setRemotePlaybackBlocked] = useState(false);
  const remotePlayback = sync.states[blockId];
  const playerSrc = useMemo(() => youtubeApiUrl(src), [src]);

  useEffect(() => {
    let disposed = false;
    let player: YouTubePlayer | null = null;
    const iframe = iframeRef.current;
    if (!iframe) return;

    void loadYouTubeApi().then((api) => {
      if (disposed || !iframeRef.current) return;
      player = new api.Player(iframeRef.current, {
        events: {
          onReady: () => {
            if (!disposed) setReady(true);
          },
          onStateChange: ({ data }) => {
            if (disposed || applyingRemoteRef.current || !sync.ready || !playerRef.current) return;
            const positionSeconds = safePlayerTime(playerRef.current);
            currentTimeRef.current = positionSeconds;
            if (data === 1) {
              sync.publish(blockId, { action: "play", playing: true, positionSeconds });
            } else if (data === 2 || data === 0) {
              sync.publish(blockId, { action: "pause", playing: false, positionSeconds });
            }
          },
        },
      });
      playerRef.current = player;
    }).catch(() => undefined);

    return () => {
      disposed = true;
      setReady(false);
      if (suppressTimerRef.current !== null) window.clearTimeout(suppressTimerRef.current);
      if (autoplayCheckTimerRef.current !== null) window.clearTimeout(autoplayCheckTimerRef.current);
      playerRef.current = null;
      player?.destroy();
    };
  }, [blockId, playerSrc, sync.publish, sync.ready]);

  useEffect(() => {
    if (!ready || !remotePlayback || remotePlayback.sourceClientId === sync.clientId) return;
    const version = `${remotePlayback.revision}:${remotePlayback.heartbeat}:${remotePlayback.sourceClientId}`;
    if (appliedRemoteVersionRef.current === version) return;
    appliedRemoteVersionRef.current = version;
    applyRemotePlayback(remotePlayback.playing, remotePlayback.positionSeconds);
  }, [ready, remotePlayback, sync.clientId]);

  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const position = safePlayerTime(player);
      const now = performance.now();
      const previous = previousObservationRef.current;
      const playing = player.getPlayerState() === 1;
      currentTimeRef.current = position;

      if (!applyingRemoteRef.current && previous && sync.ready) {
        const expected = previous.position + (playing ? (now - previous.at) / 1_000 : 0);
        if (Math.abs(position - expected) > 1.25) {
          sync.publish(blockId, { action: "seek", playing, positionSeconds: position });
        }
      }
      previousObservationRef.current = { at: now, position };
    }, 500);
    return () => window.clearInterval(interval);
  }, [blockId, ready, sync]);

  useEffect(() => {
    if (
      !ready
      || !remotePlayback
      || remotePlayback.sourceClientId !== sync.clientId
      || playerRef.current?.getPlayerState() !== 1
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      sync.publish(blockId, {
        action: "play",
        playing: true,
        positionSeconds: safePlayerTime(playerRef.current),
      }, { heartbeat: true });
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [blockId, ready, remotePlayback, sync]);

  function applyRemotePlayback(playing: boolean, positionSeconds: number) {
    const player = playerRef.current;
    if (!player) return;
    applyingRemoteRef.current = true;
    setRemotePlaybackBlocked(false);
    if (autoplayCheckTimerRef.current !== null) window.clearTimeout(autoplayCheckTimerRef.current);
    player.seekTo(Math.max(0, positionSeconds), true);
    if (playing) {
      player.playVideo();
      autoplayCheckTimerRef.current = window.setTimeout(() => {
        if (playerRef.current?.getPlayerState() !== 1) setRemotePlaybackBlocked(true);
        autoplayCheckTimerRef.current = null;
      }, 900);
    } else {
      player.pauseVideo();
    }
    if (suppressTimerRef.current !== null) window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => {
      applyingRemoteRef.current = false;
      suppressTimerRef.current = null;
    }, 1_000);
  }

  return (
    <div className="playsay-youtube-sync-player">
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen={allowFullscreen}
        loading="lazy"
        ref={iframeRef}
        referrerPolicy="strict-origin-when-cross-origin"
        src={playerSrc}
        title={title}
      />
      {remotePlaybackBlocked ? (
        <button
          className="playsay-video-sync-resume"
          onClick={() => {
            if (remotePlayback) applyRemotePlayback(remotePlayback.playing, remotePlayback.positionSeconds);
          }}
          type="button"
        >
          <Play aria-hidden="true" />
          <span>{t("materials.renderer.videoSyncResume")}</span>
        </button>
      ) : null}
    </div>
  );
}

function youtubeApiUrl(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("playsinline", "1");
    if (typeof window !== "undefined") url.searchParams.set("origin", window.location.origin);
    return url.toString();
  } catch {
    return value;
  }
}

function safePlayerTime(player: YouTubePlayer | null): number {
  if (!player) return 0;
  const value = player.getCurrentTime();
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function loadYouTubeApi(): Promise<YouTubeApi> {
  const target = window as YouTubeWindow;
  if (target.YT?.Player) return Promise.resolve(target.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = target.onYouTubeIframeAPIReady;
    target.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (target.YT?.Player) resolve(target.YT);
      else reject(new Error("youtube-iframe-api-unavailable"));
    };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (existing) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => reject(new Error("youtube-iframe-api-load-failed"));
    document.head.append(script);
  });
  return youtubeApiPromise;
}
