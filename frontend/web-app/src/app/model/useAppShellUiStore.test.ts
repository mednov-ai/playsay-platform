import { beforeEach, describe, expect, it } from "vitest";
import { useAppShellUiStore } from "./useAppShellUiStore";

describe("useAppShellUiStore", () => {
  beforeEach(() => {
    useAppShellUiStore.getState().resetShellUi();
  });

  it("keeps the selected workspace tab outside the app data controller", () => {
    useAppShellUiStore.getState().setWorkspaceTab("materials");

    expect(useAppShellUiStore.getState().workspaceTab).toBe("materials");
  });

  it("resets workspace state when the authenticated session is cleared", () => {
    useAppShellUiStore.getState().setWorkspaceTab("billing");

    useAppShellUiStore.getState().resetShellUi();

    expect(useAppShellUiStore.getState().workspaceTab).toBe("schedule");
  });
});
