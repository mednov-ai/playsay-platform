# Shared external activities

Honey School can present a public HTTPS activity inside a live shared lesson even when the provider forbids iframe embedding. The teacher's Chrome/Edge tab is the host: the Honey School extension captures that tab, the web app publishes its video/audio to the existing LiveKit room, and participant input is applied to the host tab through the Chrome Debugger protocol.

## Supported providers

The following hosts are classified as `GUARANTEED`:

- `liveworksheets.com`
- `wordwall.net`
- `islcollective.com`
- `topworksheets.com`
- `jeopardylabs.com`

Other public HTTPS hosts are stored as `EXPERIMENTAL`. Localhost, `.local`, private/reserved IP literals, credentialed URLs, non-HTTPS URLs, control characters, and URLs longer than 2048 characters are rejected. The API never fetches the submitted URL.

## Install the development extension

Chrome or Edge 116+ is required. The source directory is not itself an installable extension: the browser must receive a directory with `manifest.json` at its root.

1. From `frontend/`, run `npm ci` and then `npm --workspace browser-extension run package`.
2. Open `chrome://extensions` or `edge://extensions`, enable developer mode, and choose **Load unpacked**.
3. Select `frontend/browser-extension/dist` — do not select `frontend/browser-extension`.
4. Pin the bee action through the browser's extensions menu.
5. Set `VITE_EXTERNAL_ACTIVITY_ENABLED=true` for a production-mode build deployed to the shared dev stand. Local development enables the feature automatically, and Jenkins sets the flag only for dev deployments.

Shared external activities remain dev-only while browser lifecycle acceptance is incomplete. Jenkins sets `VITE_EXTERNAL_ACTIVITY_ENABLED=true` for dev deployments and deliberately leaves it unset for numeric production releases. A disabled build shows an explicit unavailable state instead of accepting a launcher click that cannot start an extension session.

The packaged Jenkins artifact is `frontend/browser-extension/playsay-browser-extension.zip`. Extract it completely, then load the extracted directory that contains `manifest.json`; do not select the ZIP itself. The archive includes `INSTALL-RU.md` with the same installation, update, troubleshooting, and lesson-use steps.

To update an unpacked installation, replace/rebuild its files and click **Reload** on the extension card. If Chrome reports `Manifest file is missing or unreadable`, the wrong directory was selected or the build has not produced `dist/manifest.json`.

Version `0.1.7` is the current unpacked/Jenkins artifact. It keeps the version-1 web lifecycle used by 0.1.6 and replaces per-event MAIN-world script injection with a temporary Chrome Debugger attachment so trusted pointer, wheel, and keyboard input reaches canvas and nested-frame providers such as Wordwall without the former input latency. Chrome may show its standard debugging notice while sharing; stop/return detaches immediately. Any later shipped extension source, manifest behavior or permissions, runtime bundle, or user-facing asset change must increment the manifest/package patch version again, synchronize the lockfile/tests/install guidance, and confirm the new version on `chrome://extensions`. Chrome Web Store and Edge Add-ons publication are not part of the current release flow.

## Lesson flow

1. A teacher adds **External activity** in the material editor, pastes a URL, and checks it.
2. Any lesson participant can open the activity launcher in a `SHARED` lesson.
3. Honey School asks the teacher extension to open the provider in a new tab.
4. The teacher clicks the Honey School extension action once in that provider tab. This explicit action is required by Chromium's `tabCapture` permission model.
5. Honey School returns to the lesson and publishes named screen-share video/audio tracks. These tracks are excluded from the generic screen-share stage.
6. Pointer, keyboard, drag, and scroll input from unlocked participants is sent reliably to the teacher host; cursor positions use lossy data at a maximum UI rate of 30 Hz.

The teacher can lock/unlock student input, navigate back, reload, minimize, or stop the activity. Minimizing is synchronized and retains capture for 60 seconds; reopening resumes the same session. Opening a different activity or ending the retention window tears down tracks, debugger attachment, and the extension-created tab. `STOPPED` and `HOST_IDLE` are ordered and session-scoped: a late idle event from the previous session cannot erase an immediate relaunch, while an authoritative host stop clears a still-unowned `REQUESTED` state created when a student launched before the teacher joined. Loss of the host video track clears the participant focus even while LiveKit still exposes a stale publication object.

## Status and recovery

The teacher status distinguishes these stages:

