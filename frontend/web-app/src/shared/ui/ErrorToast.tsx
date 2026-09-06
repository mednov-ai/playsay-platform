import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { X } from "lucide-react";
import { useAppTranslation } from "../i18n";

type ErrorNotice = { id: number; messageKey: string };
const useErrorNotices = create<{ notices: ErrorNotice[] }>(() => ({ notices: [] }));
const shownErrors = new WeakSet<object>();
let sequence = 0;
const subscribeToClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function showErrorToast(error: unknown, messageKey: string) {
  if (typeof error === "object" && error !== null) {
    if (shownErrors.has(error)) return;
    shownErrors.add(error);
  }
  const notice = { id: ++sequence, messageKey };
  useErrorNotices.setState(({ notices }) => ({ notices: [...notices.slice(-3), notice] }));
}

export function ErrorToastHost() {
  const { t } = useAppTranslation();
  const notices = useErrorNotices((state) => state.notices);
  const client = useSyncExternalStore(subscribeToClient, clientSnapshot, serverSnapshot);
  if (!client || notices.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[10000] grid w-[min(24rem,calc(100vw-2rem))] gap-2 pb-[env(safe-area-inset-bottom)]">
      {notices.map((notice) => (
        <div key={notice.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-destructive/30 bg-background p-4 text-foreground shadow-lg" role="alert">
          <p className="min-w-0 flex-1 text-sm">{t(notice.messageKey)}</p>
          <button aria-label={t("common.actions.close")} type="button" onClick={() => useErrorNotices.setState(({ notices: current }) => ({ notices: current.filter(({ id }) => id !== notice.id) }))}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
