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
      const context = await browser.newContext({ locale, reducedMotion: "reduce", viewport });
      await context.addInitScript(({ language }) => {
        window.localStorage.setItem("playsay.language", language);
        window.sessionStorage.setItem("playsay.auth.tokens", JSON.stringify({ accessToken: "teacher-smoke", expiresAt: Date.now() + 3_600_000 }));
      }, { language: locale });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route((url) => url.pathname.startsWith("/api/"), (route) => fulfillApi(route, locale));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByTestId("workspace-switcher-trigger").click({ timeout: 10_000 });
      await page.locator('[data-tab-id="homework"]').click();
      const panel = page.locator(".playsay-homework-panel");
      await panel.waitFor();

      const kindGroup = panel.getByRole("group").first();
      await kindGroup.getByRole("button").nth(1).click();
      const studentChecks = panel.locator('input[type="checkbox"]');
      await studentChecks.nth(0).check();
      await studentChecks.nth(1).check();
      const composer = panel.getByTestId("personal-practice-composer");
      await composer.waitFor();
      await composer.locator("summary").first().click();
      const policySelect = composer.locator("select").last();
      await policySelect.selectOption("TEACHER_REVIEW");

      await panel.getByRole("button", { name: /Review words/ }).click();
      await panel.locator('input[maxlength="1000"]').waitFor();
      const metricCards = panel.locator("dl dt");
      if (await metricCards.count() < 6) throw new Error(`${locale}-${viewport.name}: diagnostic report is incomplete`);

      const state = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        language: document.documentElement.lang,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        text: document.body.innerText,
      }));
      if (state.language !== locale) throw new Error(`${locale}-${viewport.name}: expected lang=${locale}, got ${state.language}`);
      if (!state.reducedMotion) throw new Error(`${locale}-${viewport.name}: reduced motion is not active`);
      if (state.horizontalOverflow > 1) throw new Error(`${locale}-${viewport.name}: horizontal overflow ${state.horizontalOverflow}px`);
      if (/(?:vocabulary|homework)\.(?:practice|live|vocabularyPolicy|report|review)/.test(state.text)) {
        throw new Error(`${locale}-${viewport.name}: untranslated key is visible`);
      }
      if (pageErrors.length) throw new Error(`${locale}-${viewport.name}: ${pageErrors.join(" | ")}`);
      await page.keyboard.press("Tab");
      checks.push(`${locale}-${viewport.name}-multi-preview-policy-review-accessibility`);
      await context.close();
    }
  }
  process.stdout.write(`${JSON.stringify({ checks }, null, 2)}\n`);
} finally {
  await browser.close();
}

async function fulfillApi(route, locale) {
  const request = route.request();
  const url = new URL(request.url());
  const now = "2026-08-20T18:00:00Z";
  const students = ["student-a", "student-b"].map((subject, index) => ({
    displayName: `Learner ${index + 1}`,
    lessonTranslationAllowed: true,
    locale,
    managedByTeacher: true,
    name: `Learner ${index + 1}`,
    roles: ["STUDENT"],
    subject,
    updatedAt: now,
    username: subject,
  }));
  const assignment = {
    activityRef: "practice-1",
    completionPolicy: "TEACHER_REVIEW",
    contentKind: "VOCABULARY_PRACTICE",
    createdAt: now,
    id: "assignment-1",
    recipientCount: 1,
    scoredCount: 0,
    status: "ACTIVE",
    submittedCount: 0,
    title: "Review words",
    type: "HOMEWORK",
    updatedAt: now,
  };
  const entry = {
    createdAt: now,
    id: "entry-1",
    practicePaused: false,
    sourceLanguage: "en",
    sourceText: "steady",
    status: "ACTIVE",
    targetLanguage: locale,
    translation: locale === "ru" ? "устойчивый" : "stable",
    translationState: "CONFIRMED",
    updatedAt: now,
  };
  let body = [];
  if (url.pathname === "/api/me") body = { name: "Teacher", roles: ["TEACHER"], subject: "teacher-1", username: "teacher" };
  else if (url.pathname === "/api/users/me/profile") body = { displayName: "Teacher", lessonTranslationAllowed: true, locale, managedByTeacher: false, name: "Teacher", roles: ["TEACHER"], subject: "teacher-1", updatedAt: now, username: "teacher" };
  else if (url.pathname === "/api/users/students") body = students;
  else if (url.pathname === "/api/assignments") body = [assignment];
  else if (url.pathname === "/api/assignments/assignment-1") body = {
    assignment,
    recipients: [{ accuracy: 0.62, activityRef: "session-1", activityState: "AWAITING_REVIEW", activeDurationMs: 300000, assignmentId: assignment.id, completionRatio: 1, difficultWordCount: 2, distinctEntries: 4, distinctGradedPrompts: 8, hasSubmission: false, hintsUsed: 1, masteryRatio: 0.7, showGroupIndicator: false, studentName: "Learner 1", studentSubject: "student-a", studentUserId: "user-a", submitted: false, updatedAt: now }],
  };
  else if (url.pathname === "/api/vocabulary/practices/preview") body = {
    categoryCounts: { DUE_TODAY: 2, DIFFICULT: 1 },
    delivery: "HOMEWORK",
    estimatedMinutes: 5,
    exclusions: [{ entryId: "missing", reason: "MISSING_TRANSLATION" }],
    expiresAt: now,
    mode: "BALANCED",
    owners: students.map((student) => ({ dueCount: 1, entries: [entry], estimatedItemCount: 2, needsTranslationCount: 0, newCount: 0, ownerName: student.displayName, ownerSubject: student.subject, selectedCount: 1, selection: [{ entry, readinessWarnings: [], reason: "DUE_TODAY" }] })),
    planId: "plan-teacher",
    revision: 1,
  };
  else if (url.pathname === "/api/vocabulary/selection-recipes") body = [{ createdAt: now, excludedEntryIds: [], id: "recipe-1", mode: "BALANCED", name: "Due and difficult", pinnedEntryIds: [], revision: 1, selection: { sources: ["DUE", "DIFFICULT"], targetMinutes: 10 }, updatedAt: now, wordLimit: 10 }];
  else if (url.pathname === "/api/materials" || url.pathname === "/api/schedule/lessons") body = [];
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });
}
