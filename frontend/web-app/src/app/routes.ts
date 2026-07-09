export function classroomPath(lessonId: string): string {
  return `/lessons/${lessonId}/classroom`;
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
