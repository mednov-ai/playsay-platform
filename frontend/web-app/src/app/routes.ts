export function classroomPath(lessonId: string): string {
  return `/lessons/${lessonId}/classroom`;
}

export function lessonPreparationPath(lessonId: string): string {
  return `/lessons/${encodeURIComponent(lessonId)}/prepare`;
}

export function lessonPreparationIdFromPath(pathname: string): string | null {
  const match = /^\/lessons\/([^/]+)\/prepare\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function classroomLessonIdFromPath(pathname: string): string | null {
  const match = /^\/lessons\/([^/]+)\/classroom\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function paymentPath(publicToken: string): string {
  return `/pay/${encodeURIComponent(publicToken)}`;
}

export function paymentTokenFromPath(pathname: string): string | null {
  const match = /^\/pay\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function profilePath(): string {
  return "/profile";
}

export function isProfilePath(pathname: string): boolean {
  return /^\/profile\/?$/.test(pathname);
}

type PathnameHistoryMutation = (data: unknown, unused: string, url?: string | URL | null) => void;

type PathnameHistorySource = {
  location: { pathname: string };
  history?: {
    pushState: PathnameHistoryMutation;
    replaceState: PathnameHistoryMutation;
  };
  addEventListener(type: "popstate", listener: () => void): void;
  removeEventListener(type: "popstate", listener: () => void): void;
};

type PathnameHistorySubscription = {
  callbacks: Set<(pathname: string) => void>;
  notify: () => void;
  originalPushState?: PathnameHistoryMutation;
  originalReplaceState?: PathnameHistoryMutation;
};

const pathnameHistorySubscriptions = new WeakMap<object, PathnameHistorySubscription>();

export function subscribeToPathnameHistory(
  source: PathnameHistorySource,
  onPathnameChange: (pathname: string) => void,
): () => void {
  let subscription = pathnameHistorySubscriptions.get(source);
  if (!subscription) {
    const callbacks = new Set<(pathname: string) => void>();
    const notify = () => callbacks.forEach((callback) => callback(source.location.pathname));
    subscription = { callbacks, notify };
    source.addEventListener("popstate", notify);

    if (source.history) {
      const history = source.history;
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      subscription.originalPushState = originalPushState;
      subscription.originalReplaceState = originalReplaceState;
      history.pushState = (data, unused, url) => {
        originalPushState.call(history, data, unused, url);
        notify();
      };
      history.replaceState = (data, unused, url) => {
        originalReplaceState.call(history, data, unused, url);
        notify();
      };
    }
    pathnameHistorySubscriptions.set(source, subscription);
  }

  subscription.callbacks.add(onPathnameChange);
  return () => {
    const current = pathnameHistorySubscriptions.get(source);
    if (!current) {
      return;
    }
    current.callbacks.delete(onPathnameChange);
    if (current.callbacks.size > 0) {
      return;
    }
    source.removeEventListener("popstate", current.notify);
    if (source.history && current.originalPushState && current.originalReplaceState) {
      source.history.pushState = current.originalPushState;
      source.history.replaceState = current.originalReplaceState;
    }
    pathnameHistorySubscriptions.delete(source);
  };
}

const profileReturnPathKey = "playsayProfileReturnPath";

export function profileHistoryState(returnPath: string): Record<string, string> {
  return { [profileReturnPathKey]: returnPath };
}

export function profileReturnPathFromHistoryState(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }
  const returnPath = (state as Record<string, unknown>)[profileReturnPathKey];
  return typeof returnPath === "string" && returnPath.startsWith("/") ? returnPath : null;
}

export function isStudentInvitePath(pathname: string): boolean {
  return /^\/join\/?$/.test(pathname);
}

export function lessonAccessRouteFromPath(pathname: string): { lessonId: string; auth: boolean } | null {
  const match = /^\/lesson-access\/([^/]+)(\/auth)?\/?$/.exec(pathname);
  return match ? { lessonId: decodeURIComponent(match[1]), auth: Boolean(match[2]) } : null;
}

export type RegistrationRoute =
  | { kind: "start" }
  | { kind: "check-email" }
  | { kind: "confirm" }
  | { kind: "forgot-password" }
  | { kind: "reset-password" };

export function registrationRouteFromPath(pathname: string): RegistrationRoute | null {
  if (/^\/register\/?$/.test(pathname)) {
    return { kind: "start" };
  }
  if (/^\/register\/check-email\/?$/.test(pathname)) {
    return { kind: "check-email" };
  }
  if (/^\/register\/confirm\/?$/.test(pathname)) {
    return { kind: "confirm" };
  }
  if (/^\/forgot-password\/?$/.test(pathname)) {
    return { kind: "forgot-password" };
  }
  if (/^\/reset-password\/?$/.test(pathname)) {
    return { kind: "reset-password" };
  }
  return null;
}
