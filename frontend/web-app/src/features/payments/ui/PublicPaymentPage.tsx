import { useEffect, useMemo, useState } from "react";
import { publicSiteUrl } from "@playsay/shared-ui";
import { CreditCard, Loader2 } from "lucide-react";
import { startLogin, type PublicPaymentInvoice } from "../../../shared/api/playsay";
import { createPublicPaymentCheckout, fetchPublicPaymentInvoice } from "../../../shared/api/payments";
import { useAppTranslation } from "../../../shared/i18n";
import { LanguageSwitcher } from "../../../shared/i18n/ui/LanguageSwitcher";
import { BrandMark } from "../../../shared/ui/BrandMark";
import { Button } from "../../../components/ui/button";
import { ThemeToggle } from "../../../shared/theme/ThemeToggle";
import { useAppTheme } from "../../../app/AppProviders";

export function PublicPaymentPage({ publicToken }: { publicToken: string }) {
  const { i18n, t } = useAppTranslation();
  const theme = useAppTheme();
  const [invoice, setInvoice] = useState<PublicPaymentInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadInvoice() {
      setLoading(true);
      setMessage(null);
      try {
        const loaded = await fetchPublicPaymentInvoice(publicToken);
        if (!cancelled) {
          setInvoice(loaded);
        }
      } catch (caught) {
        if (!cancelled) {
          setMessage(caught instanceof Error ? caught.message : t("payments.messages.loadFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadInvoice();
    return () => {
      cancelled = true;
    };
  }, [publicToken, t]);

  const payable = useMemo(
    () => invoice !== null && (invoice.status === "OPEN" || invoice.status === "PAYMENT_PENDING"),
    [invoice],
  );

  async function startCheckout() {
    setCheckoutLoading(true);
    setMessage(null);
    try {
      const checkout = await createPublicPaymentCheckout(publicToken);
      window.location.assign(checkout.confirmationUrl);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("payments.messages.checkoutFailed"));
      setCheckoutLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher disabled={loading || checkoutLoading} />
            <ThemeToggle mode={theme.mode} onModeChange={theme.setMode} resolvedTheme={theme.resolvedTheme} />
            <Button onClick={() => void startLogin()} type="button" variant="outline">
              {t("auth.login")}
            </Button>
          </div>
        </header>

        <section className="grid flex-1 content-center gap-5">
          <div className="rounded-[1.5rem] border border-border bg-background/85 p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="text-2xl font-extrabold">{t("payments.public.title")}</h1>
                  <p className="text-sm font-semibold text-muted-foreground">{t("payments.public.subtitle")}</p>
                </div>
              </div>
              {invoice ? (
                <span className="rounded-full border border-border bg-muted px-3 py-1 text-sm font-extrabold">
                  {t(`payments.status.${invoice.status}`)}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm font-semibold text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("payments.messages.loading")}
              </div>
            ) : invoice ? (
              <div className="grid gap-5 pt-5">
                <div className="grid gap-3">
                  <PaymentRow label={t("payments.public.invoice")} value={invoice.number} />
                  <PaymentRow
                    label={t("payments.public.amount")}
                    value={formatPaymentAmount(invoice.amountMinor, invoice.currency, i18n.language)}
                  />
                  <PaymentRow label={t("payments.public.description")} value={invoice.description} />
                  <PaymentRow label={t("payments.public.payer")} value={invoice.payerName || t("payments.form.noPayer")} />
                </div>

                {message ? (
                  <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
                    {message}
                  </div>
                ) : null}

                {payable ? (
                  <Button disabled={checkoutLoading} onClick={() => void startCheckout()} type="button">
                    {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {t("payments.actions.pay")}
                  </Button>
                ) : (
                  <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
                    {t("payments.public.notPayable")}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-4 pt-5">
                <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
                  {message ?? t("payments.messages.loadFailed")}
                </div>
                <PublicPaymentReturnLink label={t("welcome.returnToSite")} />
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export function PublicPaymentReturnLink({ label }: { label: string }) {
  return (
    <a className="text-sm font-extrabold text-primary" href={publicSiteUrl}>
      {label}
    </a>
  );
}

function PaymentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-border bg-muted/45 p-3">
      <span className="text-xs font-extrabold uppercase tracking-normal text-muted-foreground">{label}</span>
      <strong className="text-base">{value}</strong>
    </div>
  );
}

function formatPaymentAmount(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    currency,
    style: "currency",
  }).format(amountMinor / 100);
}
