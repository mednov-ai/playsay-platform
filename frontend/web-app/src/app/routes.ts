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

export type RegistrationRoute =
  | { kind: "start" }
  | { kind: "check-email" }
  | { kind: "confirm" };

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
  return null;
}
