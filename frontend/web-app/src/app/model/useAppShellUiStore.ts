import type { SetStateAction } from "react";
import { create } from "zustand";
import type { WorkspaceTab } from "../../entities/workspace/model";

type AppShellUiStore = {
  profileOpen: boolean;
  resetShellUi: () => void;
  setProfileOpen: (next: SetStateAction<boolean>) => void;
  setWorkspaceTab: (next: SetStateAction<WorkspaceTab>) => void;
  workspaceTab: WorkspaceTab;
};

function resolveSetStateAction<Value>(next: SetStateAction<Value>, current: Value): Value {
  return typeof next === "function" ? (next as (current: Value) => Value)(current) : next;
}

export const useAppShellUiStore = create<AppShellUiStore>((set) => ({
  profileOpen: false,
  resetShellUi: () => set({ profileOpen: false, workspaceTab: "schedule" }),
  setProfileOpen: (next) => set((state) => ({ profileOpen: resolveSetStateAction(next, state.profileOpen) })),
  setWorkspaceTab: (next) => set((state) => ({ workspaceTab: resolveSetStateAction(next, state.workspaceTab) })),
  workspaceTab: "schedule",
}));
