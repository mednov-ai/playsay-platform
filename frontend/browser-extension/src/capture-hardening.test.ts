import { describe, expect, it, vi } from "vitest";
import { applyCaptureHardening } from "./capture-hardening";

describe("applyCaptureHardening", () => {
  it("attempts every optional guard even when Chrome rejects one", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("Method not supported"))
      .mockResolvedValueOnce(undefined);

    await expect(applyCaptureHardening(send)).resolves.toBeUndefined();

    expect(send).toHaveBeenNthCalledWith(1, "Page.setDownloadBehavior", { behavior: "deny" });
    expect(send).toHaveBeenNthCalledWith(2, "Page.setInterceptFileChooserDialog", { enabled: true });
  });
});
