import type { MaterialEditorBlock, MaterialVideoEmbedFrame } from "../../model/materialDocument";
import type { MaterialVideoPlayback } from "../../../../shared/api/playsay";

export function materialVideoEmbedFrame(
  block: MaterialEditorBlock,
  playback?: Pick<MaterialVideoPlayback, "embedUrl" | "mode" | "reason" | "relayUrl"> | null,
): MaterialVideoEmbedFrame | null {
  const provider = (block.provider ?? "").toUpperCase();
  if (playback?.mode === "RF_RELAY" && playback.relayUrl?.trim()) {
    return {
      kind: "RF_RELAY",
      src: playback.relayUrl,
      title: block.title || "YouTube video",
    };
  }
  if (playback?.mode === "EMBED" && playback.embedUrl?.trim()) {
    return {
      kind: "EMBED",
      src: playback.embedUrl,
      title: block.title || "YouTube video",
    };
  }
  if (playback && provider === "YOUTUBE") {
    if (playback.reason === "VIDEO_PLAYBACK_LOADING") {
      return {
        kind: "PENDING",
        mode: playback.mode,
        reason: playback.reason,
        src: "",
        title: block.title || "YouTube video",
      };
    }
    return {
      kind: "UNAVAILABLE",
      mode: playback.mode,
      reason: playback.reason,
      src: "",
      title: block.title || "YouTube video",
    };
  }

  if (provider === "YOUTUBE") {
    return youtubeEmbedFrame(block.url, block.title);
  }
  if (provider === "RUTUBE") {
    return rutubeEmbedFrame(block.url, block.title);
  }
  return null;
}

function youtubeEmbedFrame(value?: string, title = "YouTube video"): MaterialVideoEmbedFrame | null {
  const url = parseExternalUrl(value);
  if (!url) {
    return null;
  }

  const hostname = normalizedHostname(url);
  let videoId: string | null = null;
  if (hostname === "youtu.be") {
    videoId = sanitizedPathSegment(url.pathname.split("/").filter(Boolean)[0]);
  } else if (hostname === "youtube.com" || hostname === "youtube-nocookie.com" || hostname === "m.youtube.com" || hostname === "music.youtube.com") {
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts[0] === "watch") {
      videoId = sanitizedYoutubeId(url.searchParams.get("v"));
    } else if (["embed", "shorts", "live", "v"].includes(pathParts[0])) {
      videoId = sanitizedYoutubeId(pathParts[1]);
    }
  }

  if (!videoId) {
    return null;
  }

  const params = new URLSearchParams({ rel: "0" });
  const start = youtubeStartSeconds(url.searchParams.get("start") ?? url.searchParams.get("t"));
  if (start > 0) {
    params.set("start", String(start));
  }

  return {
    kind: "EMBED",
    src: `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`,
    title: title || "YouTube video",
  };
}

function rutubeEmbedFrame(value?: string, title = "Rutube video"): MaterialVideoEmbedFrame | null {
  const url = parseExternalUrl(value);
  if (!url) {
    return null;
  }

  const hostname = normalizedHostname(url);
  if (hostname !== "rutube.ru") {
    return null;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const videoId = pathParts[0] === "play" && pathParts[1] === "embed"
    ? sanitizedPathSegment(pathParts[2])
    : pathParts[0] === "video"
      ? sanitizedPathSegment(pathParts[1])
      : null;
  if (!videoId) {
    return null;
  }

  return {
    kind: "EMBED",
    src: `https://rutube.ru/play/embed/${videoId}`,
    title: title || "Rutube video",
  };
}

function parseExternalUrl(value?: string): URL | null {
  const cleanValue = value?.trim();
  if (!cleanValue) {
    return null;
  }

  try {
    return new URL(cleanValue);
  } catch {
    try {
      return new URL(`https://${cleanValue}`);
    } catch {
      return null;
    }
  }
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function sanitizedYoutubeId(value?: string | null): string | null {
  const cleanValue = value?.trim();
  if (!cleanValue || !/^[A-Za-z0-9_-]{6,32}$/.test(cleanValue)) {
    return null;
  }
  return cleanValue;
}

function sanitizedPathSegment(value?: string | null): string | null {
  const cleanValue = value?.trim();
  if (!cleanValue || !/^[A-Za-z0-9_-]{6,80}$/.test(cleanValue)) {
    return null;
  }
  return cleanValue;
}

function youtubeStartSeconds(value?: string | null): number {
  if (!value) {
    return 0;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (!match) {
    return 0;
  }
  return (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
}
