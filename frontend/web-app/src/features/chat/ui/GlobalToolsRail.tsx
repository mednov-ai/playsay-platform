import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Dices,
  Loader2,
  MessageCircle,
  Search,
  Send,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import type { MeProfile } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import type { LessonDiceController, LessonDiceRoll } from "../../classroom";
import { consumePendingChatTarget, readPendingChatTarget } from "../model/chatDeepLink";
import {
  applyConversationSnapshot,
  applyReadReceipt,
  applyUnreadUpdate,
  totalUnreadCount,
  unreadCountFor,
  type ChatUnreadMap,
} from "../model/chatUnreadState";
import { useChatPushSubscription } from "../model/useChatPushSubscription";
import { matchesChatContact } from "../model/chatContactSearch";
import {
  createChatConversation,
  fetchChatContacts,
  fetchChatConversations,
  fetchChatMessages,
  markChatRead,
  openChatSocket,
  sendChatMessage,
  type ChatContact,
  type ChatConversation,
  type ChatMessage,
  type ChatRealtimeMessage,
} from "../api/chatApi";

type ConversationMessages = {
  items: ChatMessage[];
  loading: boolean;
  nextCursor: string | null;
};

type ChatToast = {
  conversationId: string;
  id: string;
  name: string;
  text: string;
};

const emptyMessages: ConversationMessages = { items: [], loading: false, nextCursor: null };

export type GlobalToolId = "chat" | "dice";

type GlobalToolDefinition = {
  id: GlobalToolId;
  label: string;
  icon: ReactNode;
  badge?: ReactNode;
};

