/** A bounded request includes authentication and body reads, with parent cancellation. */
export async function gameRequest<T>(request: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let rejectTimeout: (error: Error) => void = () => undefined;
  const deadline = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  const cancel = () => { controller.abort(); rejectTimeout(new Error("GAME_REQUEST_CANCELLED")); };
  const timer = window.setTimeout(() => { controller.abort(); rejectTimeout(new Error("GAME_REQUEST_TIMEOUT")); }, 30_000);
  parent?.addEventListener("abort", cancel, { once: true });
  if (parent?.aborted) cancel();
  try { return await Promise.race([request(controller.signal), deadline]); }
  finally { window.clearTimeout(timer); parent?.removeEventListener("abort", cancel); }
}
