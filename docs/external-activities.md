# Shared external activities

Honey School can present a public HTTPS activity inside a live shared lesson even when the provider forbids iframe embedding. The teacher's Chrome/Edge tab is the host: the Honey School extension captures that tab, the web app publishes its video/audio to the existing LiveKit room, and participant input is applied through a scoped MAIN-world script bridge.

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
5. Set `VITE_EXTERNAL_ACTIVITY_ENABLED=true` for a production-mode web build. Local development enables the feature automatically, and Jenkins sets the flag for builds deployed to the shared dev stand.

The packaged Jenkins artifact is `frontend/browser-extension/playsay-browser-extension.zip`. Extract it completely, then load the extracted directory that contains `manifest.json`; do not select the ZIP itself. The archive includes `INSTALL-RU.md` with the same installation, update, troubleshooting, and lesson-use steps.

To update an unpacked installation, replace/rebuild its files and click **Reload** on the extension card. If Chrome reports `Manifest file is missing or unreadable`, the wrong directory was selected or the build has not produced `dist/manifest.json`.

Version `0.1.6` is manually distributed as this unpacked/Jenkins artifact. Chrome Web Store and Edge Add-ons publication are not part of the current release flow.

## Lesson flow

1. A teacher adds **External activity** in the material editor, pastes a URL, and checks it.
2. Any lesson participant can open the activity launcher in a `SHARED` lesson.
3. Honey School asks the teacher extension to open the provider in a new tab.
4. The teacher clicks the Honey School extension action once in that provider tab. This explicit action is required by Chromium's `tabCapture` permission model.
5. Honey School returns to the lesson and publishes named screen-share video/audio tracks. These tracks are excluded from the generic screen-share stage.
6. Pointer down/up, keyboard and scroll input is sent reliably to the teacher host; independent participant cursor positions use lossy data at a maximum UI rate of 30 Hz.

The teacher can reload the activity or return everyone to the lesson. Returning publishes `STOPPED` before capture tracks are removed, then confirms `HOST_IDLE`; a student also leaves focus mode when a previously received activity track disappears and does not recover within one second. Opening a different activity tears down the previous tracks and extension-created tab.

## Security and privacy

- The extension has no `<all_urls>` host permission. Its content bridge is installed only on the current HoneySchool application and localhost origins.
- The exact bridge allowlist is `dev.online.honey.school`, `online.honey.school`, `online.honeyschool.ru`, `localhost`, and `127.0.0.1`; legacy `play-and-say.ru` application origins are intentionally excluded.
- Every page command is versioned and bound to a session id plus a random nonce.
- The service worker accepts commands only from the Honey School consumer tab that created the session.
- Pop-up tabs opened by a hosted provider are closed.
- Clipboard, upload, download, microphone, camera, and arbitrary popup operations are not exposed by the input protocol.
- The provider runs in the teacher's normal browser profile. Existing provider cookies, account state, and visible page content can therefore be shown to lesson participants; the editor displays this warning explicitly. Honey School does not read or manage provider credentials.

## Manual smoke matrix

For each guaranteed provider, test with one teacher and three students in a group `SHARED` lesson:

1. Open the exact representative URL and perform the extension action.
2. Confirm video and site audio on all four clients.
3. Click/select an answer from each participant and verify one shared state.
4. Test pointer movement, drag, keyboard input, and scroll; verify named cursors.
5. Use **Return to lesson** and verify every participant immediately leaves focus mode without a black frame.
6. Close the provider tab and verify every participant leaves the unusable focus state.
7. Verify regular camera/screen-share UI does not treat the activity capture as a presentation share.
8. Verify Chrome does not show a debugger/Verify infobar.

Representative URLs:

- LiveWorksheets: `https://www.liveworksheets.com/worksheet/en/english-second-language-esl/808929`
- Wordwall: `https://wordwall.net/ru/resource/59640205`
- iSLCollective: `https://en.islcollective.com/english-esl-video-lessons/ordering-food/617641`
- TopWorksheets: `https://www.topworksheets.com/en/english-language/listening/there-is-there-are-lisntening-64106f5fa9cbb`
- JeopardyLabs: `https://jeopardylabs.com/play/there-isare-and-prepositions-of-place`

`PARALLEL` work mode intentionally does not start shared external activities and shows a localized instruction to switch to `SHARED`. Homework uses the ordinary external link and does not start capture.
