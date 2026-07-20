# Shared external activities implementation plan

## Delivered vertical slices

1. **Safe material contract** — add `externalActivity`, provider/support metadata, server-side normalization, five guaranteed providers, experimental HTTPS fallback, stable localized errors, and OpenAPI/client contracts.
2. **Authoring and preview** — add the palette item, URL resolver, compatibility/privacy messages, launcher rendering, localized labels (`ru`, `en`, `de`, `fr`), and direct-link fallback outside live shared lessons.
3. **Teacher-hosted browser** — build an MV3 Chrome/Edge 116+ extension with the Play&Say-only bridge, explicit action click, `tabCapture`, debugger input, popup/download/file chooser restrictions, deterministic packaging, and Jenkins artifact.
4. **Room synchronization** — broadcast open/collapse/host state in LiveKit, publish dedicated activity audio/video tracks, send reliable input and lossy cursors, pin the teacher host, reject stale session events, and support every participant in group lessons.
5. **Live controls** — render shared media in a focus stack, map pointer/keyboard/wheel input to the captured viewport, show participant cursors, and give the teacher back/reload/lock/stop controls plus error/waiting states.
6. **Lifecycle** — retain a minimized session for 60 seconds, stop when replaced/expired, detach debugger, stop media tracks, close only the extension-created tab, and filter activity tracks out of normal screen sharing.
7. **Release guard** — enable automatically for local development but require `VITE_EXTERNAL_ACTIVITY_ENABLED=true` in production until a signed store extension is ready.

## Verification gates

- Kotlin resolver and material-save validation tests.
- Frontend model, renderer, focus frame, protocol, and screen-share filtering tests.
- Extension protocol tests, two-entry MV3 build, and ZIP content inspection.
- Full API gateway tests; frontend lint/test/build; extension test/package.
- Desktop and mobile visual checks of editor/launcher/focus states.
- Manual multi-browser smoke for all five guaranteed providers with teacher plus three students.
