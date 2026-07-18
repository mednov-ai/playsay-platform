import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Grid2X2,
  Layers3,
  MessagesSquare,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceTab, WorkspaceTabDefinition } from "../../entities/workspace/model";
import { useAppTranslation } from "../../shared/i18n";

export function WorkspaceTabs({
  activeTab,
  onSelect,
  tabs,
  variant = "bar",
}: {
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
  tabs: WorkspaceTabDefinition[];
  variant?: "bar" | "editor";
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [menuAnchor, setMenuAnchor] = useState({ right: 16, top: 72 });
  const activeDefinition = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  function closeMenu(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>("[data-active='true']")?.focus();
    });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  if (!activeDefinition) {
    return null;
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }
    const controls = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (controls.length === 0) {
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function toggleMenu() {
    if (!open) {
      const triggerBounds = triggerRef.current?.getBoundingClientRect();
      if (triggerBounds) {
        const desiredMenuWidth = variant === "editor" ? 768 : 896;
        const menuWidth = Math.min(desiredMenuWidth, window.innerWidth - 32);
        const maximumRight = Math.max(16, window.innerWidth - menuWidth - 16);
        setMenuAnchor({
          right: Math.min(maximumRight, Math.max(16, window.innerWidth - triggerBounds.right)),
          top: triggerBounds.bottom + 8,
        });
      }
    }
    setOpen((current) => !current);
  }

  return (
    <div className="playsay-workspace-switcher" data-variant={variant} ref={wrapperRef}>
      {variant === "bar" ? (
        <div className="playsay-workspace-current" aria-live="polite">
          <span className="playsay-workspace-current-icon">{workspaceTabIcon(activeDefinition.id)}</span>
          <span className="playsay-workspace-current-copy">
            <strong>{t(activeDefinition.labelKey)}</strong>
            <small>{t(activeDefinition.descriptionKey)}</small>
          </span>
        </div>
      ) : null}

      <button
        aria-controls={open ? `${titleId}-panel` : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="playsay-workspace-switcher-trigger"
        data-testid="workspace-switcher-trigger"
        onClick={toggleMenu}
        ref={triggerRef}
        type="button"
      >
        <Grid2X2 className="h-4 w-4" />
        <span>{t(variant === "editor" ? "workspace.tabs.openShort" : "workspace.tabs.open")}</span>
        <ChevronDown className="playsay-workspace-switcher-chevron h-4 w-4" />
      </button>

      {open ? createPortal(
        <>
          <button
            aria-label={t("workspace.tabs.close")}
            className="playsay-workspace-menu-backdrop"
            onClick={() => closeMenu()}
            tabIndex={-1}
            type="button"
          />
          <div
            aria-labelledby={titleId}
            className="playsay-workspace-menu"
            id={`${titleId}-panel`}
            onKeyDown={handlePanelKeyDown}
            ref={panelRef}
            role="dialog"
            style={{
              "--playsay-workspace-menu-right": `${menuAnchor.right}px`,
              "--playsay-workspace-menu-top": `${menuAnchor.top}px`,
              "--playsay-workspace-menu-width": variant === "editor" ? "48rem" : "56rem",
            } as CSSProperties}
          >
            <div className="playsay-workspace-menu-header">
              <div>
                <strong id={titleId}>{t("workspace.tabs.menuTitle")}</strong>
                <small>{t("workspace.tabs.menuDescription")}</small>
              </div>
              <button aria-label={t("workspace.tabs.close")} onClick={() => closeMenu()} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="playsay-workspace-tabs" aria-label={t("workspace.tabs.aria")}>
              {tabs.map((tab) => (
                <button
                  className="playsay-workspace-tab"
                  data-active={activeTab === tab.id ? "true" : "false"}
                  data-tab-id={tab.id}
                  key={tab.id}
                  onClick={() => {
                    setOpen(false);
                    onSelect(tab.id);
                  }}
                  type="button"
                >
                  {workspaceTabIcon(tab.id)}
                  <span>
                    <strong>{t(tab.labelKey)}</strong>
                    <small>{t(tab.descriptionKey)}</small>
                  </span>
                  {activeTab === tab.id ? <Check className="playsay-workspace-tab-check h-4 w-4" /> : null}
                </button>
              ))}
            </nav>
          </div>
        </>,
        document.body,
      ) : null}
    </div>
  );
}

function workspaceTabIcon(tab: WorkspaceTab): ReactNode {
  switch (tab) {
    case "aiTutor":
      return <MessagesSquare className="h-4 w-4" />;
    case "billing":
      return <CreditCard className="h-4 w-4" />;
    case "homework":
      return <ClipboardList className="h-4 w-4" />;
    case "materials":
      return <BookOpen className="h-4 w-4" />;
    case "students":
      return <GraduationCap className="h-4 w-4" />;
    case "users":
      return <UsersRound className="h-4 w-4" />;
    case "courses":
      return <Layers3 className="h-4 w-4" />;
    case "schedule":
    default:
      return <CalendarDays className="h-4 w-4" />;
  }
}
