# Shared external activities

Play&Say can present a public HTTPS activity inside a live shared lesson even when the provider forbids iframe embedding. The teacher's Chrome/Edge tab is the host: the Play&Say extension captures that tab, the web app publishes its video/audio to the existing LiveKit room, and participant input is applied to the host tab through the Chrome Debugger protocol.

## Supported providers

The following hosts are classified as `GUARANTEED`:

- `liveworksheets.com`
- `wordwall.net`
- `islcollective.com`
- `topworksheets.com`
- `jeopardylabs.com`

Other public HTTPS hosts are stored as `EXPERIMENTAL`. Localhost, `.local`, private/reserved IP literals, credentialed URLs, non-HTTPS URLs, control characters, and URLs longer than 2048 characters are rejected. The API never fetches the submitted URL.

## Install the development extension

1. Run `npm --workspace browser-extension run package` from `frontend/`.
2. Open `chrome://extensions` or `edge://extensions`, enable developer mode, and choose **Load unpacked**.
3. Select `frontend/browser-extension/dist`.
4. Set `VITE_EXTERNAL_ACTIVITY_ENABLED=true` for a production-mode web build. Development builds enable the feature automatically.

The packaged artifact is `frontend/browser-extension/playsay-browser-extension.zip`. Production must keep the flag disabled until the extension is signed and distributed through the Chrome/Edge extension stores.

## Lesson flow

1. A teacher adds **External activity** in the material editor, pastes a URL, and checks it.
2. Any lesson participant can open the activity launcher in a `SHARED` lesson.
3. Play&Say asks the teacher extension to open the provider in a new tab.
4. The teacher clicks the Play&Say extension action once in that provider tab. This explicit action is required by Chromium's `tabCapture` permission model.
5. Play&Say returns to the lesson and publishes named screen-share video/audio tracks. These tracks are excluded from the generic screen-share stage.
6. Pointer, keyboard, drag, and scroll input from unlocked participants is sent reliably to the teacher host; cursor positions use lossy data at a maximum UI rate of 30 Hz.

The teacher can lock/unlock student input, navigate back, reload, minimize, or stop the activity. Minimizing is synchronized and retains capture for 60 seconds; reopening resumes the same session. Opening a different activity or ending the retention window tears down tracks, debugger attachment, and the extension-created tab.

## Security and privacy

- The extension has no `<all_urls>` host permission. Its content bridge is installed only on Play&Say production and localhost origins.
- Every page command is versioned and bound to a session id plus a random nonce.
- The service worker accepts commands only from the Play&Say consumer tab that created the session.
- Pop-up tabs opened by a hosted provider are closed. Download behavior is denied and file chooser interception is enabled.
- Clipboard, upload, download, microphone, camera, and arbitrary popup operations are not exposed by the input protocol.
- The provider runs in the teacher's normal browser profile. Existing provider cookies, account state, and visible page content can therefore be shown to lesson participants; the editor displays this warning explicitly. Play&Say does not read or manage provider credentials.

## Manual smoke matrix

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
