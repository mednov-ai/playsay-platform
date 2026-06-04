import { authConfig, type AuthConfig } from "./auth";
import { apiJson, publicApiJson } from "./http";

export type PaymentInvoiceCreateInput = {
  amountMinor: number;
  currency: string;
  description: string;
  studentUserId?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  dueAt?: string | null;
};

export type PaymentInvoice = {
  id: string;
  number: string;
  status: string;
  amountMinor: number;
  currency: string;
  description: string;
  studentUserId?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  createdBySubject: string;
  dueAt?: string | null;
  paidAt?: string | null;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicPaymentInvoice = {
  number: string;
  status: string;
  amountMinor: number;
  currency: string;
  description: string;
  payerName?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  canceledAt?: string | null;
};

export type PaymentAttempt = {
  id: string;
  invoiceId: string;
  provider: string;
  providerPaymentId?: string | null;
  status: string;
  confirmationUrl?: string | null;
  amountMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentInvoiceCreated = {
  invoice: PaymentInvoice;
  publicUrlToken: string;
};

export type PaymentInvoiceDetail = {
  invoice: PaymentInvoice;
  paymentAttempts: PaymentAttempt[];
};

export type PaymentCheckout = {
  invoiceId: string;
  paymentAttemptId: string;
  confirmationUrl: string;
};

export type PublicPaymentCheckout = {
  confirmationUrl: string;
};

export async function fetchPaymentInvoices(config: AuthConfig = authConfig): Promise<PaymentInvoice[]> {
  return apiJson<PaymentInvoice[]>("/api/payments/admin/invoices", { method: "GET" }, config);
}

export async function createPaymentInvoice(
  input: PaymentInvoiceCreateInput,
  config: AuthConfig = authConfig,
): Promise<PaymentInvoiceCreated> {
  return apiJson<PaymentInvoiceCreated>(
    "/api/payments/admin/invoices",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
    config,
  );
}

export async function fetchPublicPaymentInvoice(publicToken: string): Promise<PublicPaymentInvoice> {
  return publicApiJson<PublicPaymentInvoice>(`/api/public/payment-invoices/${encodeURIComponent(publicToken)}`, { method: "GET" });
}

export async function createPublicPaymentCheckout(publicToken: string): Promise<PublicPaymentCheckout> {
  return publicApiJson<PublicPaymentCheckout>(
    `/api/public/payment-invoices/${encodeURIComponent(publicToken)}/checkout`,
    { method: "POST" },
  );
}