export function GlobalToolsRail({
  classroomDice,
  profile,
}: {
  classroomDice?: LessonDiceController;
  profile: MeProfile;
}) {
  const { i18n, t } = useAppTranslation();
  const [activeTool, setActiveTool] = useState<GlobalToolId | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [unreadByConversation, setUnreadByConversation] = useState<ChatUnreadMap>({});
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ConversationMessages>>({});
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactsFailed, setContactsFailed] = useState(false);
  const [conversationsFailed, setConversationsFailed] = useState(false);
  const [toast, setToast] = useState<ChatToast | null>(null);
  const [diceNow, setDiceNow] = useState(() => Date.now());
  const [visibleDiceRoll, setVisibleDiceRoll] = useState<LessonDiceRoll | null>(null);
  const chatTriggerRef = useRef<HTMLButtonElement>(null);
  const diceTriggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const chatOpen = activeTool === "chat";
  const diceOpen = activeTool === "dice";
  const openRef = useRef(chatOpen);
  const activeConversationIdRef = useRef(activeConversationId);
  const messagesRef = useRef(messagesByConversation);
  const conversationsRef = useRef(conversations);
  const recoveryInFlightRef = useRef<Promise<ChatConversation[]> | null>(null);
  const recoveryPendingRef = useRef(false);
  const initialChatTargetRef = useRef(readPendingChatTarget());
  const chatPush = useChatPushSubscription(profile.subject, i18n.language);

  useEffect(() => {
    openRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    messagesRef.current = messagesByConversation;
  }, [messagesByConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const refreshConversations = useCallback((): Promise<ChatConversation[]> => {
    if (recoveryInFlightRef.current) {
      recoveryPendingRef.current = true;
      return recoveryInFlightRef.current;
    }
    const run = async () => {
      let latest: ChatConversation[] = [];
      do {
        recoveryPendingRef.current = false;
        latest = await fetchChatConversations();
        setConversations(latest);
        setConversationsFailed(false);
        setUnreadByConversation((current) => applyConversationSnapshot(current, latest));
      } while (recoveryPendingRef.current);
      return latest;
    };
    const promise = run().catch((error: unknown) => {
      setConversationsFailed(true);
      throw error;
    });
    recoveryInFlightRef.current = promise;
    const clearRecovery = () => {
      if (recoveryInFlightRef.current === promise) recoveryInFlightRef.current = null;
    };
    void promise.then(clearRecovery, clearRecovery);
    return promise;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      fetchChatContacts().then((nextContacts) => {
        if (active) { setContacts(nextContacts); setContactsFailed(false); }
      }).catch(() => { if (active) setContactsFailed(true); }),
      refreshConversations(),
    ])
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [profile.subject, refreshConversations, t]);

  const markVisibleConversationRead = useCallback(async (conversationId: string, items?: ChatMessage[]) => {
    if (!openRef.current || activeConversationIdRef.current !== conversationId || document.visibilityState !== "visible") return;
    const visibleItems = items ?? messagesRef.current[conversationId]?.items ?? [];
    const latest = visibleItems[visibleItems.length - 1];
    if (!latest || latest.senderSubject === profile.subject) return;
    try {
      const receipt = await markChatRead(conversationId, latest.id);
      setUnreadByConversation((current) => applyReadReceipt(current, receipt));
    } catch {
      void refreshConversations().catch(() => undefined);
    }
  }, [profile.subject, refreshConversations]);

  const loadMessages = useCallback(async (conversationId: string, older = false) => {
    const current = messagesRef.current[conversationId] ?? emptyMessages;
    if (current.loading || (older && !current.nextCursor)) return;
    setMessagesByConversation((all) => ({
      ...all,
      [conversationId]: { ...(all[conversationId] ?? emptyMessages), loading: true },
    }));
    try {
      const page = await fetchChatMessages(conversationId, older ? current.nextCursor : null);
      const previous = messagesRef.current[conversationId]?.items ?? [];
      const visibleItems = older ? mergeMessages(page.items, previous) : mergeMessages(previous, page.items);
      setMessagesByConversation((all) => ({
        ...all,
        [conversationId]: { items: visibleItems, loading: false, nextCursor: page.nextCursor },
      }));
      if (openRef.current && activeConversationIdRef.current === conversationId) {
        void markVisibleConversationRead(conversationId, visibleItems);
      }
    } catch {
      setMessagesByConversation((all) => ({
        ...all,
        [conversationId]: { ...(all[conversationId] ?? emptyMessages), loading: false },
      }));
      setError(t("chat.errors.messages"));
    }
  }, [markVisibleConversationRead, t]);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    async function connect() {
      const nextSocket = await openChatSocket();
      if (stopped || !nextSocket) return;
      socket = nextSocket;
      nextSocket.onmessage = (event) => {
        let realtime: ChatRealtimeMessage;
        try {
          realtime = JSON.parse(event.data as string) as ChatRealtimeMessage;
        } catch {
          return;
        }
        if (realtime.type === "chat.message.created" && realtime.message) {
          const incoming = realtime.message;
          setMessagesByConversation((all) => {
            const state = all[incoming.conversationId];
            if (!state) return all;
            return {
              ...all,
              [incoming.conversationId]: { ...state, items: mergeMessages(state.items, [incoming]) },
            };
          });
          const isVisible = openRef.current && activeConversationIdRef.current === incoming.conversationId;
          if (incoming.senderSubject !== profile.subject && isVisible) {
            void markVisibleConversationRead(incoming.conversationId, [
              ...(messagesRef.current[incoming.conversationId]?.items ?? []),
              incoming,
            ]);
          } else if (incoming.senderSubject !== profile.subject) {
            const conversation = conversationsRef.current.find((item) => item.id === incoming.conversationId);
            setToast({
              conversationId: incoming.conversationId,
              id: incoming.id,
              name: conversation?.counterpart.displayName ?? t("chat.toast.title"),
              text: incoming.text,
            });
          }
          void refreshConversations().catch(() => undefined);
        }
        if (realtime.type === "chat.unread.changed" && realtime.unread) {
          const unread = realtime.unread;
          setUnreadByConversation((current) => applyUnreadUpdate(current, unread));
          if (!conversationsRef.current.some((conversation) => conversation.id === unread.conversationId)) {
            void refreshConversations().catch(() => undefined);
          }
        }
        if (realtime.type === "chat.conversation.read" && realtime.receipt) {
          const receipt = realtime.receipt;
          if (receipt.readerSubject === profile.subject) {
            setUnreadByConversation((current) => applyReadReceipt(current, receipt));
          }
          setMessagesByConversation((all) => {
            const state = all[receipt.conversationId];
            if (!state || receipt.readerSubject === profile.subject) return all;
            return {
              ...all,
              [receipt.conversationId]: {
                ...state,
                items: state.items.map((message) => (
                  message.senderSubject === profile.subject && message.createdAt <= receipt.readAt
                    ? { ...message, readAt: receipt.readAt }
                    : message
                )),
              },
            };
          });
        }
        if (realtime.type === "chat.messages.delivered" && realtime.delivery) {
          const delivery = realtime.delivery;
          const deliveredIds = new Set(delivery.messageIds);
          setMessagesByConversation((all) => {
            const state = all[delivery.conversationId];
            if (!state) return all;
            return {
              ...all,
              [delivery.conversationId]: {
                ...state,
                items: state.items.map((message) => (
                  deliveredIds.has(message.id) ? { ...message, deliveredAt: delivery.deliveredAt } : message
                )),
              },
            };
          });
        }
      };
      nextSocket.onerror = () => nextSocket.close();
      nextSocket.onclose = () => {
        if (stopped) return;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          void refreshConversations().catch(() => undefined);
          void connect();
        }, 2_000);
      };
    }

    void connect();
    return () => {
      stopped = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [markVisibleConversationRead, profile.subject, refreshConversations, t]);

  useEffect(() => {
    function reconcileFromServiceWorker(event: MessageEvent) {
      if (event.data?.type !== "chat.push.received") return;
      void refreshConversations().catch(() => undefined);
    }
    navigator.serviceWorker?.addEventListener("message", reconcileFromServiceWorker);
    return () => navigator.serviceWorker?.removeEventListener("message", reconcileFromServiceWorker);
  }, [refreshConversations]);

  useEffect(() => {
    function markReadWhenVisible() {
      const conversationId = activeConversationIdRef.current;
      if (document.visibilityState === "visible" && openRef.current && conversationId) {
        void markVisibleConversationRead(conversationId);
      }
    }
    document.addEventListener("visibilitychange", markReadWhenVisible);
    return () => document.removeEventListener("visibilitychange", markReadWhenVisible);
  }, [markVisibleConversationRead]);

  useEffect(() => {
    if (loading) return;
    const target = initialChatTargetRef.current;
    if (!target) return;
    initialChatTargetRef.current = null;
    setActiveTool("chat");
    setToast(null);
    const conversation = target === "open" ? null : conversations.find((item) => item.id === target);
    if (conversation) {
      setActiveConversationId(conversation.id);
      void loadMessages(conversation.id);
    }
    consumePendingChatTarget();
  }, [conversations, loadMessages, loading]);

  useEffect(() => {
    if (!activeTool) return undefined;
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-tool-autofocus], button, input, textarea")?.focus();
    });
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [activeTool]);

  useEffect(() => {
    if (classroomDice || activeTool !== "dice") return;
    setActiveTool(null);
  }, [activeTool, classroomDice]);

  const cooldownUntilMs = Math.max(
    Date.parse(classroomDice?.lastRoll?.cooldownUntil ?? "") || 0,
    Date.parse(classroomDice?.rejection?.retryAt ?? "") || 0,
  );
  const diceCoolingDown = cooldownUntilMs > diceNow;
  const visibleDiceRejection = classroomDice?.rejection &&
    (classroomDice.rejection.code !== "COOLDOWN" || diceCoolingDown)
    ? classroomDice.rejection
    : null;

  useEffect(() => {
    setDiceNow(Date.now());
    if (!cooldownUntilMs || cooldownUntilMs <= Date.now()) return undefined;
    const timer = window.setTimeout(() => setDiceNow(Date.now()), cooldownUntilMs - Date.now() + 20);
    return () => window.clearTimeout(timer);
  }, [cooldownUntilMs]);

  useEffect(() => {
    const liveRoll = classroomDice?.liveRoll ?? null;
    if (!liveRoll) {
      setVisibleDiceRoll(null);
      return undefined;
    }
    setVisibleDiceRoll(liveRoll);
    const timer = window.setTimeout(() => setVisibleDiceRoll(null), 2_100);
    return () => window.clearTimeout(timer);
  }, [classroomDice?.liveRoll?.eventId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const activeMessages = activeConversationId
    ? messagesByConversation[activeConversationId] ?? emptyMessages
    : emptyMessages;
  const unreadCount = totalUnreadCount(unreadByConversation);
  const diceValue = classroomDice?.lastRoll?.value ?? null;
  const diceLabel = diceValue === null
    ? t("dice.roll")
    : diceCoolingDown
      ? t("dice.aria.valueCooling", { value: diceValue })
      : t("dice.aria.value", { value: diceValue });
  const toolDefinitions: Record<GlobalToolId, GlobalToolDefinition> = {
    chat: {
      id: "chat",
      label: t("chat.open"),
      icon: <MessageCircle aria-hidden="true" />,
      badge: unreadCount > 0 ? <span className="playsay-tools-badge">{compactCount(unreadCount)}</span> : undefined,
    },
    dice: {
      id: "dice",
      label: diceLabel,
      icon: diceValue === null ? <Dices aria-hidden="true" /> : <DiceFaceIcon value={diceValue} />,
    },
  };
  const tools = availableGlobalToolIds(Boolean(classroomDice)).map((toolId) => toolDefinitions[toolId]);
  const query = search.trim().toLocaleLowerCase(i18n.language);
  const filteredConversations = useMemo(() => conversations.filter((conversation) => (
    matchesChatContact(conversation.counterpart, query, i18n.language)
  )), [conversations, i18n.language, query]);
  const conversationSubjects = useMemo(
    () => new Set(conversations.map((conversation) => conversation.counterpart.subject)),
    [conversations],
  );
  const availableContacts = useMemo(() => contacts.filter((contact) => (
    !conversationSubjects.has(contact.subject) &&
    matchesChatContact(contact, query, i18n.language)
  )), [contacts, conversationSubjects, i18n.language, query]);

  function toggleTool(toolId: GlobalToolId) {
    const next = activeTool === toolId ? null : toolId;
    setActiveTool(next);
    if (next === "chat") void refreshConversations().catch(() => undefined);
    if (next === "chat" && !activeConversationIdRef.current && conversationsRef.current.length === 1) {
      void selectConversation(conversationsRef.current[0].id);
    }
    if (next === "chat") setToast(null);
  }

  function closePanel() {
    const trigger = activeTool === "dice" ? diceTriggerRef.current : chatTriggerRef.current;
    setActiveTool(null);
    window.requestAnimationFrame(() => trigger?.focus());
  }

  function trapPanelFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    ) ?? [])].filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function selectConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    activeConversationIdRef.current = conversationId;
    setDraft("");
    setError(null);
    await loadMessages(conversationId);
  }

  async function startConversation(contact: ChatContact) {
    setLoading(true);
    setError(null);
    try {
      const conversation = await createChatConversation(contact.subject);
      setConversations((current) => sortConversations(upsertConversation(current, conversation)));
      setUnreadByConversation((current) => applyConversationSnapshot(current, [conversation]));
      await selectConversation(conversation.id);
    } catch {
      setError(t("chat.errors.create"));
    } finally {
      setLoading(false);
    }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeConversationId || sending) return;
    const text = draft.trim();
    if (!text) return;
    const clientMessageId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: `optimistic:${clientMessageId}`,
      conversationId: activeConversationId,
      senderSubject: profile.subject,
      clientMessageId,
      text,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      readAt: null,
    };
    setDraft("");
    setSending(true);
    setError(null);
    setMessagesByConversation((all) => ({
      ...all,
      [activeConversationId]: {
        ...(all[activeConversationId] ?? emptyMessages),
        items: mergeMessages(all[activeConversationId]?.items ?? [], [optimistic]),
      },
    }));
    try {
      const saved = await sendChatMessage(activeConversationId, clientMessageId, text);
      setMessagesByConversation((all) => ({
        ...all,
        [activeConversationId]: {
          ...(all[activeConversationId] ?? emptyMessages),
          items: (all[activeConversationId]?.items ?? []).map((message) => (
            message.clientMessageId === clientMessageId ? saved : message
          )),
        },
      }));
      void refreshConversations().catch(() => undefined);
    } catch {
      setMessagesByConversation((all) => ({
        ...all,
        [activeConversationId]: {
          ...(all[activeConversationId] ?? emptyMessages),
          items: (all[activeConversationId]?.items ?? []).filter((message) => message.clientMessageId !== clientMessageId),
        },
      }));
      setDraft(text);
      setError(t("chat.errors.send"));
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  useEffect(() => {
    if (!chatOpen || !activeConversationId) return;
    messageEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeConversationId, activeMessages.items.length, chatOpen]);

  return (
    <>
      <aside aria-label={t("chat.toolsAria")} className="playsay-tools-rail">
        {tools.map((tool) => (
          <button
            aria-expanded={activeTool === tool.id}
            aria-label={tool.label}
            className="playsay-tools-button"
            data-active={activeTool === tool.id ? "true" : "false"}
            data-tool={tool.id}
            key={tool.id}
            onClick={() => toggleTool(tool.id)}
            ref={tool.id === "chat" ? chatTriggerRef : diceTriggerRef}
            title={tool.label}
            type="button"
          >
            {tool.icon}
            {tool.badge}
          </button>
        ))}
      </aside>

      {chatOpen ? (
        <section
          aria-label={t("chat.title")}
          className="playsay-chat-panel"
          onKeyDown={trapPanelFocus}
          ref={panelRef}
          role="dialog"
        >
          <header className="playsay-chat-header">
            {activeConversation ? (
              <button aria-label={t("chat.back")} className="playsay-chat-icon-button" onClick={() => setActiveConversationId(null)} type="button">
                <ArrowLeft aria-hidden="true" />
              </button>
            ) : <MessageCircle aria-hidden="true" className="playsay-chat-header-icon" />}
            <div className="min-w-0 flex-1">
              <h2>{activeConversation?.counterpart.displayName ?? t("chat.title")}</h2>
              <p>{activeConversation ? t(`chat.roles.${activeConversation.counterpart.role.toLowerCase()}`) : t("chat.subtitle")}</p>
            </div>
            <button
              aria-label={pushControlLabel(chatPush.status, t)}
              aria-pressed={chatPush.status === "enabled"}
              className="playsay-chat-icon-button"
              data-state={chatPush.status}
              disabled={["checking", "denied", "unsupported", "unavailable"].includes(chatPush.status)}
              onClick={() => void (chatPush.status === "enabled" ? chatPush.disable() : chatPush.enable())}
              title={pushControlLabel(chatPush.status, t)}
              type="button"
            >
              {chatPush.status === "checking"
                ? <Loader2 aria-hidden="true" className="animate-spin" />
                : chatPush.status === "enabled"
                  ? <Bell aria-hidden="true" />
                  : <BellOff aria-hidden="true" />}
            </button>
            <button aria-label={t("common.actions.close")} className="playsay-chat-icon-button" onClick={closePanel} type="button">
              <X aria-hidden="true" />
            </button>
          </header>

          {error ? <p className="playsay-chat-error" role="alert">{error}</p> : null}
          {contactsFailed || conversationsFailed ? (
            <div className="playsay-chat-error" role="alert">
              <p>{t(contactsFailed ? "chat.errors.contacts" : "chat.errors.conversations")}</p>
              <button type="button" onClick={() => {
                if (contactsFailed) void fetchChatContacts().then((items) => {
                  setContacts(items); setContactsFailed(false);
                }).catch(() => setContactsFailed(true));
                if (conversationsFailed) void refreshConversations().catch(() => undefined);
              }}>{t("chat.retry")}</button>
            </div>
          ) : null}
          {!["checking", "enabled", "disabled"].includes(chatPush.status) ? (
            <p className="playsay-chat-notification-status" role="status">
              {pushControlLabel(chatPush.status, t)}
              {chatPush.status === "denied" ? ` ${t("chat.notifications.browserSettings")}` : null}
              {["error", "unavailable", "denied"].includes(chatPush.status) ? (
                <button type="button" onClick={chatPush.refresh}>{t("chat.retry")}</button>
              ) : null}
            </p>
          ) : null}

          {activeConversation ? (
            <div className="playsay-chat-conversation">
              <div aria-live="polite" className="playsay-chat-messages">
                {activeMessages.nextCursor ? (
                  <button
                    className="playsay-chat-load-older"
                    disabled={activeMessages.loading}
                    onClick={() => void loadMessages(activeConversation.id, true)}
                    type="button"
                  >
                    {activeMessages.loading ? <Loader2 className="animate-spin" /> : null}
                    {t("chat.loadOlder")}
                  </button>
                ) : null}
                {activeMessages.loading && activeMessages.items.length === 0 ? <ChatLoading label={t("common.status.loading")} /> : null}
                {!activeMessages.loading && activeMessages.items.length === 0 ? (
                  <div className="playsay-chat-empty playsay-chat-empty-compact">
                    <MessageCircle aria-hidden="true" />
                    <p>{t("chat.emptyMessages")}</p>
                  </div>
                ) : null}
                {activeMessages.items.map((message) => {
                  const own = message.senderSubject === profile.subject;
                  const status = messageStatus(message);
                  return (
                    <article className="playsay-chat-message" data-own={own ? "true" : "false"} key={message.id}>
                      <p>{message.text}</p>
                      <footer>
                        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt, i18n.language)}</time>
                        {own ? (
                          status === "sending"
                            ? <Loader2 aria-label={t("chat.sending")} className="animate-spin" data-state="sending" />
                            : status === "read"
                              ? <CheckCheck aria-label={t("chat.read")} data-state="read" />
                              : status === "delivered"
                                ? <CheckCheck aria-label={t("chat.delivered")} data-state="delivered" />
                                : <Check aria-label={t("chat.sent")} data-state="sent" />
                        ) : null}
                      </footer>
                    </article>
                  );
                })}
                <div ref={messageEndRef} />
              </div>
              <form className="playsay-chat-composer" onSubmit={(event) => void submitMessage(event)}>
                <textarea
                  aria-label={t("chat.composerAria")}
                  maxLength={4000}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={t("chat.placeholder")}
                  rows={1}
                  value={draft}
                />
                <button aria-label={t("chat.send")} disabled={sending || !draft.trim()} type="submit">
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                </button>
              </form>
            </div>
          ) : (
            <div className="playsay-chat-list-view">
              <label className="playsay-chat-search">
                <Search aria-hidden="true" />
                <span className="sr-only">{t("chat.search")}</span>
                <input onChange={(event) => setSearch(event.target.value)} placeholder={t("chat.search")} type="search" value={search} />
              </label>
              {loading ? <ChatLoading label={t("common.status.loading")} /> : null}
              {!loading && !contactsFailed && !conversationsFailed && filteredConversations.length === 0 && availableContacts.length === 0 ? (
                <div className="playsay-chat-empty">
                  <MessageCircle aria-hidden="true" />
                  <h3>{t("chat.emptyTitle")}</h3>
                  <p>{t("chat.emptyBody")}</p>
                </div>
              ) : null}
              {filteredConversations.length > 0 ? (
                <div className="playsay-chat-list">
                  {filteredConversations.map((conversation) => (
                    <button key={conversation.id} onClick={() => void selectConversation(conversation.id)} type="button">
                      <ChatAvatar contact={conversation.counterpart} />
                      <span className="playsay-chat-list-copy">
                        <strong>{conversation.counterpart.displayName}</strong>
                        <small>{conversation.lastMessage?.text ?? t("chat.noMessages")}</small>
                      </span>
                      <span className="playsay-chat-list-meta">
                        {conversation.lastMessage ? <time>{formatConversationTime(conversation.lastMessage.createdAt, i18n.language)}</time> : null}
                        {unreadCountFor(unreadByConversation, conversation) > 0
                          ? <b>{compactCount(unreadCountFor(unreadByConversation, conversation))}</b>
                          : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {availableContacts.length > 0 ? (
                <div className="playsay-chat-contacts">
                  <h3>{t("chat.newConversation")}</h3>
                  {availableContacts.map((contact) => (
                    <button disabled={loading} key={contact.subject} onClick={() => void startConversation(contact)} type="button">
                      <ChatAvatar contact={contact} />
                      <span>
                        <strong>{contact.displayName}</strong>
                        <small>{t(`chat.roles.${contact.role.toLowerCase()}`)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {diceOpen && classroomDice ? (
        <section
          aria-label={t("dice.title")}
          className="playsay-tool-panel playsay-dice-panel"
          onKeyDown={trapPanelFocus}
          ref={panelRef}
          role="dialog"
        >
          <header className="playsay-tool-panel-header">
            <DiceFaceIcon value={diceValue} />
            <div>
              <h2>{t("dice.title")}</h2>
              <p>{t("dice.subtitle")}</p>
            </div>
            <button aria-label={t("common.actions.close")} onClick={closePanel} type="button">
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="playsay-dice-panel-body">
            <p>{classroomDice.lastRoll
              ? t("dice.lastRoller", { name: classroomDice.lastRoll.rollerName })
              : t("dice.empty")}</p>
            {visibleDiceRejection ? (
              <p className="playsay-dice-error" role="alert">
                {t(`dice.errors.${visibleDiceRejection.code}`)}
              </p>
            ) : null}
            <button
              className="playsay-dice-roll-button"
              data-tool-autofocus
              disabled={diceCoolingDown}
              onClick={classroomDice.roll}
              type="button"
            >
              {diceCoolingDown ? t("dice.cooldown") : t("dice.roll")}
            </button>
          </div>
        </section>
      ) : null}

      {visibleDiceRoll ? (
        <div
          aria-atomic="true"
          aria-live="assertive"
          className="playsay-dice-reveal"
          key={visibleDiceRoll.eventId}
          role="status"
        >
          <div className="playsay-dice-reveal-face">
            <DiceFaceIcon value={visibleDiceRoll.value} />
          </div>
          <p aria-hidden="true">{t("dice.rolledBy", { name: visibleDiceRoll.rollerName })}</p>
          <span className="sr-only">
            {t("dice.result", { name: visibleDiceRoll.rollerName, value: visibleDiceRoll.value })}
          </span>
        </div>
      ) : null}

      {toast ? (
        <div className="playsay-chat-toast" role="status">
          <button className="playsay-chat-toast-open" onClick={() => {
            setActiveTool("chat");
            setToast(null);
            void selectConversation(toast.conversationId);
          }} type="button">
            <MessageCircle aria-hidden="true" />
            <span><strong>{toast.name}</strong><small>{toast.text}</small></span>
          </button>
          <button aria-label={t("common.actions.close")} className="playsay-chat-toast-close" onClick={() => setToast(null)} type="button">
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}

export function DiceFaceIcon({ value }: { value: LessonDiceRoll["value"] | null }) {
  return (
    <svg aria-hidden="true" className="playsay-dice-face-icon" viewBox="0 0 24 24">
      <rect height="19" rx="4.5" width="19" x="2.5" y="2.5" />
      {dicePips(value).map(([x, y]) => <circle cx={x} cy={y} key={`${x}-${y}`} r="1.65" />)}
    </svg>
  );
}

export function availableGlobalToolIds(hasClassroomDice: boolean): GlobalToolId[] {
  return hasClassroomDice ? ["chat", "dice"] : ["chat"];
}

export function dicePips(value: LessonDiceRoll["value"] | null): Array<[number, number]> {
  const positions = {
    topLeft: [7, 7] as [number, number],
    topRight: [17, 7] as [number, number],
    middleLeft: [7, 12] as [number, number],
    center: [12, 12] as [number, number],
    middleRight: [17, 12] as [number, number],
    bottomLeft: [7, 17] as [number, number],
    bottomRight: [17, 17] as [number, number],
  };
  switch (value) {
    case 1: return [positions.center];
    case 2: return [positions.topLeft, positions.bottomRight];
    case 3: return [positions.topLeft, positions.center, positions.bottomRight];
    case 4: return [positions.topLeft, positions.topRight, positions.bottomLeft, positions.bottomRight];
    case 5: return [positions.topLeft, positions.topRight, positions.center, positions.bottomLeft, positions.bottomRight];
    case 6: return [
      positions.topLeft,
      positions.middleLeft,
      positions.bottomLeft,
      positions.topRight,
      positions.middleRight,
      positions.bottomRight,
    ];
    default: return [];
  }
}

function ChatAvatar({ contact }: { contact: ChatContact }) {
  return <span aria-hidden="true" className="playsay-chat-avatar">{contact.displayName.slice(0, 1).toLocaleUpperCase()}</span>;
}

function ChatLoading({ label }: { label: string }) {
  return <div className="playsay-chat-loading" role="status"><Loader2 className="animate-spin" />{label}</div>;
}

export function mergeMessages(first: ChatMessage[], second: ChatMessage[]): ChatMessage[] {
  const byClientId = new Map<string, ChatMessage>();
  [...first, ...second].forEach((message) => {
    const existing = byClientId.get(message.clientMessageId);
    if (!existing || existing.id.startsWith("optimistic:")) byClientId.set(message.clientMessageId, message);
  });
  return [...byClientId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function messageStatus(message: ChatMessage): "sending" | "sent" | "delivered" | "read" {
  if (message.id.startsWith("optimistic:")) return "sending";
  if (message.readAt) return "read";
  if (message.deliveredAt) return "delivered";
  return "sent";
}

function upsertConversation(current: ChatConversation[], conversation: ChatConversation): ChatConversation[] {
  return current.some((item) => item.id === conversation.id)
    ? current.map((item) => item.id === conversation.id ? conversation : item)
    : [conversation, ...current];
}

function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((left, right) => {
    const leftAt = left.lastMessage?.createdAt ?? left.createdAt;
    const rightAt = right.lastMessage?.createdAt ?? right.createdAt;
    return rightAt.localeCompare(leftAt);
  });
}

function compactCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}

function pushControlLabel(status: ReturnType<typeof useChatPushSubscription>["status"], t: TFunction): string {
  if (status === "enabled") return t("chat.notifications.disable");
  if (status === "disabled") return t("chat.notifications.enable");
  return t(`chat.notifications.${status === "checking" ? "pending" : status}`);
}

function formatMessageTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatConversationTime(value: string, locale: string): string {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? formatMessageTime(value, locale)
    : new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(date);
}