- opening the provider and checking the extension;
- extension acknowledged through the 0.1.6/0.1.7 `AWAITING_ACTION` event and waiting for the explicit bee action;
- capture starting;
- active sharing;
- a recoverable failure.

The extension-detection timer runs only until `AWAITING_ACTION`; it is cleared as soon as the extension acknowledges the session. Version 0.1.7 and later include their package version in that acknowledgement. An older or unidentifiable package stops before capture with `EXTENSION_UPDATE_REQUIRED` instead of presenting a false active state with unusable provider input. Teacher failures use only the stable codes `FEATURE_UNAVAILABLE`, `EXTENSION_NOT_DETECTED`, `EXTENSION_UPDATE_REQUIRED`, `TARGET_TAB_CLOSED`, `CAPTURE_PERMISSION_DENIED`, `CAPTURE_NOT_SUPPORTED`, `CAPTURE_START_FAILED`, and `EXTENSION_ERROR_UNKNOWN`. The status includes localized guidance plus Retry and Return to lesson where applicable. Retry closes and cleans the stale attempt, creates a new session id/nonce, and ignores late events from the former session. Students see only localized waiting/stopped copy and never receive raw Chrome errors, the extension package version, teacher diagnostic code, nonce, target tab id, or stream id.

For `EXTENSION_NOT_DETECTED`, verify that the unpacked extension is installed and enabled, click **Reload** on its `chrome://extensions` card, reload the Honey School lesson page so its content script is present, and then use **Retry**. `CAPTURE_NOT_SUPPORTED` requires Chrome or Edge 116+; permission/start failures should be retried after checking browser permissions and reloading the extension. Return to lesson must remain available and leave the ordinary classroom usable.

## Security and privacy

- The extension has no `<all_urls>` host permission. Its content bridge is installed only on the current HoneySchool application and localhost origins.
- The exact bridge allowlist is `dev.online.honey.school`, `online.honey.school`, `online.honeyschool.ru`, `localhost`, and `127.0.0.1`; legacy `play-and-say.ru` application origins are intentionally excluded.
- Every page command is versioned and bound to a session id plus a random nonce.
- The service worker accepts commands only from the Honey School consumer tab that created the session.
- Pop-up tabs opened by a hosted provider are closed. Download behavior is denied and file chooser interception is enabled.
- Clipboard, upload, download, microphone, camera, and arbitrary popup operations are not exposed by the input protocol.
- The provider runs in the teacher's normal browser profile. Existing provider cookies, account state, and visible page content can therefore be shown to lesson participants; the editor displays this warning explicitly. Honey School does not read or manage provider credentials.

## Manual smoke matrix

Before any future production proposal, the dev web build contract and complete browser acceptance matrix must pass on `https://dev.online.honey.school/`. Production origins remain disabled and are not part of the current delivery. Record only the displayed extension version, stable status codes, lifecycle outcome, and non-sensitive build identity. Exercise the installed `0.1.7` candidate shown on `chrome://extensions`, including student-first launch before teacher connection, provider start, participant input, Return to lesson, and immediate relaunch.

For each guaranteed provider, test with one teacher and three students in a group `SHARED` lesson:

1. Open the exact representative URL and perform the extension action.
2. Confirm video and site audio on all four clients.
3. Click/select an answer from each participant and verify one shared state.
4. Test pointer movement, drag, keyboard input, and scroll; verify named cursors.
5. Lock students and verify only teacher input applies; then unlock.
6. Minimize on a student, verify everyone minimizes, reopen inside 60 seconds, and verify the provider state remains.
7. Close the provider tab and detach the debugger to verify localized error states.
8. Verify regular camera/screen-share UI does not treat the activity capture as a presentation share.

Representative URLs:

- LiveWorksheets: `https://www.liveworksheets.com/worksheet/en/english-second-language-esl/808929`
- Wordwall: `https://wordwall.net/ru/resource/59640205`
- iSLCollective: `https://en.islcollective.com/english-esl-video-lessons/ordering-food/617641`
- TopWorksheets: `https://www.topworksheets.com/en/english-language/listening/there-is-there-are-lisntening-64106f5fa9cbb`
- JeopardyLabs: `https://jeopardylabs.com/play/there-isare-and-prepositions-of-place`

`PARALLEL` work mode intentionally does not start shared external activities and shows a localized instruction to switch to `SHARED`. Homework uses the ordinary external link and does not start capture.
