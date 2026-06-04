import { useState } from "react";
import { Copy, CreditCard, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import { paymentPath } from "../../../app/routes";
import { Button } from "../../../components/ui/button";
import type {
  PaymentInvoice,
  PaymentInvoiceCreateInput,
  PaymentInvoiceCreated,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function BillingPanel({
  disabled,
  invoices,
  loading,
  message,
  onCreate,
  onRefresh,
}: {
  disabled: boolean;
  invoices: PaymentInvoice[];
  loading: boolean;
  message: string | null;
  onCreate: (input: PaymentInvoiceCreateInput) => Promise<PaymentInvoiceCreated | null>;
  onRefresh: () => void;
}) {
  const { i18n, t } = useAppTranslation();
  const [amountRub, setAmountRub] = useState("3500");
  const [description, setDescription] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const latestInvoices = invoices.slice(0, 8);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedAmount = Number(amountRub.replace(",", "."));
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setLocalMessage(t("payments.messages.amountInvalid"));
      return;
    }
    const created = await onCreate({
      amountMinor: Math.round(normalizedAmount * 100),
      currency: "RUB",
      description: description.trim() || t("payments.form.defaultDescription"),
      studentUserId: null,
      payerName: payerName.trim() || null,
      payerEmail: payerEmail.trim() || null,
      payerPhone: payerPhone.trim() || null,
      dueAt: null,
    });
    if (created) {
      setCreatedLink(new URL(paymentPath(created.publicUrlToken), window.location.origin).toString());
      setLocalMessage(t("payments.messages.linkReady"));
    }
  }

  async function copyCreatedLink() {
    if (!createdLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(t("payments.clipboard.promptTitle"), createdLink);
    }
  }

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">{t("payments.billing.title")}</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form className="grid gap-3 rounded-2xl border border-border bg-muted/45 p-4" onSubmit={(event) => void handleCreate(event)}>
          <h3 className="text-sm font-extrabold uppercase tracking-normal text-muted-foreground">
            {t("payments.billing.createTitle")}
          </h3>
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("payments.form.amount")}</span>
            <input
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={disabled}
              inputMode="decimal"
              min="1"
              onChange={(event) => setAmountRub(event.target.value)}
              step="1"
              type="number"
              value={amountRub}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("payments.form.description")}</span>
            <input
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={disabled}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("payments.form.defaultDescription")}
              value={description}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("payments.form.payerName")}</span>
            <input
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={disabled}
              onChange={(event) => setPayerName(event.target.value)}
              value={payerName}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("payments.form.payerEmail")}</span>
            <input
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={disabled}
              onChange={(event) => setPayerEmail(event.target.value)}
              type="email"
              value={payerEmail}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("payments.form.payerPhone")}</span>
            <input
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={disabled}
              onChange={(event) => setPayerPhone(event.target.value)}
              type="tel"
              value={payerPhone}
            />
          </label>
          <Button disabled={disabled || loading} type="submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("payments.actions.create")}
          </Button>
          {createdLink ? (
            <div className="grid gap-2 rounded-xl border border-border bg-white p-3 text-sm">
              <a className="break-all font-bold text-primary" href={createdLink} rel="noreferrer" target="_blank">
                {createdLink}
              </a>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void copyCreatedLink()} type="button" variant="outline">
                  <Copy className="h-4 w-4" />
                  {copied ? t("payments.clipboard.copied") : t("payments.actions.copy")}
                </Button>
                <Button asChild type="button" variant="outline">
                  <a href={createdLink} rel="noreferrer" target="_blank">
                    <ExternalLink className="h-4 w-4" />
                    {t("payments.actions.open")}
                  </a>
                </Button>
              </div>
            </div>
          ) : null}
          {localMessage ? <p className="text-sm font-semibold text-muted-foreground">{localMessage}</p> : null}
          {message ? <p className="text-sm font-semibold text-muted-foreground">{message}</p> : null}
        </form>

        <div className="grid content-start gap-3">
          <h3 className="text-sm font-extrabold uppercase tracking-normal text-muted-foreground">
            {t("payments.billing.recentTitle")}
          </h3>
          {latestInvoices.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm font-semibold text-muted-foreground">
              {t("payments.empty.invoices")}
            </div>
          ) : (
            <div className="grid gap-2">
              {latestInvoices.map((invoice) => (
                <article className="rounded-2xl border border-border bg-white p-3" key={invoice.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold">{invoice.number}</p>
                      <p className="text-xs font-semibold text-muted-foreground">{invoice.description}</p>
                    </div>
                    <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs font-extrabold">
                      {t(`payments.status.${invoice.status}`)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <strong>{formatPaymentAmount(invoice.amountMinor, invoice.currency, i18n.language)}</strong>
                    <span className="text-muted-foreground">{invoice.payerName || invoice.payerEmail || t("payments.form.noPayer")}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatPaymentAmount(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    currency,
    style: "currency",
  }).format(amountMinor / 100);
}
