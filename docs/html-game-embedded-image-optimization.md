# HTML-game embedded image optimization

`api-gateway` owns the upload decision and canonical asset mutation. For every valid new self-contained HTML game at or below 20 MiB it scans contiguous `data:image/png|jpeg|webp;base64,...` resources without executing markup or JavaScript. It calls the internal optimizer when one encoded URI is at least 256 KiB or their aggregate is at least 1 MiB. Existing assets are not backfilled and copied assets retain canonical bytes and metadata.

## Internal contract

`POST /internal/html-game-optimizations` is available only on `game-adapter-service` cluster networking and uses `X-PlaySay-Game-Adapter-Token`, shared with the adaptation endpoint. Its JSON envelope is defined by [`contracts/html-game-optimization.schema.json`](../contracts/html-game-optimization.schema.json). The request must contain UTF-8 `html` and `policy=embedded-raster-v1`; the route accepts at most 24 MiB and has a 30-second deadline. The AI adaptation endpoint remains limited to 7 MiB and this route never invokes OpenAI or Chromium.

The processor returns only optimized HTML and bounded aggregates: policy, status, input/output bytes, eligible/replaced counts, bytes saved and duration. It processes at most 64 static images, 16 MP each, 64 MP and 256 MiB decoded RGBA total. Formats and dimensions are preserved; animated, unsupported and dynamic resources are skipped. Policy v1 pins `sharp` 0.35.4 and its lockfile-resolved `@img/sharp-libvips-*` 1.3.3 runtime. WebP uses quality 85, alpha quality 100 and effort 4; JPEG uses quality 85, progressive mozjpeg; PNG uses lossless compression level 9 and adaptive filtering without palette reduction. A replacement requires at least 15 percent encoded-resource savings and the complete output may not grow.

The gateway verifies all aggregate accounting and re-runs the existing UTF-8, 20-MiB, self-contained and unsafe-content checks before storage. Invalid selected media maps to HTTP 422 `MATERIAL_HTML_GAME_IMAGE_INVALID`; timeout, authorization, transport or malformed internal response maps to HTTP 503 `MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE`. Both paths create no asset and leave the previous material or lesson unchanged.

Successful asset metadata uses `imageOptimizationStatus`, `imageOptimizationPolicy`, `imageOptimizationInputBytes`, `imageOptimizationOutputBytes`, `imageOptimizationEligibleCount`, `imageOptimizationReplacedCount` and `imageOptimizationBytesSaved`. Logs and metrics contain only these bounded aggregates and safe failure categories, never HTML, base64, credentials or internal response bodies.

## Media-free AI adaptation

The authenticated cluster-only `/internal/game-adaptations` route may receive the canonical game so `game-adapter-service` can compare the complete source and candidate in Chromium. Before constructing an OpenAI request, the service scans contiguous base64 `data:image/*` and `data:audio/*` resources without executing HTML or JavaScript. If one supported URI occupies at least 256 KiB or their aggregate reaches 1 MiB, every supported contiguous image and audio URI is replaced in the AI input by an opaque `playsay-media-placeholder:v1` token. There is no separate whole-game 3-MiB trigger. Dynamic data URLs and non-image/audio media are not extracted.

The bounded in-memory manifest holds at most 128 resources and 20 MiB of exact canonical URI text with SHA-256 integrity digests. It is never persisted, logged, returned to gateway or included in an AI request. Every issued token must return exactly once and unchanged, and the candidate may contain no unissued reserved token. After byte-exact restoration, the service runs the existing static contract, safety, SDK, Chromium runtime and `mechanics-v3` comparison against the full canonical source. Failure returns terminal `ADAPTED_HTML_MEDIA_INTEGRITY_INVALID`, mapped publicly to `GAME_ADAPTER_MEDIA_INTEGRITY_INVALID`; no adapted asset or material mutation is created.

Safe adaptation diagnostics contain only protection status, canonical input bytes, reduced AI-input bytes, extracted bytes and resource count. They never contain HTML, base64, placeholder tokens, digests, prompts or credentials.
