export const realtimeReconnectBaseDelayMs = 500;
export const realtimeReconnectMaxDelayMs = 10_000;

export function realtimeReconnectDelayMs(
  attempt: number,
  randomValue = Math.random(),
): number {
  const safeAttempt = Math.max(0, Math.min(5, Math.floor(attempt)));
  const baseDelay = Math.min(
    realtimeReconnectMaxDelayMs,
    realtimeReconnectBaseDelayMs * (2 ** safeAttempt),
  );
  const safeRandom = Math.max(0, Math.min(1, randomValue));
  return baseDelay + Math.round(baseDelay * 0.2 * safeRandom);
}
