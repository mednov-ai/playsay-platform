import { parsePageCommand, sessionsToReplace, type ExternalInput, type PageCommand } from "./protocol";

type HostSession = {
  sessionId: string;
  nonce: string;
  consumerTabId: number;
  targetTabId: number;
  expectedUrl: string;
  inputEnabled: boolean;
};

const sessions = new Map<string, HostSession>();
const hydration = chrome.storage.session.get("hostSessions").then(({ hostSessions }) => {
  if (Array.isArray(hostSessions)) {
    hostSessions.forEach((session) => {
      if (session && typeof session.sessionId === "string") sessions.set(session.sessionId, session as HostSession);
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const command = parsePageCommand(message);
  if (!command || sender.tab?.id === undefined) return false;
  void handleCommand(command, sender.tab.id).then(sendResponse).catch((error) => {
    sendStatus(sender.tab!.id!, command.sessionId, "ERROR", String(error));
    sendResponse({ ok: false });
  });
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void hydration.then(() => {
    const session = [...sessions.values()].find((candidate) => candidate.targetTabId === tab.id);
    if (session) return activateCapture(session);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void hydration.then(async () => {
    for (const session of sessions.values()) {
      if (session.targetTabId === tabId) {
        sessions.delete(session.sessionId);
        await persistSessions();
        sendStatus(session.consumerTabId, session.sessionId, "TAB_CLOSED");
      } else if (session.consumerTabId === tabId) {
        await stopSession(session, true);
      }
    }
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined || tab.openerTabId === undefined) return;
  void hydration.then(() => {
    if ([...sessions.values()].some((session) => session.targetTabId === tab.openerTabId)) return chrome.tabs.remove(tab.id!);
  });
});

async function handleCommand(command: PageCommand, consumerTabId: number): Promise<{ ok: boolean }> {
  await hydration;
  if (command.type === "PREPARE") {
    const previousSessions = sessionsToReplace(sessions.values(), consumerTabId, command.sessionId);
    for (const previous of previousSessions) await stopSession(previous, true);
    const target = await chrome.tabs.create({ url: command.url, active: true });
    if (target.id === undefined) throw new Error("TARGET_TAB_NOT_CREATED");
    sessions.set(command.sessionId, {
      sessionId: command.sessionId,
      nonce: command.nonce,
      consumerTabId,
      targetTabId: target.id,
      expectedUrl: command.url!,
      inputEnabled: false,
    });
    await persistSessions();
    sendStatus(consumerTabId, command.sessionId, "AWAITING_ACTION", undefined, { targetTabId: target.id });
    return { ok: true };
  }

  const session = sessions.get(command.sessionId);
  if (!session || session.nonce !== command.nonce || session.consumerTabId !== consumerTabId) return { ok: false };
  if (command.type === "STOP") {
    await stopSession(session, true);
  } else if (command.type === "RELOAD") {
    await chrome.tabs.reload(session.targetTabId);
  } else if (command.type === "BACK") {
    await chrome.tabs.goBack(session.targetTabId);
  } else if (command.type === "INPUT" && command.input && session.inputEnabled) {
    await sendInput(session.targetTabId, command.input);
  }
  return { ok: true };
}

async function activateCapture(session: HostSession) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: session.targetTabId,
      consumerTabId: session.consumerTabId,
    });
    await chrome.scripting.executeScript({
      target: { tabId: session.targetTabId },
      world: "MAIN",
      func: () => true,
    });
    session.inputEnabled = true;
    await persistSessions();
    sendStatus(session.consumerTabId, session.sessionId, "CAPTURE_READY", undefined, { streamId });
    await chrome.tabs.update(session.consumerTabId, { active: true });
  } catch (error) {
    sendStatus(session.consumerTabId, session.sessionId, "ERROR", String(error));
  }
}

async function stopSession(session: HostSession, closeTarget: boolean) {
  sessions.delete(session.sessionId);
  await persistSessions();
  if (closeTarget) await chrome.tabs.remove(session.targetTabId).catch(() => undefined);
  sendStatus(session.consumerTabId, session.sessionId, "STOPPED");
}

async function sendInput(tabId: number, input: ExternalInput) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [input],
    func: (next: ExternalInput) => {
      if (next.type === "key") {
        const keyboardTarget = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
        keyboardTarget.dispatchEvent(new KeyboardEvent(next.action === "down" ? "keydown" : "keyup", {
          bubbles: true,
          cancelable: true,
          code: next.code ?? "",
          key: next.key,
          altKey: Boolean(next.modifiers && (next.modifiers & 1)),
          ctrlKey: Boolean(next.modifiers && (next.modifiers & 2)),
          metaKey: Boolean(next.modifiers && (next.modifiers & 4)),
          shiftKey: Boolean(next.modifiers && (next.modifiers & 8)),
        }));
        if (
          next.action === "down"
          && next.text
          && (keyboardTarget instanceof HTMLInputElement || keyboardTarget instanceof HTMLTextAreaElement)
        ) {
          const start = keyboardTarget.selectionStart ?? keyboardTarget.value.length;
          const end = keyboardTarget.selectionEnd ?? start;
          keyboardTarget.setRangeText(next.text, start, end, "end");
          keyboardTarget.dispatchEvent(new InputEvent("input", { bubbles: true, data: next.text, inputType: "insertText" }));
        }
        return;
      }

      const normalizedX = typeof next.normalizedX === "number"
        ? next.normalizedX
        : next.sourceWidth ? next.x / next.sourceWidth : next.x / window.innerWidth;
      const normalizedY = typeof next.normalizedY === "number"
        ? next.normalizedY
        : next.sourceHeight ? next.y / next.sourceHeight : next.y / window.innerHeight;
      const x = Math.min(window.innerWidth - 1, Math.max(0, normalizedX * window.innerWidth));
      const y = Math.min(window.innerHeight - 1, Math.max(0, normalizedY * window.innerHeight));

      if (next.type === "scroll") {
        window.scrollBy({ left: next.deltaX, top: next.deltaY, behavior: "auto" });
        return;
      }

      const target = document.elementFromPoint(x, y);
      if (!(target instanceof HTMLElement)) return;

      if (next.type === "pointer") {
        const button = next.button === "middle" ? 1 : next.button === "right" ? 2 : 0;
        if (next.action === "down") {
          target.focus({ preventScroll: true });
          return;
        }
        const common = {
          bubbles: true,
          button,
          buttons: button === 1 ? 4 : button === 2 ? 2 : 1,
          cancelable: true,
          clientX: x,
          clientY: y,
          detail: next.clickCount ?? 1,
          view: window,
        };
        target.dispatchEvent(new PointerEvent("pointerdown", {
          ...common,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }));
        target.dispatchEvent(new MouseEvent("mousedown", common));
        target.dispatchEvent(new PointerEvent("pointerup", {
          ...common,
          buttons: 0,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }));
        target.dispatchEvent(new MouseEvent("mouseup", { ...common, buttons: 0 }));
        if (button === 0) target.click();
        return;
      }

    },
  });
}

async function persistSessions() {
  await chrome.storage.session.set({ hostSessions: [...sessions.values()] });
}

function sendStatus(tabId: number, sessionId: string, type: string, error?: string, payload: Record<string, unknown> = {}) {
  void chrome.tabs.sendMessage(tabId, { version: 1, type, sessionId, error, ...payload }).catch(() => undefined);
}
