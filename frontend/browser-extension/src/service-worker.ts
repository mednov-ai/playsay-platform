import { applyCaptureHardening } from "./capture-hardening";
import { createInputDispatcher, type DispatchSession, type DispatchViewport } from "./input-dispatch";
import { parsePageCommand, sessionsToReplace, type InputResult, type PageCommand } from "./protocol";
import { debuggerEventRefreshesViewport } from "./viewport-lifecycle";

type HostSession = DispatchSession & {
  sessionId: string;
  nonce: string;
  consumerTabId: number;
  targetTabId: number;
  expectedUrl: string;
  inputEnabled: boolean;
  viewport?: DispatchViewport;
};

const sessions = new Map<string, HostSession>();
const hydration = chrome.storage.session.get("hostSessions").then(({ hostSessions }) => {
  if (Array.isArray(hostSessions)) {
    hostSessions.forEach((session) => {
      if (session && typeof session.sessionId === "string") sessions.set(session.sessionId, session as HostSession);
    });
  }
});

const dispatchInput = createInputDispatcher({
  refreshViewport,
  sendCommand: async (targetTabId, method, params) => {
    await chrome.debugger.sendCommand({ tabId: targetTabId }, method, params);
  },
  targetAvailable: async (targetTabId) => chrome.tabs.get(targetTabId).then(() => true).catch(() => false),
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

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId === undefined || !debuggerEventRefreshesViewport(method, params)) return;
  void refreshTargetViewport(source.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.status === "complete") {
    void refreshTargetViewport(tabId);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void refreshTargetViewport(tabId);
});

async function handleCommand(command: PageCommand, consumerTabId: number): Promise<{ ok: boolean } | InputResult> {
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

  const candidate = sessions.get(command.sessionId);
  const session = candidate?.nonce === command.nonce && candidate.consumerTabId === consumerTabId
    ? candidate
    : null;
  if (command.type === "INPUT") {
    const result = await dispatchInput(command, session);
    if (session) await persistSessions();
    return result;
  }
  if (!session) return { ok: false };
  if (command.type === "STOP") {
    await stopSession(session, true);
  } else if (command.type === "RELOAD") {
    await chrome.tabs.reload(session.targetTabId);
    await refreshViewport(session).catch(() => undefined);
  } else if (command.type === "BACK") {
    await chrome.tabs.goBack(session.targetTabId);
    await refreshViewport(session).catch(() => undefined);
  }
  return { ok: true };
}

async function activateCapture(session: HostSession) {
  try {
    const debuggee = { tabId: session.targetTabId };
    await chrome.debugger.attach(debuggee, "1.3");
    await chrome.debugger.sendCommand(debuggee, "Page.enable");
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

async function refreshTargetViewport(targetTabId: number) {
  await hydration;
  const session = [...sessions.values()].find((candidate) => (
    candidate.targetTabId === targetTabId && candidate.inputEnabled
  ));
  if (!session) return;
  await refreshViewport(session).then(persistSessions).catch(() => undefined);
}

async function refreshViewport(session: DispatchSession) {
  const result = await chrome.debugger.sendCommand({ tabId: session.targetTabId }, "Runtime.evaluate", {
    expression: "({width: window.innerWidth, height: window.innerHeight})",
    returnByValue: true,
  }) as { result?: { value?: { height?: number; width?: number } } };
  const height = result.result?.value?.height;
  const width = result.result?.value?.width;
  if (typeof height !== "number" || height <= 0 || typeof width !== "number" || width <= 0) {
    throw new Error("viewport unavailable");
  }
  session.viewport = {
    height,
    refreshedAt: Date.now(),
    revision: (session.viewport?.revision ?? 0) + 1,
    width,
  };
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
