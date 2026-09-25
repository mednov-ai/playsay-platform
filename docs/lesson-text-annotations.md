# Lesson Text annotations

Text belongs to its lesson collaboration workspace, material page and optional image anchor. Text content, including leading/trailing spaces and line breaks, is preserved independently of automatic size measurement. Switching display mode, resizing the viewport or reconnecting the same workspace must not erase content or reset an active text editor. Explicit deletion and undo/redo remain legitimate mutations.

## Rendering and coordinates

Text, sticky notes and mind map labels keep the existing annotation coordinate space and stored dimensions. Their HTML content is painted in a clipped HTML layer aligned with the SVG annotation viewport. This avoids WebKit's misplaced/blank composited HTML inside SVG `foreignObject` without disabling text scrolling or changing the stored coordinates. The SVG remains the logical event and selection owner; React portal events preserve the drawing tools, while pointer capture for text uses its HTML box so double-click can reopen the editor. Font measurements remove the display scale before updating stored dimensions.

The HTML layer follows the same image bounds and pending-geometry visibility as the SVG layer. It must not cover another image or intercept drawing when an unrelated tool is active. Read-only content does not accept pointer edits. Portal nodes are removed with their annotation layer. Layout/render updates do not write a new text value.

## Live state and fallback persistence

The live path uses the existing authenticated collaboration connection and Yjs document. Annotation mutations are applied outside React state updaters; the synchronous runtime observer supplies the canonical next state. A readiness transition affects legacy seeding only, not the edit session. Existing Y.Text merge, undo scope and workspace authorization remain unchanged.

The REST fallback owns one request/write session per canvas context. A response begun before a local edit cannot replace it; read failure is not an empty document. Writes are serialized, acknowledgements clear only the matching pending content, and an open session retries failed writes on its next polling interval. On context change or unmount the pending write is drained to the original lesson, including a newer edit queued behind an older in-flight write. There is no new durable offline store: closing the browser before a successful save does not guarantee recovery.

## Verification boundary

Local regressions must cover actual canvas input over an image, stale reads, failed writes, last-character/geometry updates, reconnect, workspace switching, deletion and snapshot restore. Browser checks must inspect painted glyphs as well as DOM/model content: the latter alone missed the WebKit rendering defect. Exercise desktop/mobile Chromium and WebKit, image expand/collapse, page return, move/resize, long-text scrolling and independent edits from a second client.

Authenticated SHARED/PARALLEL acceptance and deployment evidence are separate from a local test server. Delivery follows the infra runbook and requires separate authorization.

## Reproducible local browser check

Run `node scripts/smoke/lesson-text-annotation-local-smoke.mjs` from the platform repository. Set `PLAYWRIGHT_PACKAGE_DIR` to an external installation containing Playwright; optionally set `CHROMIUM_EXECUTABLE`, `WEBKIT_EXECUTABLE` and `OUTPUT_DIR`. The runner uses synthetic materials, starts local ephemeral servers, exercises two clients in eight cases and writes JSON results/screenshots. It does not access deployed lessons or prove authenticated authorization.
