#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import {
  assertOldPasswordRejected,
  assertPasswordResetAccepted,
  pollForPasswordResetCode,
} from "./registration-smoke-helpers.mjs";

const webBaseUrl = stripTrailingSlash(process.env.PLAY_SAY_REGISTRATION_SMOKE_WEB_BASE_URL ?? "https://dev.online.honey.school");
const authIssuer = stripTrailingSlash(
  process.env.PLAY_SAY_REGISTRATION_SMOKE_AUTH_ISSUER
    ?? "https://dev.ops.honey.school/keycloak/realms/playsay",
);
const authClientId = process.env.PLAY_SAY_REGISTRATION_SMOKE_AUTH_CLIENT_ID ?? "playsay-web";
const playwrightPackageDir = process.env.PLAYWRIGHT_PACKAGE_DIR ?? "/Users/evgeniymednov/.codex/tools/playwright";
const mailboxApiBaseUrl = stripTrailingSlash(process.env.PLAY_SAY_REGISTRATION_SMOKE_MAILBOX_API ?? "https://api.mail.tm");
const sshHost = process.env.PLAY_SAY_REGISTRATION_SMOKE_SSH_HOST ?? "playsay@10.60.0.30";
const sshJumpHost = process.env.PLAY_SAY_REGISTRATION_SMOKE_SSH_JUMP_HOST ?? "root@65.109.55.110";
const sshIdentityFile = process.env.PLAY_SAY_REGISTRATION_SMOKE_SSH_IDENTITY_FILE
  ?? "/Users/evgeniymednov/.ssh/play_and_say_vps_ed25519";
const namespace = process.env.PLAY_SAY_REGISTRATION_SMOKE_NAMESPACE ?? "playsay-dev";
const headless = process.env.PLAY_SAY_REGISTRATION_SMOKE_HEADLESS !== "false";
const timeoutMs = Number(process.env.PLAY_SAY_REGISTRATION_SMOKE_TIMEOUT_MS ?? 60_000);
const mailboxTimeoutMs = Number(process.env.PLAY_SAY_REGISTRATION_SMOKE_MAILBOX_TIMEOUT_MS ?? 120_000);
const runId = `registration-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}`;

const summary = {
  runId,
  webOrigin: new URL(webBaseUrl).origin,
  checks: [],
};

let browser;
let mailbox = null;
let registrationMayExist = false;

try {
  mailbox = await createDisposableMailbox();
  const accountPassword = `River${randomBytes(8).toString("hex")}Z9!`;
  const displayName = "Smoke Learner";
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${webBaseUrl}/register`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const submit = page.locator('form button[type="submit"]');
  if (!await submit.isEnabled()) {
    throw new Error("CLIENT_VALIDATION_BLOCKED: create-account control is disabled before input");
  }
  summary.checks.push("submit-operable-before-input");

  await page.locator("#registration-email").fill(mailbox.address);
  await page.locator("#registration-password").fill(accountPassword);
  await page.locator("#registration-password-confirm").fill(accountPassword);
  await page.locator('input[type="text"][maxlength="120"]').fill(displayName);

  const unsatisfiedRules = await page.locator('#registration-password-hints li[data-status="not-satisfied"]').count();
  if (unsatisfiedRules !== 0 || !await submit.isEnabled()) {
    throw new Error(`CLIENT_VALIDATION_BLOCKED: valid synthetic form has ${unsatisfiedRules} unsatisfied rules`);
  }
  summary.checks.push("valid-form-operable");

  const startResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/registration/start") && response.request().method() === "POST",
    { timeout: timeoutMs },
  );
  registrationMayExist = true;
  await submit.click();
  const startResponse = await startResponsePromise;
  if (startResponse.status() !== 202) {
    throw new Error(`REGISTRATION_SERVICE: registration start returned HTTP ${startResponse.status()}`);
  }
  await page.getByRole("dialog").waitFor({ timeout: timeoutMs });
  summary.checks.push("registration-start-accepted");

  const confirmationUrl = await waitForConfirmationUrl(mailbox);
  summary.checks.push("confirmation-email-received");

  const confirmResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/registration/confirm") && response.request().method() === "POST",
    { timeout: timeoutMs },
  );
  await page.goto(confirmationUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const confirmResponse = await confirmResponsePromise;
  if (confirmResponse.status() !== 200) {
    throw new Error(`CONFIRMATION: registration confirmation returned HTTP ${confirmResponse.status()}`);
  }
  summary.checks.push("registration-confirmed");
  await confirmRegistrationAgain(confirmationUrl);
  summary.checks.push("repeated-confirmation-idempotent");

  const tokenSet = await signInWithPassword(mailbox.address, accountPassword);
  const claims = decodeJwtClaims(tokenSet.access_token);
  const realmRoles = Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : [];
  if (!realmRoles.includes("STUDENT")) {
    throw new Error("OIDC_SIGN_IN: access token does not contain STUDENT role");
  }
  summary.checks.push("first-oidc-sign-in-with-student-role");
  await verifyStudentProfile(tokenSet.access_token);
  summary.checks.push("student-profile-verified");

  const passwordResetRequestedAt = Date.now();
  const forgotResponse = await fetch(`${webBaseUrl}/api/registration/forgot-password`, {
    body: JSON.stringify({ email: mailbox.address, locale: "en" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (forgotResponse.status !== 202) {
    throw new Error(`PASSWORD_RESET_REQUEST: forgot-password returned HTTP ${forgotResponse.status}`);
  }
  summary.checks.push("PASSWORD_RESET_REQUEST");

  const resetCode = await waitForPasswordResetCode(mailbox, passwordResetRequestedAt);
  summary.checks.push("PASSWORD_RESET_EMAIL");
  const newPassword = `Meadow${randomBytes(8).toString("hex")}Q7!`;
  const resetResponse = await fetch(`${webBaseUrl}/api/registration/reset-password`, {
    body: JSON.stringify({ code: resetCode, email: mailbox.address, newPassword }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  });
  assertPasswordResetAccepted(resetResponse.status);
  summary.checks.push("PASSWORD_RESET_CONFIRM");

  await expectPasswordSignInRejected(mailbox.address, accountPassword);
  await signInWithPassword(mailbox.address, newPassword);
  summary.checks.push("PASSWORD_RESET_SIGN_IN");

  await context.close();
} catch (error) {
  console.error(`Registration smoke failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (registrationMayExist && mailbox?.address) {
    try {
      cleanupRegisteredIdentity(mailbox.address);
      summary.checks.push("registered-identity-cleaned");
    } catch (error) {
      console.error(`Registration cleanup failed: ${sanitizeError(error)}`);
      process.exitCode = 1;
    }
  }
  if (mailbox) {
    try {
      await deleteDisposableMailbox(mailbox);
      summary.checks.push("disposable-mailbox-cleaned");
    } catch {
      console.error("Disposable mailbox cleanup failed.");
      process.exitCode = 1;
    }
  }
}
console.log(JSON.stringify(summary, null, 2));

