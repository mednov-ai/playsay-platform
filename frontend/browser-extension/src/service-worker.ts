import { cdpCommandForInput, parsePageCommand, type PageCommand } from "./protocol";

type HostSession = {
  sessionId: string;
  nonce: string;
  consumerTabId: number;
  targetTabId: number;
  expectedUrl: string;
  debuggerAttached: boolean;
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

chrome.debugger.onDetach.addListener((source) => {
  void hydration.then(async () => {
    const session = [...sessions.values()].find((candidate) => candidate.targetTabId === source.tabId);
    if (session) {
      session.debuggerAttached = false;
      await persistSessions();
      sendStatus(session.consumerTabId, session.sessionId, "DEBUGGER_DETACHED");
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
    const previous = sessions.get(command.sessionId);
    if (previous) await stopSession(previous, true);
    const target = await chrome.tabs.create({ url: command.url, active: true });
    if (target.id === undefined) throw new Error("TARGET_TAB_NOT_CREATED");
    sessions.set(command.sessionId, {
      sessionId: command.sessionId,
      nonce: command.nonce,
      consumerTabId,
      targetTabId: target.id,
      expectedUrl: command.url!,
      debuggerAttached: false,
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
    await chrome.debugger.sendCommand({ tabId: session.targetTabId }, "Page.goBack");
  } else if (command.type === "INPUT" && command.input && session.debuggerAttached) {
    const cdp = cdpCommandForInput(command.input);
    if (cdp) await chrome.debugger.sendCommand({ tabId: session.targetTabId }, cdp.method, cdp.params);
  }
  return { ok: true };
}

async function activateCapture(session: HostSession) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: session.targetTabId,
      consumerTabId: session.consumerTabId,
    });
    await chrome.debugger.attach({ tabId: session.targetTabId }, "1.3");
    session.debuggerAttached = true;
    await persistSessions();
    await chrome.debugger.sendCommand({ tabId: session.targetTabId }, "Page.enable");
    await chrome.debugger.sendCommand({ tabId: session.targetTabId }, "Page.setDownloadBehavior", { behavior: "deny" });
    await chrome.debugger.sendCommand({ tabId: session.targetTabId }, "Page.setInterceptFileChooserDialog", { enabled: true });
    sendStatus(session.consumerTabId, session.sessionId, "CAPTURE_READY", undefined, { streamId });
    await chrome.tabs.update(session.consumerTabId, { active: true });
  } catch (error) {
    sendStatus(session.consumerTabId, session.sessionId, "ERROR", String(error));
  }
}

async function stopSession(session: HostSession, closeTarget: boolean) {
  sessions.delete(session.sessionId);
  await persistSessions();
  if (session.debuggerAttached) {
    await chrome.debugger.detach({ tabId: session.targetTabId }).catch(() => undefined);
  }
  if (closeTarget) await chrome.tabs.remove(session.targetTabId).catch(() => undefined);
  sendStatus(session.consumerTabId, session.sessionId, "STOPPED");
}

async function persistSessions() {
  await chrome.storage.session.set({ hostSessions: [...sessions.values()] });
}

function sendStatus(tabId: number, sessionId: string, type: string, error?: string, payload: Record<string, unknown> = {}) {
  void chrome.tabs.sendMessage(tabId, { version: 1, type, sessionId, error, ...payload }).catch(() => undefined);
}
