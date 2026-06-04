import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPaymentInvoice,
  createPublicPaymentCheckout,
  fetchPaymentInvoices,
  fetchPublicPaymentInvoice,
} from "./payments";

vi.mock("./auth", () => ({
  authConfig: {},
  clearTokens: vi.fn(),
  getValidAccessToken: vi.fn(async () => "access-token"),
}));

vi.mock("./locale", () => ({
  currentApiLanguage: () => "en",
}));

describe("payment API client", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the deployed /api prefix for payment routes", async () => {
    await fetchPaymentInvoices();
    await createPaymentInvoice({
      amountMinor: 10000,
      currency: "RUB",
      description: "Test invoice",
      dueAt: null,
      payerEmail: null,
      payerName: null,
      payerPhone: null,
      studentUserId: null,
    });
    await fetchPublicPaymentInvoice("public token");
    await createPublicPaymentCheckout("public token");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/payments/admin/invoices",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/payments/admin/invoices",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/public/payment-invoices/public%20token",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/public/payment-invoices/public%20token/checkout",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
