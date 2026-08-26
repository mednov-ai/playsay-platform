import { useCallback, useEffect, useState } from "react";
import {
  fetchChatPushCapability,
  removeChatPushSubscription,
  upsertChatPushSubscription,
  type ChatPushCapability,
} from "../api/chatApi";

export type ChatPushStatus = "checking" | "disabled" | "enabled" | "denied" | "unsupported" | "unavailable" | "error";

const ownerStorageKey = "playsay.chat-push.owner.v1";

export function useChatPushSubscription(subject: string, locale: string) {
  const [status, setStatus] = useState<ChatPushStatus>("checking");
  const [capability, setCapability] = useState<ChatPushCapability | null>(null);

  useEffect(() => {
    let active = true;
    async function initialize() {
      if (!supportsChatPush()) {
        if (active) setStatus("unsupported");
        return;
      }
      try {
        const nextCapability = await fetchChatPushCapability();
        if (!active) return;
        setCapability(nextCapability);
        if (!nextCapability.available || !nextCapability.publicKey) {
          setStatus("unavailable");
          return;
        }
        if (Notification.permission === "denied") {
          setStatus("denied");
          return;
        }
        if (Notification.permission !== "granted") {
          setStatus("disabled");
          return;
        }
        const registration = await registerChatServiceWorker();
        const subscription = await registration.pushManager.getSubscription();
        if (!active) return;
        const owner = window.localStorage.getItem(ownerStorageKey);
        if (subscription && owner && owner !== subject) {
          await subscription.unsubscribe();
          window.localStorage.removeItem(ownerStorageKey);
          setStatus("disabled");
          return;
        }
        if (!subscription) {
          setStatus("disabled");
          return;
        }
        await registerSubscription(subscription, locale);
        window.localStorage.setItem(ownerStorageKey, subject);
        if (active) setStatus("enabled");
      } catch {
        if (active) setStatus("error");
      }
    }
    void initialize();
    return () => { active = false; };
  }, [locale, subject]);

  const enable = useCallback(async () => {
    if (!supportsChatPush()) {
      setStatus("unsupported");
      return;
    }
    setStatus("checking");
    try {
      const nextCapability = capability ?? await fetchChatPushCapability();
      setCapability(nextCapability);
      if (!nextCapability.available || !nextCapability.publicKey) {
        setStatus("unavailable");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "disabled");
        return;
      }
      const registration = await registerChatServiceWorker();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(nextCapability.publicKey),
      });
      await registerSubscription(subscription, locale);
      window.localStorage.setItem(ownerStorageKey, subject);
      setStatus("enabled");
    } catch {
      setStatus("error");
    }
  }, [capability, locale, subject]);

  const disable = useCallback(async () => {
    if (!supportsChatPush()) return;
    setStatus("checking");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removeChatPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      window.localStorage.removeItem(ownerStorageKey);
      setStatus("disabled");
    } catch {
      setStatus("error");
    }
  }, []);

  return { disable, enable, status };
}

export function supportsChatPush(): boolean {
  return typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

async function registerChatServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/chat-service-worker.js", { scope: "/", type: "module" });
}

async function registerSubscription(subscription: PushSubscription, locale: string): Promise<void> {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) throw new Error("subscription keys missing");
  await upsertChatPushSubscription({
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64Url(p256dh),
    auth: arrayBufferToBase64Url(auth),
    locale,
  });
}

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const decoded = window.atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function arrayBufferToBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
