export function extractPasswordResetCode(messageBody) {
  return String(messageBody || "").match(/(?:^|\D)(\d{6})(?!\d)/u)?.[1] ?? null;
}

export function assertOldPasswordRejected(status) {
  if (status === 400 || status === 401) return;
  throw new Error(status >= 200 && status < 300
    ? "PASSWORD_RESET_SIGN_IN: old credential was accepted"
    : `PASSWORD_RESET_SIGN_IN: old credential check returned HTTP ${status}`);
}

export function assertPasswordResetAccepted(status) {
  if (status !== 200) throw new Error(`PASSWORD_RESET_CONFIRM: reset-password returned HTTP ${status}`);
}

export function assertPasswordSignInAccepted(status) {
  if (status < 200 || status >= 300) throw new Error(`PASSWORD_RESET_SIGN_IN: token endpoint returned HTTP ${status}`);
}

export async function pollForPasswordResetCode({ deadlineAt, loadMessage, loadMessages, now = Date.now, pause, requestedAfter }) {
  while (now() < deadlineAt) {
    const messages = await loadMessages();
    for (const message of messages) {
      const createdAt = Date.parse(message.createdAt ?? "");
      if (Number.isFinite(createdAt) && createdAt + 2_000 < requestedAfter) continue;
      const detail = await loadMessage(message.id);
      const body = [detail.text, ...(Array.isArray(detail.html) ? detail.html : [detail.html])]
        .filter((value) => typeof value === "string")
        .join("\n");
      if (!body.includes("/reset-password?email=")) continue;
      const code = extractPasswordResetCode(body);
      if (code) return code;
    }
    await pause();
  }
  throw new Error("PASSWORD_RESET_EMAIL: reset email did not arrive before the deadline");
}

export async function runRequiredCleanup(cleanups) {
  const results = await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("CLEANUP: one or more required cleanup operations failed");
  }
}