function loadPlaywright() {
  const requireFromTools = createRequire(path.join(playwrightPackageDir, "package.json"));
  return requireFromTools("playwright");
}

async function createDisposableMailbox() {
  const domains = await mailboxRequest("/domains?page=1");
  const domain = domains["hydra:member"]?.find((candidate) => candidate.isActive !== false)?.domain;
  if (!domain) {
    throw new Error("MAILBOX: no active disposable domain is available");
  }
  const address = `honey-reg-${Date.now()}-${randomBytes(3).toString("hex")}@${domain}`;
  const password = randomBytes(24).toString("base64url");
  const account = await mailboxRequest("/accounts", {
    body: JSON.stringify({ address, password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }, 201);
  const tokenResponse = await mailboxRequest("/token", {
    body: JSON.stringify({ address, password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }, 200);
  return { accountId: account.id, address, token: tokenResponse.token };
}

async function waitForConfirmationUrl(mailboxAccount) {
  const deadline = Date.now() + mailboxTimeoutMs;
  while (Date.now() < deadline) {
    const messages = await mailboxRequest("/messages?page=1", {
      headers: { Authorization: `Bearer ${mailboxAccount.token}` },
    });
    for (const message of messages["hydra:member"] ?? []) {
      const detail = await mailboxRequest(`/messages/${encodeURIComponent(message.id)}`, {
        headers: { Authorization: `Bearer ${mailboxAccount.token}` },
      });
      const body = [detail.text, ...(Array.isArray(detail.html) ? detail.html : [detail.html])]
        .filter((value) => typeof value === "string")
        .join("\n")
        .replaceAll("&amp;", "&");
      const match = body.match(/https:\/\/[^\s"'<>]+\/register\/confirm\?token=[^\s"'<>]+/u);
      if (match) {
        return match[0];
      }
    }
    await delay(4_000);
  }
  throw new Error("EMAIL_DELIVERY: confirmation email did not arrive before the deadline");
}

async function waitForPasswordResetCode(mailboxAccount, requestedAfter) {
  return pollForPasswordResetCode({
    deadlineAt: Date.now() + mailboxTimeoutMs,
    loadMessage: async (messageId) => mailboxRequest(`/messages/${encodeURIComponent(messageId)}`, {
      headers: { Authorization: `Bearer ${mailboxAccount.token}` },
    }),
    loadMessages: async () => {
      const messages = await mailboxRequest("/messages?page=1", {
        headers: { Authorization: `Bearer ${mailboxAccount.token}` },
      });
      return messages["hydra:member"] ?? [];
    },
    pause: () => delay(4_000),
    requestedAfter,
  });
}

async function signInWithPassword(username, password) {
  const body = new URLSearchParams({
    client_id: authClientId,
    grant_type: "password",
    password,
    username,
  });
  const response = await fetch(`${authIssuer}/protocol/openid-connect/token`, {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`OIDC_SIGN_IN: token endpoint returned HTTP ${response.status}`);
  }
  return response.json();
}

async function expectPasswordSignInRejected(username, password) {
  const body = new URLSearchParams({ client_id: authClientId, grant_type: "password", password, username });
  const response = await fetch(`${authIssuer}/protocol/openid-connect/token`, {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  });
  assertOldPasswordRejected(response.status);
}

async function confirmRegistrationAgain(confirmationUrl) {
  const token = new URL(confirmationUrl).searchParams.get("token");
  if (!token) {
    throw new Error("CONFIRMATION: confirmation URL has no token");
  }
  const response = await fetch(`${webBaseUrl}/api/registration/confirm`, {
    body: JSON.stringify({ token }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200) {
    throw new Error(`CONFIRMATION: repeated confirmation returned HTTP ${response.status}`);
  }
}

async function verifyStudentProfile(accessToken) {
  const response = await fetch(`${webBaseUrl}/api/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200) {
    throw new Error(`OIDC_SIGN_IN: profile endpoint returned HTTP ${response.status}`);
  }
  const profile = await response.json();
  if (!Array.isArray(profile.roles) || !profile.roles.includes("STUDENT")) {
    throw new Error("OIDC_SIGN_IN: profile endpoint does not contain STUDENT role");
  }
}

function cleanupRegisteredIdentity(address) {
  if (!/^[a-z0-9._%+@-]+$/iu.test(address)) {
    throw new Error("CLEANUP: generated address contains unsafe characters");
  }
  const remoteCommand = [
    "set -eu",
    `target_namespace=${shellQuote(namespace)}`,
    `target_email=${shellQuote(address)}`,
    "service_token=$(sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl -n \"$target_namespace\" get secret playsay-registration -o jsonpath='{.data.service-token}' | base64 -d)",
    "service_ip=$(sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl -n \"$target_namespace\" get service registration-service -o jsonpath='{.spec.clusterIP}')",
    "service_port=$(sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl -n \"$target_namespace\" get service registration-service -o jsonpath='{.spec.ports[0].port}')",
    "identity=$(curl --connect-timeout 5 --max-time 20 -fsS -G -H \"X-PlaySay-Service-Token: $service_token\" --data-urlencode \"identifier=$target_email\" \"http://$service_ip:$service_port/api/internal/user-management/users/exact\")",
    "subject=$(printf '%s' \"$identity\" | jq -r '.subject // empty' 2>/dev/null || true)",
    "if [ -n \"$subject\" ]; then curl --connect-timeout 5 --max-time 20 -fsS -o /dev/null -X DELETE -H \"X-PlaySay-Service-Token: $service_token\" \"http://$service_ip:$service_port/api/internal/user-management/users/$subject\"; fi",
    "remaining=$(curl --connect-timeout 5 --max-time 20 -fsS -G -H \"X-PlaySay-Service-Token: $service_token\" --data-urlencode \"identifier=$target_email\" \"http://$service_ip:$service_port/api/internal/user-management/users/exact\")",
    "remaining_subject=$(printf '%s' \"$remaining\" | jq -r '.subject // empty' 2>/dev/null || true)",
    "test -z \"$remaining_subject\"",
    "unset service_token identity subject remaining remaining_subject service_ip service_port target_email target_namespace",
  ].join("; ");
  try {
    execFileSync("ssh", [
      "-i", sshIdentityFile,
      "-o", "IdentitiesOnly=yes",
      "-o", `ProxyCommand=ssh -i ${sshIdentityFile} -o IdentitiesOnly=yes -W %h:%p ${sshJumpHost}`,
      sshHost,
      remoteCommand,
    ], { stdio: ["ignore", "ignore", "ignore"], timeout: 60_000 });
  } catch {
    throw new Error("CLEANUP: approved identity cleanup command failed");
  }
}

async function deleteDisposableMailbox(mailboxAccount) {
  await mailboxRequest(`/accounts/${encodeURIComponent(mailboxAccount.accountId)}`, {
    headers: { Authorization: `Bearer ${mailboxAccount.token}` },
    method: "DELETE",
  }, 204);
}

async function mailboxRequest(route, options = {}, expectedStatus = 200) {
  const response = await fetch(`${mailboxApiBaseUrl}${route}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(20_000),
  });
  if (response.status !== expectedStatus) {
    throw new Error(`MAILBOX: ${route.split("?")[0]} returned HTTP ${response.status}`);
  }
  return expectedStatus === 204 ? null : response.json();
}

function decodeJwtClaims(token) {
  const payload = token.split(".")[1];
  if (!payload) {
    throw new Error("OIDC_SIGN_IN: token response is malformed");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function sanitizeError(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/giu, "[redacted-email]")
    .replace(/([?&]token=)[^\s&]+/giu, "$1[redacted-token]");
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/u, "");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
