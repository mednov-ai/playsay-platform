import {
  EXTENSION_CHANNEL,
  PAGE_CHANNEL,
  isTrustedPlaySayOrigin,
  parsePageCommand,
} from "./protocol";
import { forwardPageCommand } from "./content-bridge";

if (isTrustedPlaySayOrigin(window.location.origin)) {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.channel !== PAGE_CHANNEL) return;
    const command = parsePageCommand(event.data.command);
    if (command) void forwardPageCommand(
      command,
      (message) => chrome.runtime.sendMessage(message),
      (extensionEvent) => window.postMessage(
        { channel: EXTENSION_CHANNEL, event: extensionEvent },
        window.location.origin,
      ),
    );
  });

  chrome.runtime.onMessage.addListener((message) => {
    window.postMessage({ channel: EXTENSION_CHANNEL, event: message }, window.location.origin);
  });

  window.postMessage({
    channel: EXTENSION_CHANNEL,
    event: { version: 1, type: "EXTENSION_READY", extensionVersion: chrome.runtime.getManifest().version },
  }, window.location.origin);
}
