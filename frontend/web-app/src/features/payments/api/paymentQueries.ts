import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  createPaymentInvoice as createPaymentInvoiceRequest,
  fetchPaymentInvoices,
  type PaymentInvoice,
  type PaymentInvoiceCreateInput,
  type PaymentInvoiceCreated,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import type { SessionErrorHandler } from "../../../app/controller/types";

export const paymentQueryKeys = {
  adminInvoices: () => [...paymentQueryKeys.all, "admin-invoices"] as const,
  all: ["payments"] as const,
};

export function usePaymentInvoicesData({
  applySessionError,
  enabled,
}: {
  applySessionError: SessionErrorHandler;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { t } = useAppTranslation();
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const paymentInvoicesQuery = useQuery({
    enabled,
    queryFn: () => fetchPaymentInvoices(),
    queryKey: paymentQueryKeys.adminInvoices(),
  });
  const createInvoiceMutation = useMutation({
    mutationFn: (input: PaymentInvoiceCreateInput) => createPaymentInvoiceRequest(input),
    onError: (caught) => {
      setPaymentMessage(applySessionError(caught, t("payments.messages.createFailed")));
    },
    onMutate: () => {
      setPaymentMessage(null);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<PaymentInvoice[]>(paymentQueryKeys.adminInvoices(), (current) => [
        created.invoice,
        ...(current ?? []).filter((invoice) => invoice.id !== created.invoice.id),
      ]);
      setPaymentMessage(t("payments.messages.created"));
    },
  });

  useEffect(() => {
    if (paymentInvoicesQuery.error) {
      setPaymentMessage(applySessionError(paymentInvoicesQuery.error, t("payments.messages.refreshFailed")));
    }
  }, [paymentInvoicesQuery.error]);

  async function refreshPaymentInvoices() {
    if (!enabled) {
      return;
    }
    setPaymentMessage(null);
    try {
      const invoices = await queryClient.fetchQuery({
        queryFn: () => fetchPaymentInvoices(),
        queryKey: paymentQueryKeys.adminInvoices(),
      });
      queryClient.setQueryData<PaymentInvoice[]>(paymentQueryKeys.adminInvoices(), invoices);
      setPaymentMessage(t("payments.messages.refreshed"));
    } catch (caught) {
      setPaymentMessage(applySessionError(caught, t("payments.messages.refreshFailed")));
    }
  }

  async function createPaymentInvoice(input: PaymentInvoiceCreateInput): Promise<PaymentInvoiceCreated | null> {
    try {
      return await createInvoiceMutation.mutateAsync(input);
    } catch {
      return null;
    }
  }

  return {
    createPaymentInvoice,
    paymentInvoices: enabled ? (paymentInvoicesQuery.data ?? []) : [],
    paymentLoading: paymentInvoicesQuery.isFetching || createInvoiceMutation.isPending,
    paymentMessage,
    refreshPaymentInvoices,
  };
}
