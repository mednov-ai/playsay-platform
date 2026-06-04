import { beforeEach, describe, expect, it } from "vitest";
import { useAppShellUiStore } from "./useAppShellUiStore";

describe("useAppShellUiStore", () => {
  beforeEach(() => {
    useAppShellUiStore.getState().resetShellUi();
  });

  it("keeps shell panel state outside the app data controller", () => {
    useAppShellUiStore.getState().setProfileOpen((current) => !current);
    useAppShellUiStore.getState().setWorkspaceTab("materials");

    expect(useAppShellUiStore.getState().profileOpen).toBe(true);
    expect(useAppShellUiStore.getState().workspaceTab).toBe("materials");
  });

  it("resets workspace state when the authenticated session is cleared", () => {
    useAppShellUiStore.getState().setProfileOpen(true);
    useAppShellUiStore.getState().setWorkspaceTab("billing");

    useAppShellUiStore.getState().resetShellUi();

    expect(useAppShellUiStore.getState().profileOpen).toBe(false);
    expect(useAppShellUiStore.getState().workspaceTab).toBe("schedule");
  });
});
