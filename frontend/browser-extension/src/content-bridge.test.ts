import { describe, expect, it, vi } from "vitest";
import { forwardPageCommand } from "./content-bridge";
import { inputResult, type PageCommand } from "./protocol";

const command = {
  version: 1,
  type: "INPUT",
  sessionId: "session-1",
  nonce: "nonce-1",
  eventId: "event-1",
  input: { type: "key", action: "down", key: "a" },
} satisfies PageCommand;

describe("content bridge", () => {
  it("forwards a matching worker result", async () => {
    const post = vi.fn();
    await forwardPageCommand(command, async () => inputResult(command, "DISPATCHED", 3), post);
    expect(post).toHaveBeenCalledWith(inputResult(command, "DISPATCHED", 3));
  });

  it("surfaces a closed worker channel without raw errors", async () => {
    const post = vi.fn();
    await forwardPageCommand(command, async () => { throw new Error("private runtime detail"); }, post);
    expect(post).toHaveBeenCalledWith(inputResult(command, "BRIDGE_UNAVAILABLE"));
    expect(JSON.stringify(post.mock.calls)).not.toContain("private runtime detail");
  });

  it("rejects stale or malformed worker responses", async () => {
    const post = vi.fn();
    await forwardPageCommand(command, async () => inputResult({ ...command, eventId: "old" }, "DISPATCHED"), post);
    expect(post).toHaveBeenCalledWith(inputResult(command, "BRIDGE_UNAVAILABLE"));
  });
});
