import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/errors";
import { deleteUser, fetchUserDeletionOperation, waitForUserDeletion, type UserDeletionOperation } from "./userManagement";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/api/http", () => ({ apiJson: request }));
afterEach(() => { vi.useRealTimers(); request.mockReset(); });

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
  it.each(["DELETE", "GET"])("aborts a hung %s after 30 seconds without a retry", async (method) => {
    vi.useFakeTimers();
    request.mockImplementation(() => new Promise(() => {}));
    const result = (method === "DELETE" ? deleteUser("target") : fetchUserDeletionOperation("operation"))
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ errorCode: "USER_DELETE_TIMEOUT" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("rejects malformed accepted responses instead of claiming success", async () => {
    request.mockResolvedValue({ status: "COMPLETED" });
    await expect(deleteUser("target")).rejects.toMatchObject({ errorCode: "USER_DELETE_INVALID_RESPONSE" });
  });
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

  it("keeps a terminal response on the last allowed poll", async () => {
    const result = await waitForUserDeletion(operation("PENDING"), {
      load: async () => operation("COMPLETED"), maxAttempts: 1, pause: async () => {},
    });
    expect(result.status).toBe("COMPLETED");
  });

  it("passes the remaining wall clock budget to the status request", async () => {
    let now = 0;
    const load = vi.fn().mockResolvedValue(operation("COMPLETED"));
    await waitForUserDeletion(operation("PENDING"), {
      load, now: () => now, pause: async () => { now = 59_500; },
    });
    expect(load).toHaveBeenCalledWith("operation-1", 500);
  });

  it("does not poll after the overall deadline", async () => {
    let now = 0;
    const load = vi.fn();
    await expect(waitForUserDeletion(operation("PENDING"), {
      load, now: () => now, pause: async () => { now = 60_000; },
    })).rejects.toMatchObject({ errorCode: "USER_DELETE_TIMEOUT" });
    expect(load).not.toHaveBeenCalled();
  });
});
