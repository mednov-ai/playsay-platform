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
