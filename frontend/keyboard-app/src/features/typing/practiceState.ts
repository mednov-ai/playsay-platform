import type { ChordSet, LayoutId } from "../../shared/types";

export const practiceStateStorageKey = "playsay.key.practiceState";

type PracticeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface PersistedNextDecision {
  kind: "up" | "down" | "repeat";
  setId?: number;
  focusSet?: ChordSet;
}

export interface PersistedPracticeState {
  version: 1;
  ownerKey: string;
  layoutId: LayoutId;
  activeSetId?: number;
  activeFocusSet?: ChordSet;
  pendingNext?: PersistedNextDecision;
  introDismissed?: boolean;
}

export type PracticeStateInput = Omit<PersistedPracticeState, "version"> & { version?: 1 };

function browserStorage(): PracticeStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function practiceOwnerKey(params: { subject?: string | null; anonymousDeviceId: string }): string {
  return params.subject ? `auth:${params.subject}` : `guest:${params.anonymousDeviceId}`;
}

export function readPracticeState(
  ownerKey: string,
  storage: PracticeStorage | null = browserStorage(),
): PersistedPracticeState | null {
  const value = storage?.getItem(practiceStateStorageKey);
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PersistedPracticeState>;
    if (parsed.version !== 1 || parsed.ownerKey !== ownerKey || !isLayoutId(parsed.layoutId)) {
      return null;
    }

    const activeFocusSet = sanitizeFocusSet(parsed.activeFocusSet, parsed.layoutId);
    const pendingNext = sanitizePendingNext(parsed.pendingNext, parsed.layoutId);
    return {
      version: 1,
      ownerKey,
      layoutId: parsed.layoutId,
      activeSetId: sanitizeSetId(parsed.activeSetId),
      activeFocusSet,
      pendingNext,
      introDismissed: parsed.introDismissed === true,
    };
  } catch {
    return null;
  }
}

export function writePracticeState(
  input: PracticeStateInput,
  storage: PracticeStorage | null = browserStorage(),
): PersistedPracticeState {
  const next: PersistedPracticeState = {
    version: 1,
    ownerKey: input.ownerKey,
    layoutId: input.layoutId,
    activeSetId: sanitizeSetId(input.activeSetId),
    activeFocusSet: sanitizeFocusSet(input.activeFocusSet, input.layoutId),
    pendingNext: sanitizePendingNext(input.pendingNext, input.layoutId),
    introDismissed: input.introDismissed === true,
  };
  storage?.setItem(practiceStateStorageKey, JSON.stringify(next));
  return next;
}

export function updatePracticeState(
  ownerKey: string,
  updater: (current: PersistedPracticeState | null) => PracticeStateInput,
  storage: PracticeStorage | null = browserStorage(),
): PersistedPracticeState {
  return writePracticeState(updater(readPracticeState(ownerKey, storage)), storage);
}

export function markPracticeIntroDismissed(
  ownerKey: string,
  storage: PracticeStorage | null = browserStorage(),
): PersistedPracticeState {
  return updatePracticeState(
    ownerKey,
    (current) => ({
      ownerKey,
      layoutId: current?.layoutId ?? "EN",
      activeSetId: current?.activeSetId,
      activeFocusSet: current?.activeFocusSet,
      pendingNext: current?.pendingNext,
      introDismissed: true,
    }),
    storage,
  );
}

export function clearPracticeState(storage: PracticeStorage | null = browserStorage()): void {
  storage?.removeItem(practiceStateStorageKey);
}

export function persistActivePracticeSet(params: {
  ownerKey: string;
  layoutId: LayoutId;
  set: ChordSet;
  introDismissed?: boolean;
}): PersistedPracticeState {
  return updatePracticeState(params.ownerKey, (current) => ({
    ownerKey: params.ownerKey,
    layoutId: params.layoutId,
    activeSetId: params.set.id > 0 ? params.set.id : undefined,
    activeFocusSet: params.set.id < 0 ? params.set : undefined,
    introDismissed: params.introDismissed ?? current?.introDismissed,
  }));
}

export function persistPendingNextDecision(params: {
  ownerKey: string;
  layoutId: LayoutId;
  activeSet: ChordSet;
  pendingNext?: { kind: "up" | "down" | "repeat"; set: ChordSet } | null;
}): PersistedPracticeState {
  return updatePracticeState(params.ownerKey, (current) => ({
    ownerKey: params.ownerKey,
    layoutId: params.layoutId,
    activeSetId: params.activeSet.id > 0 ? params.activeSet.id : undefined,
    activeFocusSet: params.activeSet.id < 0 ? params.activeSet : undefined,
    pendingNext: params.pendingNext
      ? {
          kind: params.pendingNext.kind,
          setId: params.pendingNext.set.id > 0 ? params.pendingNext.set.id : undefined,
          focusSet: params.pendingNext.set.id < 0 ? params.pendingNext.set : undefined,
        }
      : undefined,
    introDismissed: current?.introDismissed,
  }));
}

export function resolvePersistedPracticeSet(
  state: PersistedPracticeState | null | undefined,
  sets: ChordSet[],
): ChordSet | undefined {
  if (!state) {
    return undefined;
  }

  const pendingSet = state.pendingNext?.focusSet ?? sets.find((set) => set.id === state.pendingNext?.setId);
  if (pendingSet && pendingSet.layout === state.layoutId) {
    return pendingSet;
  }

  const activeSet = state.activeFocusSet ?? sets.find((set) => set.id === state.activeSetId);
  return activeSet?.layout === state.layoutId ? activeSet : undefined;
}

function isLayoutId(value: unknown): value is LayoutId {
  return value === "EN" || value === "RU";
}

function sanitizeSetId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function sanitizePendingNext(
  value: unknown,
  layoutId: LayoutId,
): PersistedNextDecision | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<PersistedNextDecision>;
  if (candidate.kind !== "up" && candidate.kind !== "down" && candidate.kind !== "repeat") {
    return undefined;
  }

  const setId = sanitizeSetId(candidate.setId);
  const focusSet = sanitizeFocusSet(candidate.focusSet, layoutId);
  if (!setId && !focusSet) {
    return undefined;
  }

  return {
    kind: candidate.kind,
    setId,
    focusSet,
  };
}

function sanitizeFocusSet(value: unknown, layoutId: LayoutId): ChordSet | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<ChordSet>;
  if (candidate.id !== -1 || candidate.layout !== layoutId || !Array.isArray(candidate.chords)) {
    return undefined;
  }

  const chords = candidate.chords.filter((chord): chord is string => typeof chord === "string" && chord.length > 0);
  if (chords.length === 0) {
    return undefined;
  }

  return {
    id: -1,
    sourceChordSetId: typeof candidate.sourceChordSetId === "number" ? candidate.sourceChordSetId : undefined,
    focusProblemKeys: Array.isArray(candidate.focusProblemKeys)
      ? candidate.focusProblemKeys.filter((key): key is string => typeof key === "string" && key.length > 0)
      : undefined,
    layout: layoutId,
    title: typeof candidate.title === "string" && candidate.title.length > 0 ? candidate.title : "Focus",
    difficulty: 0,
    tier: "beginner",
    chords,
  };
}
