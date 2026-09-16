export function debuggerEventRefreshesViewport(method: string, params?: object): boolean {
  if (method === "Page.frameResized" || method === "Page.loadEventFired") return true;
  if (method !== "Page.frameNavigated") return false;
  const frame = params && "frame" in params ? params.frame : undefined;
  return Boolean(frame && typeof frame === "object" && !("parentId" in frame));
}
