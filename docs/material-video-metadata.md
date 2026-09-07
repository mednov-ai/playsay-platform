# YouTube material metadata

This document defines metadata recovery for Honey School `videoEmbed` blocks. The cross-domain contract is workspace `spec.md` §5.4. Public material requests continue to carry the existing JSON `document`; no generated OpenAPI field or database migration is required.

## Document shape

A YouTube block may carry `videoMeta` with optional `durationSeconds` (positive integral seconds, at most 2147483647), `language`, `validationStatus` and `sourceUrl`. The editor writes `language: "en"` only after explicit teacher confirmation and `validationStatus: "TEACHER_CONFIRMED"` when both fields are filled. The full duration is independent of `videoClip` start/end boundaries. Partial entries remain editable and do not authorize RF delivery until complete. Older blocks with or without metadata remain readable.

New manual entries bind `sourceUrl` to the exact block URL. Changing URL/provider clears old entries. A teacher can reconfirm the new source before saving; source-bound new entries survive that save. The server clears unbound stale entries on source changes and ignores a metadata/source URL mismatch. Read/edit permissions continue to use the existing material authorization policy.

## Playback and cache

For valid YouTube URLs, missing duration/language allows the official privacy-enhanced embed and yields a recoverable metadata status. It does not authorize RF relay/cache. RF relay/cache requires positive full duration <=420 seconds, English audio and the existing access, regional and quality checks. A short clip cannot authorize a longer source video.

Persisted block data can fill missing automatic policy fields. Known larger automatic durations and non-English language still reject RF relay/cache. Media extraction and cache download also reject newly observed policy violations. Manual entries do not replace stream formats or technical availability. A stream extraction failure returns `YOUTUBE_RELAY_UNAVAILABLE` with retry; it does not remove the saved entries.

The cache worker may use confirmed metadata from a currently referenced, non-archived material, matching both block ID and video ID. It rechecks policy and does not record teacher input as global automatic cache metadata. Known cache/provider policy constraints remain effective. Removing/changing the source makes its previous confirmation ineligible.

## Editor and recovery

YouTube editor fields are always reachable regardless of metadata/cache state. Full duration accepts positive integer seconds or m:ss / h:mm:ss, without rounding fractional input. Invalid input gets a localized validation error; duration above seven minutes explains the RF restriction.

In teacher material preview, a metadata error exposes an action opening the corresponding editor block, followed by save and retry. The renderer invalidates decisions when the URL or metadata changes and ignores late responses from previous requests. Unsaved video hover preview uses the official embed without querying playback for an older persisted version. Student playback offers localized status/retry without teacher controls. UI and assistive text cover ru/en/de/fr and desktop/mobile.
