// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatPushSubscription } from "./useChatPushSubscription";

const api = vi.hoisted(() => ({
  fetchChatPushCapability: vi.fn(),
  removeChatPushSubscription: vi.fn(),
  upsertChatPushSubscription: vi.fn(),
}));

vi.mock("../api/chatApi", () => api);

const endpoint = "https://push.example.test/browser";

describe("useChatPushSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorage();
    api.fetchChatPushCapability.mockResolvedValue({ available: true, publicKey: "BA" });
    api.removeChatPushSubscription.mockResolvedValue({ enabled: false });
    api.upsertChatPushSubscription.mockResolvedValue({ enabled: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "PushManager");
    Reflect.deleteProperty(window, "Notification");
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("does not request permission when the browser already denied it", async () => {
    const browser = installBrowserPush("denied", null);
    const { result } = renderHook(() => useChatPushSubscription("student", "en"));

    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(browser.requestPermission).not.toHaveBeenCalled();
    expect(browser.register).not.toHaveBeenCalled();
  });

  it("subscribes only from enable and removes both backend and browser subscription on disable", async () => {
    const subscription = pushSubscription();
    const browser = installBrowserPush("default", null, subscription);
    const { result } = renderHook(() => useChatPushSubscription("student", "fr"));
    await waitFor(() => expect(result.current.status).toBe("disabled"));

    await act(async () => {
      const enabling = result.current.enable();
      expect(browser.requestPermission).toHaveBeenCalledOnce();
      await enabling;
    });
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(browser.subscribe).toHaveBeenCalledOnce();
    expect(api.upsertChatPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint, locale: "fr" }));
    expect(result.current.status).toBe("enabled");

    browser.getSubscription.mockResolvedValue(subscription);
    await act(() => result.current.disable());
    expect(api.removeChatPushSubscription).toHaveBeenCalledWith(endpoint);
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("disabled");
  });

  it("unsubscribes a previous account before rebinding and refreshes locale for the current owner", async () => {
    const oldSubscription = pushSubscription();
    window.localStorage.setItem("playsay.chat-push.owner.v1", "old-user");
    const browser = installBrowserPush("granted", oldSubscription);
    const first = renderHook(() => useChatPushSubscription("new-user", "de"));
    await waitFor(() => expect(first.result.current.status).toBe("disabled"));
    expect(oldSubscription.unsubscribe).toHaveBeenCalledOnce();
    expect(api.upsertChatPushSubscription).not.toHaveBeenCalled();
    first.unmount();

    const currentSubscription = pushSubscription();
    window.localStorage.setItem("playsay.chat-push.owner.v1", "new-user");
    browser.getSubscription.mockResolvedValue(currentSubscription);
    const second = renderHook(() => useChatPushSubscription("new-user", "fr-FR"));
    await waitFor(() => expect(second.result.current.status).toBe("enabled"));
    expect(api.upsertChatPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ locale: "fr-FR" }));
  });
});

function installBrowserPush(
  initialPermission: NotificationPermission,
  existing: PushSubscription | null,
  created = pushSubscription(),
) {
  let permission = initialPermission;
  const requestPermission = vi.fn(async () => {
    permission = "granted";
    return permission;
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      get permission() { return permission; },
      requestPermission,
    },
  });
  Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
  const getSubscription = vi.fn(async () => existing);
  const subscribe = vi.fn(async () => created);
  const registration = { pushManager: { getSubscription, subscribe } } as unknown as ServiceWorkerRegistration;
  const register = vi.fn(async () => registration);
  const getRegistration = vi.fn(async () => registration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration, register, ready: Promise.resolve(registration) },
  });
  return { getSubscription, register, requestPermission, subscribe };
}

function pushSubscription(): PushSubscription {
  const p256dh = new Uint8Array(65).fill(1).buffer;
  const auth = new Uint8Array(16).fill(2).buffer;
  return {
    endpoint,
    getKey: vi.fn((name: PushEncryptionKeyName) => name === "p256dh" ? p256dh : auth),
    unsubscribe: vi.fn(async () => true),
  } as unknown as PushSubscription;
}

function installLocalStorage(): void {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
}
