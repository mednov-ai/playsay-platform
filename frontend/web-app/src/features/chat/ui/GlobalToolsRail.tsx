import {
  ArrowLeft,
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  Search,
  Send,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeProfile } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { consumePendingChatTarget, readPendingChatTarget } from "../model/chatDeepLink";
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

export function GlobalToolsRail({ profile }: { profile: MeProfile }) {
  const { i18n, t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ConversationMessages>>({});
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ChatToast | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const activeConversationIdRef = useRef(activeConversationId);
  const messagesRef = useRef(messagesByConversation);
  const conversationsRef = useRef(conversations);
  const initialChatTargetRef = useRef(readPendingChatTarget());

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    messagesRef.current = messagesByConversation;
  }, [messagesByConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const refreshConversations = useCallback(async () => {
    const next = await fetchChatConversations();
    setConversations(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchChatContacts(), fetchChatConversations()])
      .then(([nextContacts, nextConversations]) => {
        if (!active) return;
        setContacts(nextContacts);
        setConversations(nextConversations);
      })
      .catch(() => active && setError(t("chat.errors.load")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [profile.subject, t]);

  const markVisibleConversationRead = useCallback(async (conversationId: string, items?: ChatMessage[]) => {
    const visibleItems = items ?? messagesRef.current[conversationId]?.items ?? [];
    const latest = visibleItems[visibleItems.length - 1];
    if (!latest || latest.senderSubject === profile.subject) return;
    try {
      await markChatRead(conversationId, latest.id);
      setConversations((current) => current.map((conversation) => (
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
      )));
    } catch {
      // A later refresh reconciles the badge; reading the chat itself remains available.
    }
  }, [profile.subject]);

  const loadMessages = useCallback(async (conversationId: string, older = false) => {
    const current = messagesRef.current[conversationId] ?? emptyMessages;
    if (current.loading || (older && !current.nextCursor)) return;
    setMessagesByConversation((all) => ({
      ...all,
      [conversationId]: { ...(all[conversationId] ?? emptyMessages), loading: true },
    }));
    try {
      const page = await fetchChatMessages(conversationId, older ? current.nextCursor : null);
      let visibleItems: ChatMessage[] = [];
      setMessagesByConversation((all) => {
        const previous = all[conversationId]?.items ?? [];
        visibleItems = older ? mergeMessages(page.items, previous) : mergeMessages(previous, page.items);
        return {
          ...all,
          [conversationId]: { items: visibleItems, loading: false, nextCursor: page.nextCursor },
        };
      });
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
          void refreshConversations();
        }
        if (realtime.type === "chat.conversation.read" && realtime.receipt) {
          const receipt = realtime.receipt;
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
    if (loading) return;
    const target = initialChatTargetRef.current;
    if (!target) return;
    initialChatTargetRef.current = null;
    setOpen(true);
    setToast(null);
    const conversation = target === "open" ? null : conversations.find((item) => item.id === target);
    if (conversation) {
      setActiveConversationId(conversation.id);
      void loadMessages(conversation.id);
    }
    consumePendingChatTarget();
  }, [conversations, loadMessages, loading]);

  useEffect(() => {
    if (!open) return undefined;
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("button, input, textarea")?.focus();
    });
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const activeMessages = activeConversationId
    ? messagesByConversation[activeConversationId] ?? emptyMessages
    : emptyMessages;
  const unreadCount = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
  const query = search.trim().toLocaleLowerCase(i18n.language);
  const filteredConversations = useMemo(() => conversations.filter((conversation) => (
    !query || conversation.counterpart.displayName.toLocaleLowerCase(i18n.language).includes(query)
  )), [conversations, i18n.language, query]);
  const conversationSubjects = useMemo(
    () => new Set(conversations.map((conversation) => conversation.counterpart.subject)),
    [conversations],
  );
  const availableContacts = useMemo(() => contacts.filter((contact) => (
    !conversationSubjects.has(contact.subject) &&
    (!query || contact.displayName.toLocaleLowerCase(i18n.language).includes(query))
  )), [contacts, conversationSubjects, i18n.language, query]);

  function togglePanel() {
    const next = !open;
    setOpen(next);
    if (next && !activeConversationIdRef.current && conversationsRef.current.length === 1) {
      void selectConversation(conversationsRef.current[0].id);
    }
    setToast(null);
  }

  function closePanel() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
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
    setDraft("");
    setError(null);
    if (!messagesRef.current[conversationId]) await loadMessages(conversationId);
    else void markVisibleConversationRead(conversationId);
  }

  async function startConversation(contact: ChatContact) {
    setLoading(true);
    setError(null);
    try {
      const conversation = await createChatConversation(contact.subject);
      setConversations((current) => sortConversations(upsertConversation(current, conversation)));
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
      void refreshConversations();
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
    if (!open || !activeConversationId) return;
    messageEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeConversationId, activeMessages.items.length, open]);

  return (
    <>
      <aside aria-label={t("chat.toolsAria")} className="playsay-tools-rail">
        <button
          aria-expanded={open}
          aria-label={t("chat.open")}
          className="playsay-tools-button"
          data-active={open ? "true" : "false"}
          onClick={togglePanel}
          ref={triggerRef}
          title={t("chat.open")}
          type="button"
        >
          <MessageCircle aria-hidden="true" />
          {unreadCount > 0 ? <span className="playsay-tools-badge">{compactCount(unreadCount)}</span> : null}
        </button>
      </aside>

      {open ? (
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
            <button aria-label={t("common.actions.close")} className="playsay-chat-icon-button" onClick={closePanel} type="button">
              <X aria-hidden="true" />
            </button>
          </header>

          {error ? <p className="playsay-chat-error" role="alert">{error}</p> : null}

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
              {!loading && filteredConversations.length === 0 && availableContacts.length === 0 ? (
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
                        {conversation.unreadCount > 0 ? <b>{compactCount(conversation.unreadCount)}</b> : null}
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

      {toast ? (
        <div className="playsay-chat-toast" role="status">
          <button className="playsay-chat-toast-open" onClick={() => {
            setOpen(true);
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
