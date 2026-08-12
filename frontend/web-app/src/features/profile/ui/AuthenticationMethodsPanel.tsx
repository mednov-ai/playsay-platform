import { useState } from "react";
import { KeyRound, Loader2, Pencil, RefreshCw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  startPasskeyRegistration,
  type AuthenticationMethods,
  type AuthenticationPasskey,
  type CompletedAuthAction,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function AuthenticationMethodsPanel({
  completedAuthAction,
  email,
  loading,
  message,
  methods,
  onDeletePasskey,
  onRefresh,
  onRenamePasskey,
}: {
  completedAuthAction: CompletedAuthAction | null;
  email: string | null;
  loading: boolean;
  message: string | null;
  methods: AuthenticationMethods | null;
  onDeletePasskey: (credentialId: string) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onRenamePasskey: (credentialId: string, label: string) => Promise<boolean>;
}) {
  const { t } = useAppTranslation();
  const [localError, setLocalError] = useState(false);

  function addPasskey() {
    setLocalError(false);
    void startPasskeyRegistration({
      mode: methods?.passkeys.length ? "additional" : "ensure",
      passkeyCountBefore: methods?.passkeys.length ?? 0,
      returnPath: "/profile",
    }).catch(() => setLocalError(true));
  }

  const status = localError
    ? t("profile.passkeys.error")
    : completedAuthAction?.status === "cancelled"
      ? t("profile.passkeys.cancelled")
      : completedAuthAction?.status === "failed"
        ? t("profile.passkeys.failed")
        : completedAuthAction?.status === "success"
          ? t("profile.passkeys.success")
          : message;
  const passwordResetUrl = `/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-muted/50 p-4" aria-labelledby="authentication-methods-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary" aria-hidden="true">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold" id="authentication-methods-title">{t("profile.passkeys.title")}</h3>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              {t("profile.passkeys.description")}
            </p>
          </div>
        </div>
        <Button aria-label={t("profile.passkeys.refresh")} className="h-9 w-9 shrink-0 px-0" disabled={loading} onClick={() => void onRefresh()} type="button" variant="outline">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {status ? (
        <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs font-bold text-muted-foreground dark:bg-zinc-950/70" role="status">
          {status}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-white/80 p-3 dark:bg-zinc-950/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-extrabold">{t("profile.passkeys.passwordTitle")}</p>
              <p className="text-xs font-semibold text-muted-foreground">
                {methods?.hasPassword ? t("profile.passkeys.passwordActive") : t("profile.passkeys.passwordUnavailable")}
              </p>
            </div>
          </div>
          <Button asChild className="h-9 px-3" variant="outline">
            <a href={passwordResetUrl}>{t("profile.passkeys.changePassword")}</a>
          </Button>
        </div>

        {loading && !methods ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-white/80 p-4 text-sm font-semibold text-muted-foreground dark:bg-zinc-950/70">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {t("profile.passkeys.loading")}
          </div>
        ) : methods?.passkeys.length ? methods.passkeys.map((passkey, index) => (
          <PasskeyRow
            key={passkey.id}
            index={index}
            onDelete={onDeletePasskey}
            onRename={onRenamePasskey}
            passkey={passkey}
          />
        )) : (
          <p className="rounded-xl border border-dashed border-border bg-white/60 p-4 text-sm font-semibold text-muted-foreground dark:bg-zinc-950/50">
            {t("profile.passkeys.noPasskeys")}
          </p>
        )}
      </div>

      <Button className="mt-4" disabled={loading} onClick={addPasskey} type="button">
        <KeyRound className="h-4 w-4" />
        {methods?.passkeys.length ? t("profile.passkeys.addAnother") : t("profile.passkeys.add")}
      </Button>
    </section>
  );
}

function PasskeyRow({
  index,
  onDelete,
  onRename,
  passkey,
}: {
  index: number;
  onDelete: (credentialId: string) => Promise<boolean>;
  onRename: (credentialId: string, label: string) => Promise<boolean>;
  passkey: AuthenticationPasskey;
}) {
  const { i18n, t } = useAppTranslation();
  const fallbackLabel = t("profile.passkeys.defaultLabel", { number: index + 1 });
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [label, setLabel] = useState(passkey.label?.trim() || fallbackLabel);
  const [busy, setBusy] = useState(false);

  async function saveRename() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    if (await onRename(passkey.id, trimmed)) setEditing(false);
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    if (await onDelete(passkey.id)) setConfirmingDelete(false);
    setBusy(false);
  }

  return (
    <article className="rounded-xl border border-border bg-white/80 p-3 dark:bg-zinc-950/70">
      {editing ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="sr-only" htmlFor={`passkey-label-${passkey.id}`}>{t("profile.passkeys.renameLabel")}</label>
          <input
            autoFocus
            className="playsay-input"
            disabled={busy}
            id={`passkey-label-${passkey.id}`}
            maxLength={64}
            onChange={(event) => setLabel(event.target.value)}
            value={label}
          />
          <div className="flex gap-2">
            <Button className="h-9 px-3" disabled={busy || !label.trim()} onClick={() => void saveRename()} type="button">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("profile.passkeys.save")}
            </Button>
            <Button className="h-9 px-3" disabled={busy} onClick={() => setEditing(false)} type="button" variant="outline">
              <X className="h-4 w-4" />
              {t("profile.passkeys.cancel")}
            </Button>
          </div>
        </div>
      ) : confirmingDelete ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-foreground">{t("profile.passkeys.deleteConfirm", { label })}</p>
          <div className="flex gap-2">
            <Button className="h-9 bg-red-600 px-3 text-white hover:bg-red-700" disabled={busy} onClick={() => void remove()} type="button">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("profile.passkeys.deleteConfirmAction")}
            </Button>
            <Button className="h-9 px-3" disabled={busy} onClick={() => setConfirmingDelete(false)} type="button" variant="outline">
              {t("profile.passkeys.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><KeyRound className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">{passkey.label?.trim() || fallbackLabel}</p>
              <p className="text-xs font-semibold text-muted-foreground">
                {passkey.createdAt
                  ? t("profile.passkeys.createdAt", { date: new Date(passkey.createdAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language) })
                  : t("profile.passkeys.ready")}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="h-9 px-3" onClick={() => setEditing(true)} type="button" variant="outline">
              <Pencil className="h-4 w-4" />
              {t("profile.passkeys.rename")}
            </Button>
            <Button aria-label={t("profile.passkeys.deleteLabel", { label })} className="h-9 w-9 px-0" onClick={() => setConfirmingDelete(true)} type="button" variant="outline">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
