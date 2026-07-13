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

type PathnameHistorySource = {
  location: { pathname: string };
  addEventListener(type: "popstate", listener: () => void): void;
  removeEventListener(type: "popstate", listener: () => void): void;
};

export function subscribeToPathnameHistory(
  source: PathnameHistorySource,
  onPathnameChange: (pathname: string) => void,
): () => void {
  function updatePathname() {
    onPathnameChange(source.location.pathname);
  }

  source.addEventListener("popstate", updatePathname);
  return () => source.removeEventListener("popstate", updatePathname);
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
