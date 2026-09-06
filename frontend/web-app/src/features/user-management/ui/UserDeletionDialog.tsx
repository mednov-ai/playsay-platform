import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../components/ui/button";
import { ApiError } from "../../../shared/api/errors";
import { useAppTranslation } from "../../../shared/i18n";
import { showErrorToast } from "../../../shared/ui/ErrorToast";
import { fetchUserDeletionOperation, waitForUserDeletion, type UserDeletionOperation, type UserManagementUser } from "../api/userManagement";

type Phase = "confirming" | "submitting" | "running" | "completed" | "failed" | "unknown";
type Attempt = { target: UserManagementUser; phase: Phase; operation?: UserDeletionOperation; errorKey?: string };

export function useUserDeletion({ submit, refresh, errorKey }: {
  submit: (input: { subject: string }) => Promise<UserDeletionOperation>;
  refresh: () => Promise<unknown>;
  errorKey: (error: unknown) => string;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [visible, setVisible] = useState(false);
  const pending = useRef(false);
  const activeSubject = useRef<string | null>(null);
  const completedSubjects = useRef(new Set<string>());
  const trigger = useRef<HTMLElement | null>(null);
  const wasVisible = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!visible && wasVisible.current) {
      if (trigger.current?.isConnected && !trigger.current.matches(":disabled")) trigger.current.focus();
      else document.getElementById("admin-users-title")?.focus();
    }
    wasVisible.current = visible;
  }, [visible]);
  const locked = !!attempt && ["confirming", "submitting", "running", "unknown"].includes(attempt.phase);

  function update(next: Attempt) {
    if (mounted.current && activeSubject.current === next.target.subject) setAttempt(next);
  }
  function open(target: UserManagementUser) {
    if (pending.current || locked) return;
    if (completedSubjects.current.has(target.subject)) return;
    activeSubject.current = target.subject;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAttempt({ target, phase: "confirming" });
    setVisible(true);
  }
  function close() {
    setVisible(false);
    if (attempt?.phase === "confirming" || (attempt?.phase === "unknown" && !attempt.operation)) setAttempt(null);
  }
  async function refreshList(current: Attempt) {
    try { await refresh(); }
    catch (caught) {
      update({ ...current, errorKey: "userManagement.deletion.refreshFailed" });
      showErrorToast(caught, "userManagement.deletion.refreshFailed");
    }
  }
  async function execute(checkOnly: boolean) {
    if (!attempt || pending.current || (!checkOnly && attempt.phase !== "confirming")) return;
    pending.current = true;
    let current: Attempt = { ...attempt, phase: checkOnly ? "running" : "submitting", errorKey: undefined };
    update(current);
    try {
      const operation = checkOnly && current.operation
        ? await fetchUserDeletionOperation(current.operation.operationId)
        : await submit({ subject: current.target.subject });
      if (operation.targetSubject !== current.target.subject) throw new ApiError(502, "USER_DELETE_INVALID_RESPONSE", "Mismatched deletion target");
      current = { ...current, phase: "running", operation };
      update(current);
      const completed = await waitForUserDeletion(operation);
      current = { ...current, phase: "completed", operation: completed };
      completedSubjects.current.add(current.target.subject);
      update(current);
      // List refresh is independent: a hanging/refused refresh cannot undo completion.
      void refreshList(current);
    } catch (caught) {
      const definite = caught instanceof ApiError && caught.status >= 400 && caught.status < 500;
      const key = errorKey(caught);
      current = { ...current, phase: definite ? "failed" : "unknown", errorKey: key };
      update(current);
      if (mounted.current) showErrorToast(caught, key);
    } finally { pending.current = false; }
  }
  return {
    attempt, visible, locked, open, close,
    isCompleted: (subject: string) => completedSubjects.current.has(subject),
    show: () => setVisible(true),
    confirm: () => execute(false),
    check: () => execute(true),
    refresh: () => attempt ? refreshList(attempt) : Promise.resolve(),
  };
}

export function UserDeletionDialog({ deletion }: { deletion: ReturnType<typeof useUserDeletion> }) {
  const { t } = useAppTranslation();
  const root = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const { attempt, visible } = deletion;
  useEffect(() => {
    if (visible) cancel.current?.focus();
  }, [visible]);
  if (!attempt) return null;
  const name = attempt.target.displayName ?? attempt.target.username ?? attempt.target.subject;
  const busy = attempt.phase === "submitting" || attempt.phase === "running";
  const status = t(`userManagement.deletion.${attempt.phase}`, { name });
  if (!visible) return <aside className="sticky bottom-3 z-40 rounded-2xl border bg-white p-4 shadow-lg" role="status">
    <p>{status}</p>
    <Button type="button" variant="outline" onClick={deletion.show}>{t("userManagement.deletion.details")}</Button>
  </aside>;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-3">
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby="user-deletion-title" aria-describedby="user-deletion-description"
        className="grid max-h-[90dvh] w-full max-w-lg gap-4 overflow-y-auto rounded-3xl border border-border bg-white p-5 shadow-xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); deletion.close(); }
          if (event.key === "Tab") {
            const controls = root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
            if (!controls?.length) return;
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        }}>
        <h2 className="break-words text-xl font-extrabold" id="user-deletion-title">{t("userManagement.confirm.delete", { name })}</h2>
        <p className="break-all text-sm text-muted-foreground">{attempt.target.email ?? attempt.target.username ?? attempt.target.subject}</p>
        <p id="user-deletion-description">{t("userManagement.deletion.explanation")}</p>
        <p role="status" aria-live="polite" className="font-semibold">{status}</p>
        {attempt.errorKey ? <p className="text-destructive">{t(attempt.errorKey)}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={cancel} type="button" variant="outline" onClick={deletion.close}>{t(attempt.phase === "confirming" ? "common.actions.cancel" : "userManagement.deletion.close")}</Button>
          {attempt.phase === "confirming" ? <Button type="button" onClick={() => void deletion.confirm()}>{t("userManagement.actions.delete")}</Button> : null}
          {attempt.operation && !busy && attempt.phase !== "completed" ? <Button type="button" onClick={() => void deletion.check()}>{t("userManagement.deletion.check")}</Button> : null}
          {!busy && attempt.phase !== "confirming" ? <Button type="button" variant="outline" onClick={() => void deletion.refresh()}>{t("common.actions.refresh")}</Button> : null}
        </div>
      </div>
    </div>, document.body,
  );
}
