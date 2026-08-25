import { applyCaptureHardening } from "./capture-hardening";
import { parsePageCommand, sessionsToReplace, type PageCommand } from "./protocol";
import { pointerButtonMask, trustedInputCommand } from "./trusted-input";

type HostSession = {
  sessionId: string;
  nonce: string;
  consumerTabId: number;
  targetTabId: number;
  expectedUrl: string;
  inputEnabled: boolean;
  pressedButtons?: number;
  viewportHeight?: number;
  viewportWidth?: number;
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
  void hydration.then(async () => {
    const session = [...sessions.values()].find((candidate) => candidate.targetTabId === tab.id);
    if (!session) return;
    if (session.inputEnabled) {
      await chrome.tabs.update(session.consumerTabId, { active: true });
      return;
    }
    await activateCapture(session);
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
    if ([...sessions.values()].some((session) => session.targetTabId === tab.openerTabId)) {
      return chrome.tabs.remove(tab.id!);
    }
  });
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId === undefined || reason === "target_closed") return;
  void hydration.then(async () => {
    const session = [...sessions.values()].find((candidate) => candidate.targetTabId === source.tabId);
    if (!session || !session.inputEnabled) return;
    session.inputEnabled = false;
    await persistSessions();
    sendStatus(session.consumerTabId, session.sessionId, "DEBUGGER_DETACHED");
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
    await refreshViewport(session).catch(() => undefined);
  } else if (command.type === "BACK") {
    await chrome.tabs.goBack(session.targetTabId);
    await refreshViewport(session).catch(() => undefined);
  } else if (command.type === "INPUT" && command.input && session.inputEnabled) {
    if (command.input.type === "pointer") {
      const nextMask = pointerButtonMask(command.input);
      if (nextMask >= 0) session.pressedButtons = nextMask;
    }
    const trusted = trustedInputCommand(command.input, {
      height: session.viewportHeight ?? 720,
      width: session.viewportWidth ?? 1280,
    }, session.pressedButtons ?? 0);
    await chrome.debugger.sendCommand({ tabId: session.targetTabId }, trusted.method, trusted.params);
  }
  return { ok: true };
}

async function activateCapture(session: HostSession) {
  try {
    const debuggee = { tabId: session.targetTabId };
    await chrome.debugger.attach(debuggee, "1.3");
    await applyCaptureHardening((method, params) => chrome.debugger.sendCommand(debuggee, method, params));
    await refreshViewport(session);
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: session.targetTabId,
      consumerTabId: session.consumerTabId,
    });
    session.inputEnabled = true;
    session.pressedButtons = 0;
    await persistSessions();
    sendStatus(session.consumerTabId, session.sessionId, "CAPTURE_READY", undefined, { streamId });
    await chrome.tabs.update(session.consumerTabId, { active: true });
  } catch (error) {
    session.inputEnabled = false;
    await chrome.debugger.detach({ tabId: session.targetTabId }).catch(() => undefined);
    sendStatus(session.consumerTabId, session.sessionId, "ERROR", String(error));
  }
}

async function stopSession(session: HostSession, closeTarget: boolean) {
  sessions.delete(session.sessionId);
  await persistSessions();
  await chrome.debugger.detach({ tabId: session.targetTabId }).catch(() => undefined);
  if (closeTarget) await chrome.tabs.remove(session.targetTabId).catch(() => undefined);
  sendStatus(session.consumerTabId, session.sessionId, "STOPPED");
}

async function refreshViewport(session: HostSession) {
  const result = await chrome.debugger.sendCommand({ tabId: session.targetTabId }, "Runtime.evaluate", {
    expression: "({width: window.innerWidth, height: window.innerHeight})",
    returnByValue: true,
  }) as { result?: { value?: { height?: number; width?: number } } };
  const height = result.result?.value?.height;
  const width = result.result?.value?.width;
  if (typeof height === "number" && height > 0) session.viewportHeight = height;
  if (typeof width === "number" && width > 0) session.viewportWidth = width;
}

async function persistSessions() {
  await chrome.storage.session.set({ hostSessions: [...sessions.values()] });
}

function sendStatus(tabId: number, sessionId: string, type: string, error?: string, payload: Record<string, unknown> = {}) {
  void chrome.tabs.sendMessage(tabId, {
    version: 1,
    type,
    sessionId,
    extensionVersion: chrome.runtime.getManifest().version,
    error,
    ...payload,
  }).catch(() => undefined);
}
