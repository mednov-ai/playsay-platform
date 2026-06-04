import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../shared/api/playsay";
import { loadInitialPaymentInvoices } from "./useAppController";

describe("loadInitialPaymentInvoices", () => {
  it("keeps the authenticated app usable when payment invoices are temporarily unavailable", async () => {
    const onUnavailable = vi.fn();

    await expect(loadInitialPaymentInvoices({
      canManagePeople: true,
      loadInvoices: () => Promise.reject(
        new ApiError(503, "PAYMENT_SERVICE_UNAVAILABLE", "Payment service unavailable"),
      ),
      onUnavailable,
    })).resolves.toEqual([]);

    expect(onUnavailable).toHaveBeenCalledWith(expect.any(ApiError));
  });
});
