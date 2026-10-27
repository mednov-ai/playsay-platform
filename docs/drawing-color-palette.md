# Drawing color palette

The shared drawing toolbar in Honey School offers exactly ten fixed colors through one collapsible list. The collapsed control shows the current color and a disclosure arrow. Each option has a swatch, a localized name and a selected state; color alone does not communicate selection.

| Color | Value |
|---|---|
| Orange | `#ff5c00` |
| Green | `#00a878` |
| Blue | `#2574ff` |
| Red | `#ef4444` |
| Yellow | `#eab308` |
| Purple | `#8b5cf6` |
| Pink | `#ec4899` |
| Black | `#111827` |
| Gray | `#6b7280` |
| White | `#ffffff` |

The initial color remains orange. Arbitrary color input and persistent user palette settings are outside this feature. All labels, tooltips and assistive names are localized in `ru`, `en`, `de` and `fr`.

## Interaction and layout

Mouse and touch can open the list and select a color. Enter/Space opens or confirms; arrows and Home/End navigate without applying; Escape dismisses. Selection and Escape restore focus to the control. Tab leaves without trapping focus. Clicking elsewhere dismisses without taking focus from the destination. Repeating the current color does not add redundant undo history; recoloring an existing selection with a different color remains supported even when that color is already the default for new strokes.

The list renders outside the scrolling toolbar, inside the active fullscreen element when applicable. It fits the viewport and scrolls internally when necessary. Scrolling the containing surface or resizing closes it safely. Light/dark themes and white swatches retain visible borders. Menu input does not propagate to canvas drawing or deletion handlers.

## Drawing compatibility

Both lesson and controlled homework/review canvases use the same toolbar. The existing color callback retains its rules for new objects, supported selected objects, sticky notes and mind map roots. The current tool, selection, undo/redo, annotation coordinates, read-only behavior, SHARED/PARALLEL boundaries, persistence and Yjs protocol remain unchanged. Legacy annotations retain any valid saved color outside the palette; opening the menu never normalizes document data.

## Local verification and delivery boundary

From `frontend`, install the existing lockfile, build `game-sync-sdk`, then run web-app lint, tests and build. Run `node scripts/smoke/drawing-palette-local-smoke.mjs` from the platform root with an external `PLAYWRIGHT_PACKAGE_DIR` if needed and an optional `OUTPUT_DIR`.

The runner uses synthetic material, local Yjs rooms and controlled state. It checks Chromium/WebKit, desktop/mobile, both themes, all four locales, both canvas consumers, choice/dismiss/keyboard, drawing/recolor, undo/redo, expanded images and reload. Shared/isolated local rooms demonstrate state routing only; they do not prove deployed authentication, server authorization or durable production storage. DEV/PROD delivery and required `develop` integration follow the infra runbook and require separate authorization.
