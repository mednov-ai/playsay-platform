#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";

const baseUrl = process.env.PLAY_SAY_VOCABULARY_UI_BASE_URL ?? "http://127.0.0.1:4178";
const playwrightPackageDir = process.env.PLAYWRIGHT_PACKAGE_DIR ?? "/Users/evgeniymednov/.codex/tools/playwright";
const requireFromTools = createRequire(path.join(playwrightPackageDir, "package.json"));
const { chromium } = requireFromTools("playwright");
const browser = await chromium.launch({ headless: true });
const checks = [];

try {
  for (const locale of ["ru", "en", "de", "fr"]) {
    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
      const context = await browser.newContext({
        locale,
        reducedMotion: "reduce",
        viewport,
      });
      await context.addInitScript(({ language }) => {
        window.localStorage.setItem("playsay.language", language);
        window.sessionStorage.setItem("playsay.auth.tokens", JSON.stringify({
          accessToken: "vocabulary-visual-smoke",
          expiresAt: Date.now() + 3_600_000,
        }));
      }, { language: locale });
      const page = await context.newPage();
      const mediaState = mediaStateFor(locale, viewport.name);
      const pageErrors = [];
      const consoleErrors = [];
      const failedRequests = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("requestfailed", (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
      await page.route((url) => url.pathname.startsWith("/api/"), (route) => fulfillApi(route, locale, mediaState));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByTestId("workspace-switcher-trigger").click({ timeout: 10_000 }).catch(async (error) => {
        throw new Error(`${locale}-${viewport.name}: app shell did not load: ${await page.locator("body").innerText()} pageErrors=${pageErrors.join(" | ")} console=${consoleErrors.join(" | ")} failed=${failedRequests.join(" | ")} (${error.message})`);
      });
      await page.locator('[data-tab-id="vocabulary"]').click();
      const composer = page.getByTestId("student-practice-composer");
      await composer.waitFor();

      await page.locator("section > div.border-b button").nth(1).click();
      const mediaCard = page.locator(".vocabulary-media-card");
      await mediaCard.waitFor();
      if (mediaState === "APPROVED") {
        await mediaCard.locator("img").waitFor();
        await mediaCard.getByRole("button").filter({ hasText: /Wrong image|Не та картинка|Falsches Bild|Mauvaise image/ }).waitFor();
        await mediaCard.getByRole("button").filter({ hasText: /Generate another|Создать другую|Neues erstellen|En créer une autre/ }).waitFor();
      } else {
        await mediaCard.locator(".vocabulary-media-card__placeholder").waitFor();
      }
      await assertPageState(page, locale, `${locale}-${viewport.name}-media-${mediaState}`);
      await page.locator("section > div.border-b button").first().click();

      await assertPageState(page, locale, `${locale}-${viewport.name}-workspace`);
      await composer.locator(":scope > button").last().click();
      await page.getByRole("heading", { name: "Write steady" }).waitFor();
      await assertPageState(page, locale, `${locale}-${viewport.name}-player`);

      let focusedTag = "";
      for (let index = 0; index < 12; index += 1) {
        await page.keyboard.press("Tab");
        focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
        if (["A", "BUTTON", "INPUT", "SELECT", "SUMMARY"].includes(focusedTag)) break;
      }
      if (!["A", "BUTTON", "INPUT", "SELECT", "SUMMARY"].includes(focusedTag)) {
        throw new Error(`${locale}-${viewport.name}: keyboard focus did not reach an interactive control`);
      }
      checks.push(`${locale}-${viewport.name}-workspace-player-keyboard-reduced-motion`);
      await context.close();
    }
  }

  process.stdout.write(`${JSON.stringify({ checks }, null, 2)}\n`);
} finally {
  await browser.close();
}

async function assertPageState(page, locale, label) {
  const state = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    language: document.documentElement.lang,
    mediaCardBounds: document.querySelector(".vocabulary-media-card")?.getBoundingClientRect().toJSON() ?? null,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    text: document.body.innerText,
    viewportWidth: document.documentElement.clientWidth,
  }));
  if (state.language !== locale) throw new Error(`${label}: expected lang=${locale}, got ${state.language}`);
  if (!state.reducedMotion) throw new Error(`${label}: reduced-motion preference was not applied`);
  if (state.horizontalOverflow > 1) throw new Error(`${label}: horizontal overflow is ${state.horizontalOverflow}px`);
  if (state.mediaCardBounds && (state.mediaCardBounds.left < -1 || state.mediaCardBounds.right > state.viewportWidth + 1)) {
    throw new Error(`${label}: media card is clipped outside the viewport (${JSON.stringify(state.mediaCardBounds)})`);
  }
  if (/vocabulary\.(?:selfComposer|practice|studentFilters|occurrences|media)/.test(state.text)) {
    throw new Error(`${label}: an untranslated vocabulary key is visible`);
  }
}

