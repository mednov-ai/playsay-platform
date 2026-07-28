import { ArrowLeft, BookOpen, BookPlus, ChevronDown, History, Play, RotateCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "../../../components/ui/button";
import {
  fetchVocabularyOverview,
  openVocabularySocket,
  type CreateVocabularyEntry,
  type VocabularyEntry,
  type VocabularyRealtimeMessage,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { VocabularyEntryDialog } from "./VocabularyEntryDialog";

type MenuView = "actions" | "recent";

export function VocabularyLessonMenu({
  ownerLabel,
  ownerSubject,
  onStartPractice,
  recipientSubjects = [],
  source,
  triggerClassName = "mt-2",
  triggerLabelClassName,
}: {
  ownerLabel?: string;
  ownerSubject?: string;
  onStartPractice?: () => void;
  recipientSubjects?: string[];
  source: Omit<CreateVocabularyEntry, "sourceText">;
  triggerClassName?: string;
  triggerLabelClassName?: string;
}) {
  const { t } = useAppTranslation();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const recentBackRef = useRef<HTMLButtonElement>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<MenuView>("actions");
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);

  const refreshOverview = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const overview = await fetchVocabularyOverview(ownerSubject, source.lessonId, 5);
      setEntries([...overview.lessonEntries, ...overview.recentEntries].slice(0, 5));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [ownerSubject, source.lessonId]);

  useEffect(() => {
    setEntries([]);
    setLoadError(false);
    if (view === "recent" && open) void refreshOverview();
  }, [open, ownerSubject, refreshOverview, view]);

  useEffect(() => {
    if (!ownerSubject || !source.lessonId) return undefined;
    let stopped = false;
    let socket: WebSocket | null = null;

    async function connect() {
      const nextSocket = await openVocabularySocket();
      if (stopped || !nextSocket) return;
      socket = nextSocket;
      nextSocket.onopen = () => {
        setReconnecting(false);
        nextSocket.send(JSON.stringify({
          type: "vocabulary.subscribe",
          ownerSubject,
          lessonId: source.lessonId,
        }));
      };
      nextSocket.onmessage = (event) => {
        let message: VocabularyRealtimeMessage;
        try {
          message = JSON.parse(event.data as string) as VocabularyRealtimeMessage;
        } catch {
          return;
        }
        if (message.type?.startsWith("vocabulary.entry.")) {
          setHighlightedEntryId(message.entry?.id ?? null);
          void refreshOverview();
        }
        if (message.type === "vocabulary.subscribed") void refreshOverview();
      };
      nextSocket.onerror = () => nextSocket.close();
      nextSocket.onclose = () => {
        if (stopped) return;
        setReconnecting(true);
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          void connect();
        }, 2_000);
      };
    }

    void connect();
    return () => {
      stopped = true;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      socket?.close();
    };
  }, [ownerSubject, refreshOverview, source.lessonId]);

  useEffect(() => {
    if (!highlightedEntryId) return undefined;
    const timer = window.setTimeout(() => setHighlightedEntryId(null), 1_400);
    return () => window.clearTimeout(timer);
  }, [highlightedEntryId]);

  useEffect(() => {
    if (!open) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      if (view === "actions") {
        actionsRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
      } else {
        recentBackRef.current?.focus();
      }
    });
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (view === "recent") {
        setView("actions");
      } else {
        closeMenu();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, view]);

  function closeMenu() {
    setOpen(false);
    setView("actions");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openAddDialog() {
    setOpen(false);
    setView("actions");
    setDialogOpen(true);
  }

  function showRecent() {
    setView("recent");
  }

  function startPractice() {
    closeMenu();
    onStartPractice?.();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(actionsRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <div className="playsay-vocabulary-menu" ref={rootRef}>
      <Button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("vocabulary.lessonMenu.open")}
        className={triggerClassName}
        onClick={() => {
          setOpen((current) => !current);
          setView("actions");
        }}
        ref={triggerRef}
        title={t("vocabulary.lessonMenu.open")}
        type="button"
        variant="outline"
      >
        <BookOpen aria-hidden="true" className="h-4 w-4" />
        <span className={triggerLabelClassName}>{t("vocabulary.lessonMenu.label")}</span>
        <ChevronDown aria-hidden="true" className="playsay-vocabulary-menu-chevron h-3.5 w-3.5" />
      </Button>

      {open ? (
        <div className="playsay-vocabulary-popover" id={menuId}>
          {view === "actions" ? (
            <div
              aria-label={t("vocabulary.lessonMenu.label")}
              onKeyDown={handleMenuKeyDown}
              ref={actionsRef}
              role="menu"
            >
              {ownerLabel ? <p className="playsay-vocabulary-owner">{ownerLabel}</p> : null}
              <button aria-label={t("vocabulary.lessonMenu.add")} onClick={openAddDialog} role="menuitem" type="button">
                <BookPlus aria-hidden="true" />
                {t("vocabulary.lessonMenu.add")}
              </button>
              <button aria-label={t("vocabulary.lessonMenu.recent")} onClick={showRecent} role="menuitem" type="button">
                <History aria-hidden="true" />
                {t("vocabulary.lessonMenu.recent")}
              </button>
              {onStartPractice ? (
                <button aria-label={t("vocabulary.lessonMenu.practice")} onClick={startPractice} role="menuitem" type="button">
                  <Play aria-hidden="true" />
                  {t("vocabulary.lessonMenu.practice")}
                </button>
              ) : null}
            </div>
          ) : (
            <section aria-label={t("vocabulary.lessonMenu.recent")}>
              <header className="playsay-vocabulary-recent-header">
                <button
                  aria-label={t("vocabulary.lessonMenu.back")}
                  onClick={() => setView("actions")}
                  ref={recentBackRef}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
                <div>
                  <strong>{t("vocabulary.lessonMenu.recent")}</strong>
                  {ownerLabel ? <span>{ownerLabel}</span> : null}
                </div>
                {reconnecting ? <WifiOff aria-label={t("vocabulary.lessonMenu.reconnecting")} className="playsay-vocabulary-offline" /> : null}
              </header>
              {loading ? (
                <div className="playsay-vocabulary-skeletons" role="status" aria-label={t("common.status.loading")}>
                  {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
                </div>
              ) : loadError ? (
                <div className="playsay-vocabulary-recent-state">
                  <p>{t("vocabulary.lessonMenu.loadFailed")}</p>
                  <button onClick={() => void refreshOverview()} type="button"><RotateCw aria-hidden="true" />{t("common.actions.refresh")}</button>
                </div>
              ) : entries.length === 0 ? (
                <p className="playsay-vocabulary-recent-empty">{t("vocabulary.lessonMenu.empty")}</p>
              ) : (
                <ul className="playsay-vocabulary-recent-list">
                  {entries.map((entry) => (
                    <li data-highlighted={entry.id === highlightedEntryId ? "true" : "false"} key={entry.id}>
                      <strong>{entry.sourceText}</strong>
                      <span>{entry.translation || t("vocabulary.translationMissing")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      ) : null}

      <VocabularyEntryDialog
        onClose={() => setDialogOpen(false)}
        onSaved={(savedEntries) => {
          setHighlightedEntryId(savedEntries[0]?.id ?? null);
          void refreshOverview();
        }}
        open={dialogOpen}
        recipientSubjects={recipientSubjects}
        source={source}
      />
    </div>
  );
}
