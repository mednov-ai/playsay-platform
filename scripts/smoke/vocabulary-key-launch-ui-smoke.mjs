#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";

const baseUrl = process.env.PLAY_SAY_KEYBOARD_UI_BASE_URL ?? "http://127.0.0.1:4179";
const playwrightPackageDir = process.env.PLAYWRIGHT_PACKAGE_DIR ?? "/Users/evgeniymednov/.codex/tools/playwright";
const requireFromTools = createRequire(path.join(playwrightPackageDir, "package.json"));
const { chromium } = requireFromTools("playwright");
const browser = await chromium.launch({ headless: true });
const sessionId = "11111111-1111-4111-a111-111111111111";
const checks = [];

try {
  for (const mode of ["WHOLE_WORDS", "CHARACTER_NGRAMS", "MIXED"]) {
    const context = await browser.newContext({ locale: "en", viewport: { width: 1280, height: 800 } });
    await installAuthenticatedSession(context);
    const page = await context.newPage();
    let fallbackPracticeRequests = 0;
    await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/me") return json(route, me());
      if (url.pathname === "/api/training/claim-anonymous") return json(route, claimProgress());
      if (url.pathname === "/api/vocabulary/practice") {
        fallbackPracticeRequests += 1;
        return json(route, { entries: [{ id: "default-entry", sourceText: "WRONG DEFAULT" }] });
      }
      if (url.pathname === `/api/vocabulary/practice-sessions/${sessionId}/key-set`) {
        return json(route, vocabularyLaunch(mode));
      }
      return json(route, {});
    });
    await page.goto(`${baseUrl}/?vocabularySessionId=${sessionId}&returnTo=${encodeURIComponent("https://online.honey.school/vocabulary")}`);
    const contextPanel = page.locator(".vocabulary-context");
    await contextPanel.waitFor({ timeout: 10_000 }).catch(async (error) => {
      throw new Error(`${mode}: explicit launch did not render: ${await page.locator("body").innerText()} (${error.message})`);
    });
    const title = await contextPanel.locator("strong").innerText();
    if (!title.includes(`Acceptance ${mode}`)) throw new Error(`${mode}: vocabulary set did not win selection (${title})`);
    if (fallbackPracticeRequests !== 0) throw new Error(`${mode}: generic vocabulary fallback raced the explicit session`);
    if (await page.locator(".vocabulary-launch-error").count()) throw new Error(`${mode}: unexpected launch error`);
    checks.push(`${mode.toLowerCase()}-explicit-launch-precedence`);
    await context.close();
  }

  const errorContext = await browser.newContext({ locale: "en", viewport: { width: 390, height: 844 } });
  await installAuthenticatedSession(errorContext);
  const errorPage = await errorContext.newPage();
  await errorPage.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me") return json(route, me());
    if (url.pathname === "/api/training/claim-anonymous") return json(route, claimProgress());
    if (url.pathname.includes("/key-set")) return json(route, { internalDiagnostic: "SECRET SESSION DETAIL" }, 403);
    return json(route, {});
  });
  await errorPage.goto(`${baseUrl}/?vocabularySessionId=${sessionId}&returnTo=${encodeURIComponent("https://online.honey.school/vocabulary")}`);
  const alert = errorPage.locator(".vocabulary-launch-error");
  await alert.waitFor({ timeout: 10_000 });
  const errorText = await alert.innerText();
  if (errorText.includes("SECRET") || errorText.includes("403")) throw new Error("safe launch error exposed backend details");
  const returnHref = await alert.locator("a").getAttribute("href");
  if (returnHref !== "https://online.honey.school/vocabulary") throw new Error(`unexpected safe return target: ${returnHref}`);
  checks.push("foreign-unavailable-safe-error-return");
  await errorContext.close();

  const ordinaryContext = await browser.newContext({ locale: "en", viewport: { width: 1280, height: 800 } });
  await installAuthenticatedSession(ordinaryContext);
  const ordinaryPage = await ordinaryContext.newPage();
  await ordinaryPage.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me") return json(route, me());
    if (url.pathname === "/api/training/claim-anonymous") return json(route, claimProgress());
    if (url.pathname === "/api/vocabulary/practice") return json(route, { entries: [] });
    return json(route, {});
  });
  await ordinaryPage.goto(baseUrl);
  await ordinaryPage.getByText("RU · Letter pairs · home row", { exact: true }).last().waitFor({ timeout: 10_000 }).catch(async (error) => {
    throw new Error(`ordinary startup did not restore controls: ${await ordinaryPage.locator("body").innerText()} (${error.message})`);
  });
  if (await ordinaryPage.locator(".vocabulary-context, .vocabulary-launch-error").count()) {
    throw new Error("ordinary startup incorrectly entered vocabulary launch state");
  }
  checks.push("ordinary-startup-restored-set");
  await ordinaryContext.close();

  process.stdout.write(`${JSON.stringify({ checks }, null, 2)}\n`);
} finally {
  await browser.close();
}

async function installAuthenticatedSession(context) {
  await context.addInitScript(() => {
    window.sessionStorage.setItem("playsay.keyboard.auth.tokens", JSON.stringify({
      accessToken: "keyboard-vocabulary-smoke",
      expiresAt: Date.now() + 3_600_000,
    }));
    window.localStorage.setItem("playsay.language", "en");
    window.localStorage.setItem("playsay.key.practiceState", JSON.stringify({
      version: 1,
      ownerKey: "auth:student-1",
      layoutId: "RU",
      activeSetId: 5,
      introDismissed: true,
    }));
  });
}

function vocabularyLaunch(mode) {
  const whole = { targetId: "22222222-2222-4222-a222-222222222222", position: 0, type: "WHOLE_WORD", text: "capybara", sourceEntryIds: ["entry-1"], sourceItemIds: ["item-1"], offsets: [] };
  const ngram = { targetId: "33333333-3333-4333-a333-333333333333", position: mode === "MIXED" ? 1 : 0, type: "CHARACTER_NGRAM", text: "bara", sourceEntryIds: ["entry-1"], sourceItemIds: ["item-1"], offsets: [] };
  return {
    sessionId,
    title: `Acceptance ${mode}`,
    entries: [{ id: "entry-1", sourceText: "capybara" }],
    items: [{ itemId: "item-1", entryId: "entry-1", sourceText: "capybara" }],
    mode,
    layout: "EN",
    materializerVersion: "vocabulary-key-v1",
    materializerSeed: 42,
    ngramSettings: { minLength: 3, maxLength: 4, targetLimit: 12, maxRepetitions: 1 },
    targets: mode === "WHOLE_WORDS" ? [whole] : mode === "CHARACTER_NGRAMS" ? [ngram] : [whole, ngram],
    completionContext: { delivery: "HOMEWORK", completionPolicy: "MEANINGFUL_ACTIVITY", completionPolicyVersion: "acceptance-v1", lastAcknowledgedPosition: 0 },
    returnContext: { target: "HONEY_SCHOOL_VOCABULARY", path: "/" },
  };
}

function me() {
  return { id: "user-1", subject: "student-1", username: "student", displayName: "Student", roles: ["STUDENT"] };
}

function claimProgress() {
  return { claimedResults: 0, progress: { sessions: 0, bestSpeedCpm: 0, avgSpeedCpm: 0, avgAccuracy: 0, weakFingers: [], recent: [] } };
}

async function json(route, body, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}
