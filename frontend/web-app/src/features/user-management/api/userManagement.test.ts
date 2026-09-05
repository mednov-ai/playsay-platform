import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/errors";
import { waitForUserDeletion, type UserDeletionOperation } from "./userManagement";

function operation(status: UserDeletionOperation["status"], errorCode: string | null = null): UserDeletionOperation {
  return {
    operationId: "operation-1",
    targetSubject: "unused-student",
    status,
    errorCode,
    createdAt: "2026-09-05T10:00:00Z",
    updatedAt: "2026-09-05T10:00:00Z",
    completedAt: status === "COMPLETED" ? "2026-09-05T10:00:01Z" : null,
  };
}

describe("user deletion operation", () => {
  it("waits for the asynchronous operation to complete", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(operation("RUNNING"))
      .mockResolvedValueOnce(operation("COMPLETED"));

    const completed = await waitForUserDeletion(operation("PENDING"), {
      load,
      pause: () => Promise.resolve(),
    });

    expect(completed.status).toBe("COMPLETED");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("preserves the safe backend error code when deletion fails", async () => {
    const caught = await waitForUserDeletion(operation("FAILED", "USER_DELETE_FAILED"), {
      pause: () => Promise.resolve(),
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).errorCode).toBe("USER_DELETE_FAILED");
  });

  it.each(["COMPLETED", "FAILED"] as const)("handles %s on the final allowed poll", async (status) => {
    const load = vi.fn().mockResolvedValue(operation(status, status === "FAILED" ? "USER_DELETE_FAILED" : null));
    const result = waitForUserDeletion(operation("PENDING"), {
      load,
      maxAttempts: 1,
      pause: () => Promise.resolve(),
    });
    if (status === "COMPLETED") {
      await expect(result).resolves.toMatchObject({ status });
    } else {
      await expect(result).rejects.toMatchObject({ errorCode: "USER_DELETE_FAILED" });
    }
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports a bounded polling timeout", async () => {
    const load = vi.fn().mockResolvedValue(operation("RUNNING"));
    const caught = await waitForUserDeletion(operation("PENDING"), {
      load,
      maxAttempts: 2,
      pause: () => Promise.resolve(),
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).errorCode).toBe("USER_DELETE_TIMEOUT");
  });
});
