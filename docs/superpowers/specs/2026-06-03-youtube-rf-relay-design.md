# YouTube RF Relay Design

## Summary

Play&Say keeps the normal YouTube path as the official `youtube-nocookie.com` embed. A separate risk-flagged production mode can relay YouTube video bytes through the Play&Say backend for authorized Russian-region users when the video appears inside an allowed lesson, homework, or teacher/admin material preview context.

## Requirements

- Teachers may paste any YouTube link into a material video block.
- YouTube videos are usable only when the video is no longer than 7 minutes and the detected language is English.
- Relay mode is available only when all checks pass:
  - user is authenticated;
  - app profile `countryCode` is `RU`;
  - current request IP geolocation is `RU`;
  - the user can access the material through normal Play&Say permissions, active lesson participation, homework assignment, or teacher/admin preview;
  - the block is a valid YouTube video block and passes metadata checks;
  - `PLAYSAY_YOUTUBE_RF_RELAY_ENABLED=true`.
- If profile country and IP country disagree, relay is disabled and the client receives the official embed/fallback decision.
- Relay is not a general proxy: it accepts only a short-lived playback session created for one `userId + materialId + blockId + youtubeVideoId`.
- The feature must be auditable and quickly disableable.

## Architecture

Backend owns the decision. Frontend asks `api-gateway` for a playback decision for a material block. The response is one of `EMBED`, `RF_RELAY`, `BLOCKED`, or `NEEDS_REVIEW`. `EMBED` returns the official embed URL. `RF_RELAY` returns a short-lived stream URL scoped to a playback session. `BLOCKED`/`NEEDS_REVIEW` return stable reasons for localized UI.

The first implementation keeps the relay in `api-gateway` to avoid a new deployable service. The relay uses a configurable `yt-dlp` executable to resolve an HTTPS media URL, then streams that URL through the backend while forwarding Range headers. If `yt-dlp` is missing or the feature flag is off, the decision falls back to `EMBED` or `NEEDS_REVIEW` rather than exposing an open proxy.

## Data Model

- `app_user.country_code`: nullable ISO-3166 alpha-2 country code. `RU` is required for RF relay eligibility.
- Material video block metadata:
  - `type = videoEmbed`
  - `provider = YOUTUBE`
  - `url`
  - optional `videoMeta.videoId`
  - optional `videoMeta.durationSeconds`
  - optional `videoMeta.language`
  - optional `videoMeta.validationStatus`

The backend can parse YouTube IDs from common URL shapes and uses either stored metadata or a configured YouTube inspector. Metadata remains JSON inside the material document so old blocks continue to load.

## Operations

- Feature flag: `PLAYSAY_YOUTUBE_RF_RELAY_ENABLED`, default `false`.
- Optional YouTube Data API key: `PLAYSAY_YOUTUBE_DATA_API_KEY`.
- Optional `yt-dlp` executable path: `PLAYSAY_YOUTUBE_RELAY_YTDLP_PATH`, default `yt-dlp`.
- IP geolocation provider is configurable and must fail closed for relay: unknown country is not `RU`.
- Logs include user id, material id, block id, video id, profile country, IP country, decision, and reason. Logs must not include tokens, extracted media URLs, or secret config.

## UX

The video block still renders as part of the material. For non-RF or ineligible users, it uses the official iframe. For eligible RF users, it uses an HTML video player with the backend relay URL. If relay is unavailable, the block shows a compact localized message and an official embed/link fallback when appropriate.

## Testing

- Backend tests cover profile country persistence, YouTube URL parsing, duration/language gating, profile/IP strictness, feature flag fallback, short-lived session scoping, and access denial for unauthorized material.
- Frontend tests cover embed vs relay frame selection and localized profile country UI.
- Contract generation updates OpenAPI and generated frontend types.

