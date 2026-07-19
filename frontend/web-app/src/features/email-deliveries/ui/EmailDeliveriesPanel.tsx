import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Mail, RefreshCw, Search, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import {
  emailDeliveryKeys,
  fetchEmailDeliveries,
  fetchEmailDelivery,
  resendEmailDelivery,
  type EmailDeliveryFilters,
  type EmailDeliverySummary,
} from "../api/emailDeliveries";

const initialFilters: EmailDeliveryFilters = {
  createdFrom: "",
  createdTo: "",
  page: 0,
  providerStatus: "",
  search: "",
  status: "",
  templateKey: "",
};

const providerStatuses = [
  "ACCEPTED",
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "SOFT_BOUNCED",
  "HARD_BOUNCED",
  "SPAM",
  "UNSUBSCRIBED",
  "SUBSCRIBED",
  "FAILED",
  "TRACKING_EXPIRED",
  "NOT_TRACKED",
] as const;

export function EmailDeliveriesPanel() {
  const { i18n, t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const deliveries = useQuery({
    queryFn: () => fetchEmailDeliveries(filters),
    queryKey: emailDeliveryKeys.list(filters),
    refetchInterval: 30_000,
  });
  const detail = useQuery({
    enabled: selectedId !== null,
    queryFn: () => fetchEmailDelivery(selectedId ?? ""),
    queryKey: emailDeliveryKeys.detail(selectedId ?? ""),
    refetchInterval: 30_000,
  });
  const resend = useMutation({
    mutationFn: resendEmailDelivery,
    onError: () => setMessage(t("emailDeliveries.messages.resendFailed")),
    onSuccess: async () => {
      setMessage(t("emailDeliveries.messages.resent"));
      await queryClient.invalidateQueries({ queryKey: emailDeliveryKeys.all });
    },
  });

  const page = deliveries.data;
  const loading = deliveries.isFetching || resend.isPending;

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setSelectedId(null);
    setFilters({ ...draft, page: 0, search: draft.search.trim(), templateKey: draft.templateKey.trim() });
  }

  function changePage(nextPage: number) {
    setSelectedId(null);
    setFilters((current) => ({ ...current, page: nextPage }));
    setDraft((current) => ({ ...current, page: nextPage }));
  }

  async function confirmResend(delivery: EmailDeliverySummary) {
    if (!delivery.resendAllowed || !window.confirm(t("emailDeliveries.resend.confirm", { email: delivery.toEmail }))) return;
    setMessage(null);
    await resend.mutateAsync(delivery.id).catch(() => undefined);
  }

  return (
    <section className="grid gap-5" aria-busy={loading}>
      <header className="rounded-3xl border border-primary/15 bg-[radial-gradient(circle_at_top_right,rgba(255,192,95,.24),transparent_42%),white] p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("emailDeliveries.eyebrow")}</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-black"><Mail className="h-6 w-6 text-primary" />{t("emailDeliveries.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("emailDeliveries.subtitle")}</p>
          </div>
          <Button onClick={() => void deliveries.refetch()} type="button" variant="outline">
            {deliveries.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.actions.refresh")}
          </Button>
        </div>
      </header>

      <form className="grid gap-3 rounded-2xl border border-border bg-white p-4 lg:grid-cols-3" onSubmit={applyFilters}>
        <Field label={t("emailDeliveries.fields.search")}>
          <input className="playsay-input" onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} placeholder={t("emailDeliveries.placeholders.search")} value={draft.search} />
        </Field>
        <Field label={t("emailDeliveries.fields.template")}>
          <input className="playsay-input" onChange={(event) => setDraft((current) => ({ ...current, templateKey: event.target.value }))} placeholder={t("emailDeliveries.placeholders.template")} value={draft.templateKey} />
        </Field>
        <Field label={t("emailDeliveries.fields.localStatus")}>
          <select className="playsay-input" onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} value={draft.status}>
            <option value="">{t("emailDeliveries.filters.allStatuses")}</option>
            {(["PENDING", "SENT", "FAILED"] as const).map((status) => <option key={status} value={status}>{statusLabel(t, status)}</option>)}
          </select>
        </Field>
        <Field label={t("emailDeliveries.fields.providerStatus")}>
          <select className="playsay-input" onChange={(event) => setDraft((current) => ({ ...current, providerStatus: event.target.value }))} value={draft.providerStatus}>
            <option value="">{t("emailDeliveries.filters.allStatuses")}</option>
            {providerStatuses.map((status) => <option key={status} value={status}>{statusLabel(t, status)}</option>)}
          </select>
        </Field>
        <Field label={t("emailDeliveries.fields.from")}>
          <input className="playsay-input" onChange={(event) => setDraft((current) => ({ ...current, createdFrom: event.target.value }))} type="datetime-local" value={draft.createdFrom} />
        </Field>
        <Field label={t("emailDeliveries.fields.to")}>
          <input className="playsay-input" onChange={(event) => setDraft((current) => ({ ...current, createdTo: event.target.value }))} type="datetime-local" value={draft.createdTo} />
        </Field>
        <div className="flex flex-wrap items-end gap-2 lg:col-span-3">
          <Button type="submit"><Search className="h-4 w-4" />{t("emailDeliveries.actions.apply")}</Button>
          <Button onClick={() => { setDraft(initialFilters); setFilters(initialFilters); setSelectedId(null); }} type="button" variant="outline">{t("common.actions.reset")}</Button>
        </div>
      </form>

      {message ? <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-semibold">{message}</p> : null}
      {deliveries.error ? <ErrorMessage text={t("emailDeliveries.messages.loadFailed")} /> : null}

      <div className="grid gap-3">
        {page && page.items.length > 0 ? page.items.map((delivery) => (
          <article className="grid gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm lg:grid-cols-[minmax(14rem,1.2fr)_minmax(13rem,1fr)_auto]" key={delivery.id}>
            <div className="min-w-0">
              <h3 className="truncate font-extrabold">{delivery.subject || t("emailDeliveries.values.noSubject")}</h3>
              <p className="truncate text-sm font-semibold text-muted-foreground">{delivery.toEmail}</p>
              <p className="mt-1 text-xs text-muted-foreground">{delivery.templateKey} · {formatDate(delivery.createdAt, i18n.language)}</p>
            </div>
            <div className="flex flex-wrap content-start gap-2">
              <StatusChip label={t("emailDeliveries.fields.localStatus")} status={delivery.status} t={t} />
              <StatusChip label={delivery.provider ?? t("emailDeliveries.values.providerUnknown")} status={delivery.providerStatus ?? "UNKNOWN"} t={t} />
              <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold">{t("emailDeliveries.values.attempts", { count: delivery.providerAttemptCount })}</span>
            </div>
            <div className="flex flex-wrap items-start gap-2 lg:justify-end">
              <Button onClick={() => setSelectedId((current) => current === delivery.id ? null : delivery.id)} type="button" variant="outline">
                {selectedId === delivery.id ? t("common.actions.close") : t("emailDeliveries.actions.details")}
              </Button>
              <Button disabled={!delivery.resendAllowed || resend.isPending} onClick={() => void confirmResend(delivery)} title={resendReason(t, delivery.resendReason)} type="button">
                {resend.isPending && resend.variables === delivery.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t("emailDeliveries.actions.resend")}
              </Button>
            </div>
          </article>
        )) : deliveries.isLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-border bg-white p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">{t("common.status.loading")}</span></div>
        ) : (
          <p className="rounded-2xl border border-border bg-muted/60 p-5 text-sm font-semibold text-muted-foreground">{t("emailDeliveries.empty")}</p>
        )}
      </div>

      {selectedId ? <DeliveryDetail loading={detail.isFetching} value={detail.data} error={detail.error ? t("emailDeliveries.messages.detailFailed") : null} /> : null}

      {page && page.totalPages > 1 ? (
        <nav aria-label={t("emailDeliveries.pagination.aria")} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-3">
          <Button disabled={page.page === 0} onClick={() => changePage(page.page - 1)} type="button" variant="outline"><ChevronLeft className="h-4 w-4" />{t("emailDeliveries.pagination.previous")}</Button>
          <span className="text-sm font-bold">{t("emailDeliveries.pagination.page", { current: page.page + 1, total: page.totalPages, count: page.totalElements })}</span>
          <Button disabled={page.page + 1 >= page.totalPages} onClick={() => changePage(page.page + 1)} type="button" variant="outline">{t("emailDeliveries.pagination.next")}<ChevronRight className="h-4 w-4" /></Button>
        </nav>
      ) : null}
    </section>
  );
}

function DeliveryDetail({ error, loading, value }: { error: string | null; loading: boolean; value: Awaited<ReturnType<typeof fetchEmailDelivery>> | undefined }) {
  const { i18n, t } = useAppTranslation();
  if (error) return <ErrorMessage text={error} />;
  if (!value) return loading ? <p className="text-sm text-muted-foreground">{t("common.status.loading")}</p> : null;
  const delivery = value.delivery;
  return (
    <section className="grid gap-4 rounded-2xl border border-primary/20 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold">{t("emailDeliveries.detail.title")}</h3>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <DetailValue label={t("emailDeliveries.fields.recipient")} value={delivery.toEmail} />
        <DetailValue label={t("emailDeliveries.fields.subject")} value={delivery.subject || t("emailDeliveries.values.noSubject")} />
        <DetailValue label={t("emailDeliveries.fields.template")} value={delivery.templateKey} />
        <DetailValue label={t("emailDeliveries.fields.providerStatus")} value={statusLabel(t, delivery.providerStatus ?? "UNKNOWN")} />
        <DetailValue label={t("emailDeliveries.fields.providerDetail")} value={delivery.providerDeliveryStatus || t("emailDeliveries.values.notAvailable")} />
        <DetailValue label={t("emailDeliveries.fields.providerResponse")} value={delivery.providerDestinationResponse || t("emailDeliveries.values.notAvailable")} />
        <DetailValue label={t("emailDeliveries.fields.checkedAt")} value={formatOptionalDate(delivery.providerCheckedAt, i18n.language, t("emailDeliveries.values.notAvailable"))} />
        <DetailValue label={t("emailDeliveries.fields.trackingUntil")} value={formatOptionalDate(delivery.providerTrackingUntil, i18n.language, t("emailDeliveries.values.finished"))} />
        <DetailValue label={t("emailDeliveries.fields.id")} value={delivery.id} />
      </dl>
      <div className="grid gap-2">
        <h4 className="font-extrabold">{t("emailDeliveries.detail.attemptHistory")}</h4>
        {value.attempts.map((attempt) => (
          <article className="grid gap-2 rounded-xl border border-border bg-muted/35 p-3 text-sm md:grid-cols-[auto_1fr_1fr]" key={attempt.id}>
            <strong>{t("emailDeliveries.values.attemptNumber", { number: attempt.attemptNumber })}</strong>
            <span>{attempt.provider} · {statusLabel(t, attempt.providerStatus)}</span>
            <span className="text-muted-foreground">{formatDate(attempt.createdAt, i18n.language)}{attempt.errorMessage ? ` · ${attempt.errorMessage}` : ""}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-1 text-sm font-bold"><span>{label}</span>{children}</label>;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>;
}

function ErrorMessage({ text }: { text: string }) {
  return <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm font-semibold text-destructive">{text}</p>;
}

function StatusChip({ label, status, t }: { label: string; status: string; t: (key: string, options?: Record<string, unknown>) => string }) {
  const terminalSuccess = ["SENT", "DELIVERED", "OPENED", "CLICKED", "SUBSCRIBED"].includes(status);
  const failed = ["FAILED", "HARD_BOUNCED", "SPAM"].includes(status);
  const tone = terminalSuccess ? "border-emerald-200 bg-emerald-50 text-emerald-800" : failed ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-extrabold ${tone}`}>{label}: {statusLabel(t, status)}</span>;
}

function statusLabel(t: (key: string, options?: Record<string, unknown>) => string, status: string): string {
  return t(`emailDeliveries.status.${status}`, { defaultValue: status });
}

function resendReason(t: (key: string, options?: Record<string, unknown>) => string, reason: string): string {
  return t(`emailDeliveries.resend.reason.${reason}`, { defaultValue: reason });
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatOptionalDate(value: string | null | undefined, locale: string, fallback: string): string {
  return value ? formatDate(value, locale) : fallback;
}