async function fulfillApi(route, locale, mediaState) {
  const request = route.request();
  const url = new URL(request.url());
  const pathName = url.pathname;
  const now = "2026-08-20T18:00:00Z";
  const entry = {
    createdAt: "2026-08-01T10:00:00Z",
    example: "Keep a steady pace.",
    favorite: true,
    id: "entry-1",
    occurrences: [{ context: "Keep a steady pace.", createdAt: "2026-08-19T10:00:00Z", lessonId: "lesson-1", sourceType: "LESSON" }],
    practicePaused: false,
    sourceLanguage: "en",
    sourceText: "steady",
    status: "ACTIVE",
    targetLanguage: locale === "ru" ? "ru" : locale,
    translation: locale === "ru" ? "устойчивый" : locale === "de" ? "stetig" : locale === "fr" ? "stable" : "stable",
    translationState: "CONFIRMED",
    updatedAt: "2026-08-19T10:00:00Z",
  };
  const session = {
    attemptCount: 0,
    completedItems: 0,
    correctCount: 0,
    currentItem: {
      affectsSchedule: true,
      content: { type: "FORM_INPUT" },
      entryId: entry.id,
      exerciseType: "FORM_INPUT",
      id: "item-1",
      options: [],
      position: 0,
      prompt: "Write steady",
      schemaVersion: 2,
      skill: "FORM",
    },
    delivery: "SELF",
    helpRequested: false,
    id: "session-1",
    lastAcknowledgedPosition: 0,
    mode: "BALANCED",
    ownerSubject: "student-1",
    revision: 1,
    status: "NOT_STARTED",
    totalItems: 1,
    updatedAt: now,
  };
  let body = [];
  let status = 200;

  if (pathName === "/api/me") {
    body = { name: "Visual Student", roles: ["STUDENT"], subject: "student-1", username: "visual-student" };
  } else if (pathName === "/api/users/me/profile") {
    body = { displayName: "Visual Student", lessonTranslationAllowed: true, locale, managedByTeacher: false, name: "Visual Student", roles: ["STUDENT"], subject: "student-1", updatedAt: now, username: "visual-student" };
  } else if (pathName === "/api/vocabulary/dashboard") {
    body = {
      difficultCount: 1,
      dueCount: 1,
      entries: [{
        dueAt: "2026-08-20T09:00:00Z",
        entry,
        overdue: true,
        skills: [{ available: true, difficultyScore: 0.7, dueAt: "2026-08-20T09:00:00Z", intervalIndex: 1, lapseCount: 1, policyVersion: "adaptive-v1", reviewReason: "DIFFICULT", skill: "FORM", stage: "LEARNING", successStreak: 0 }],
        stage: "LEARNING",
      }],
      lastPracticedAt: "2026-08-18T09:00:00Z",
      learningCount: 1,
      masteredCount: 0,
      needsTranslationCount: 0,
      ownerName: "Visual Student",
      ownerSubject: "student-1",
      ownerUsername: "visual-student",
      totalCount: 1,
    };
  } else if (pathName === "/api/vocabulary/practices/recommended-preview") {
    body = {
      delivery: "SELF",
      estimatedMinutes: 2,
      expiresAt: "2026-08-21T18:00:00Z",
      mode: "BALANCED",
      owners: [{ dueCount: 1, entries: [entry], estimatedItemCount: 1, needsTranslationCount: 0, newCount: 0, ownerSubject: "student-1", selectedCount: 1, selection: [{ entry, readinessWarnings: [], reason: "DIFFICULT" }] }],
      planId: "plan-1",
      revision: 1,
    };
  } else if (pathName === "/api/vocabulary/practices/self" && request.method() === "POST") {
    body = { createdAt: now, delivery: "SELF", id: "practice-1", mode: "BALANCED", sessions: [session], status: "ACTIVE", updatedAt: now };
  } else if (pathName === "/api/vocabulary/selection-recipes" || pathName === "/api/vocabulary/practice-sessions") {
    body = [];
  } else if (pathName === "/api/vocabulary/practice-sessions/session-1") {
    body = session;
  } else if (pathName === "/api/vocabulary/entries/entry-1/media") {
    body = mediaView(mediaState);
  } else if (pathName === "/api/vocabulary/entries/entry-1/media/assets/asset-1/content") {
    if (mediaState === "INACCESSIBLE") {
      body = { message: "not authorized" };
      status = 403;
    } else {
      await route.fulfill({ body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64"), contentType: "image/png", status: 200 });
      return;
    }
  } else if (request.method() === "DELETE") {
    body = "";
    status = 204;
  }

  await route.fulfill({
    body: typeof body === "string" ? body : JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

function mediaStateFor(locale, viewport) {
  const states = {
    "ru-desktop": "APPROVED", "ru-mobile": "GENERATING",
    "en-desktop": "HIDDEN", "en-mobile": "FAILED",
    "de-desktop": "NO_IMAGE", "de-mobile": "TEXT_ONLY",
    "fr-desktop": "INACCESSIBLE", "fr-mobile": "APPROVED",
  };
  return states[`${locale}-${viewport}`];
}

function mediaView(state) {
  const approved = state === "APPROVED" || state === "INACCESSIBLE";
  return {
    entryId: "entry-1",
    senseId: "sense-1",
    imageability: state === "TEXT_ONLY" ? "NON_IMAGEABLE" : "IMAGEABLE",
    state: approved ? "APPROVED" : state,
    generationPending: state === "GENERATING",
    hidden: state === "HIDDEN",
    alternatives: [],
    asset: approved ? { id: "asset-1", senseId: "sense-1", state: "APPROVED", contentUrl: "/api/vocabulary/entries/entry-1/media/assets/asset-1/content", contentType: "image/png", origin: "GENERATED", generatorType: "STUB", generatorModel: "visual-v1", promptTemplateVersion: "vocabulary-image-v1", safetyState: "SAFE", altText: { en: "A steady metronome" }, decorative: false, createdAt: "2026-08-20T18:00:00Z", reviewHistory: [] } : null,
  };
}
