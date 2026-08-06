import { BookOpen, BookPlus, History, Play, RotateCw, WifiOff, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../components/ui/button";
import {
  fetchVocabularyOverview,
  openVocabularySocket,
  type CreateVocabularyEntry,
  type VocabularyEntry,
  type VocabularyRealtimeMessage,
} from "../../../shared/api/playsay";
import { vocabularyFeatures } from "../../../shared/config/vocabularyFeatures";
import { useAppTranslation } from "../../../shared/i18n";
import {
  VocabularyEntryForm,
  useVocabularyEntryFormController,
} from "./VocabularyEntryDialog";

type DialogTab = "add" | "recent";

type LessonVocabularySnapshot = {
  ownerLabel?: string;
  ownerSubject?: string;
  recipientSubjects: string[];
  source: Omit<CreateVocabularyEntry, "sourceText">;
};

export function VocabularyLessonDialog({
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
  const dialogId = useId();
  const titleId = useId();
  const addTabId = useId();
  const recentTabId = useId();
  const addPanelId = useId();
  const recentPanelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addTabRef = useRef<HTMLButtonElement>(null);
  const recentTabRef = useRef<HTMLButtonElement>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DialogTab>("add");
  const [snapshot, setSnapshot] = useState<LessonVocabularySnapshot>(() => ({
    ownerLabel,
    ownerSubject: ownerSubject ?? source.ownerSubject,
    recipientSubjects,
    source,
  }));
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);

  const refreshOverview = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLoadError(false);
    try {
      const overview = await fetchVocabularyOverview(
        snapshot.ownerSubject,
        snapshot.source.lessonId,
        5,
      );
      setEntries([...overview.lessonEntries, ...overview.recentEntries].slice(0, 5));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [open, snapshot.ownerSubject, snapshot.source.lessonId]);

  const formController = useVocabularyEntryFormController({
    active: open,
    onSaved: (savedEntries) => {
      setHighlightedEntryId(savedEntries[0]?.id ?? null);
      void refreshOverview();
    },
    recipientSubjects: snapshot.recipientSubjects,
    source: snapshot.source,
  });

  useEffect(() => {
    if (open && tab === "recent") void refreshOverview();
  }, [open, refreshOverview, tab]);

  useEffect(() => {
    if (!open || !snapshot.ownerSubject || !snapshot.source.lessonId) return undefined;
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
          ownerSubject: snapshot.ownerSubject,
          lessonId: snapshot.source.lessonId,
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
  }, [
    open,
    refreshOverview,
    snapshot.ownerSubject,
    snapshot.source.lessonId,
  ]);

  useEffect(() => {
    if (!highlightedEntryId) return undefined;
    const timer = window.setTimeout(() => setHighlightedEntryId(null), 1_400);
    return () => window.clearTimeout(timer);
  }, [highlightedEntryId]);

  useEffect(() => {
    if (!open) return undefined;
    const appRoot = document.getElementById("root");
    const rootWasInert = appRoot?.hasAttribute("inert") ?? false;
    const previousOverflow = document.body.style.overflow;
    appRoot?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (!rootWasInert) appRoot?.removeAttribute("inert");
    };
  }, [open]);

  function openDialog() {
    setSnapshot({
      ownerLabel,
      ownerSubject: ownerSubject ?? source.ownerSubject,
      recipientSubjects: [...recipientSubjects],
      source: { ...source },
    });
    setEntries([]);
    setLoadError(false);
    setReconnecting(false);
    setTab("add");
    setOpen(true);
  }

  function closeDialog() {
    formController.cancelPending();
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function startPractice() {
    closeDialog();
    onStartPractice?.();
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => !element.closest("[hidden]"));
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: DialogTab,
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === "Home"
      ? "add"
      : event.key === "End"
        ? "recent"
        : currentTab === "add"
          ? "recent"
          : "add";
    setTab(nextTab);
    window.requestAnimationFrame(() => (
      nextTab === "add" ? addTabRef.current : recentTabRef.current
    )?.focus());
  }

  const modal = open ? createPortal(
    <div
      className="playsay-vocabulary-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="playsay-vocabulary-dialog"
        id={dialogId}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="playsay-vocabulary-dialog-header">
          <div className="min-w-0">
            <h2 id={titleId}>{t("vocabulary.lessonMenu.dialogTitle")}</h2>
            {snapshot.ownerLabel ? <p>{snapshot.ownerLabel}</p> : null}
          </div>
          <div className="playsay-vocabulary-dialog-header-actions">
            {onStartPractice && !vocabularyFeatures.personalPracticeV2 ? (
              <Button onClick={startPractice} type="button" variant="outline">
                <Play aria-hidden="true" className="h-4 w-4" />
                {t("vocabulary.lessonMenu.practice")}
              </Button>
            ) : null}
            <Button
              aria-label={t("common.actions.close")}
              onClick={closeDialog}
              type="button"
              variant="outline"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div
          aria-label={t("vocabulary.lessonMenu.tabsLabel")}
          className="playsay-vocabulary-dialog-tabs"
          role="tablist"
        >
          <button
            aria-controls={addPanelId}
            aria-selected={tab === "add"}
            id={addTabId}
            onClick={() => {
              setTab("add");
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
            onKeyDown={(event) => handleTabKeyDown(event, "add")}
            ref={addTabRef}
            role="tab"
            tabIndex={tab === "add" ? 0 : -1}
            type="button"
          >
            <BookPlus aria-hidden="true" />
            {t("vocabulary.lessonMenu.add")}
          </button>
          <button
            aria-controls={recentPanelId}
            aria-selected={tab === "recent"}
            id={recentTabId}
            onClick={() => setTab("recent")}
            onKeyDown={(event) => handleTabKeyDown(event, "recent")}
            ref={recentTabRef}
            role="tab"
            tabIndex={tab === "recent" ? 0 : -1}
            type="button"
          >
            <History aria-hidden="true" />
            {t("vocabulary.lessonMenu.recent")}
          </button>
        </div>

        <div className="playsay-vocabulary-dialog-body">
          <section
            aria-labelledby={addTabId}
            hidden={tab !== "add"}
            id={addPanelId}
            role="tabpanel"
          >
            <VocabularyEntryForm
              controller={formController}
              inputRef={inputRef}
              recipientSubjects={snapshot.recipientSubjects}
            />
          </section>
          <section
            aria-labelledby={recentTabId}
            hidden={tab !== "recent"}
            id={recentPanelId}
            role="tabpanel"
          >
            <div className="playsay-vocabulary-recent-toolbar">
              <strong>{t("vocabulary.lessonMenu.recent")}</strong>
              {reconnecting ? (
                <span className="playsay-vocabulary-offline">
                  <WifiOff aria-hidden="true" />
                  {t("vocabulary.lessonMenu.reconnecting")}
                </span>
              ) : null}
            </div>
            {loading ? (
              <div className="playsay-vocabulary-skeletons" role="status" aria-label={t("common.status.loading")}>
                {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
              </div>
            ) : loadError ? (
              <div className="playsay-vocabulary-recent-state">
                <p>{t("vocabulary.lessonMenu.loadFailed")}</p>
                <button onClick={() => void refreshOverview()} type="button">
                  <RotateCw aria-hidden="true" />
                  {t("common.actions.refresh")}
                </button>
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
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="playsay-vocabulary-menu">
      <Button
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("vocabulary.lessonMenu.open")}
        className={triggerClassName}
        onClick={openDialog}
        ref={triggerRef}
        title={t("vocabulary.lessonMenu.open")}
        type="button"
        variant="outline"
      >
        <BookOpen aria-hidden="true" className="h-4 w-4" />
        <span className={triggerLabelClassName}>{t("vocabulary.lessonMenu.label")}</span>
      </Button>
      {modal}
    </div>
  );
}
