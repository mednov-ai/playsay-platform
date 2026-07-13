import type { SetStateAction } from "react";
import { create } from "zustand";
import type { WorkspaceTab } from "../../entities/workspace/model";

type AppShellUiStore = {
  resetShellUi: () => void;
  setWorkspaceTab: (next: SetStateAction<WorkspaceTab>) => void;
  workspaceTab: WorkspaceTab;
};

function resolveSetStateAction<Value>(next: SetStateAction<Value>, current: Value): Value {
  return typeof next === "function" ? (next as (current: Value) => Value)(current) : next;
}

export const useAppShellUiStore = create<AppShellUiStore>((set) => ({
  resetShellUi: () => set({ workspaceTab: "schedule" }),
  setWorkspaceTab: (next) => set((state) => ({ workspaceTab: resolveSetStateAction(next, state.workspaceTab) })),
  workspaceTab: "schedule",
}));
