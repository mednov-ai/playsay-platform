#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const webBaseUrl = stripTrailingSlash(process.env.PLAY_SAY_SMOKE_WEB_BASE_URL ?? "https://online.play-and-say.ru");
const apiBaseUrl = stripTrailingSlash(process.env.PLAY_SAY_SMOKE_API_BASE_URL ?? new URL("/api", `${webBaseUrl}/`).toString());
const authIssuer = stripTrailingSlash(process.env.PLAY_SAY_SMOKE_AUTH_ISSUER ?? "https://ops.play-and-say.ru:18443/keycloak/realms/playsay");
const authClientId = process.env.PLAY_SAY_SMOKE_AUTH_CLIENT_ID ?? "playsay-web";
const playwrightPackageDir = process.env.PLAYWRIGHT_PACKAGE_DIR ?? "/Users/evgeniymednov/.codex/tools/playwright";
const sshHost = process.env.PLAY_SAY_SMOKE_SSH_HOST ?? "root@146.103.126.15";
const headless = process.env.PLAY_SAY_SMOKE_HEADLESS !== "false";
const timeoutMs = Number(process.env.PLAY_SAY_SMOKE_TIMEOUT_MS ?? 45_000);
const annotationScreenshotPath = process.env.PLAY_SAY_SMOKE_ANNOTATION_SCREENSHOT_PATH?.trim() || null;
const annotationOnly = process.env.PLAY_SAY_SMOKE_ANNOTATION_ONLY === "true";
const runId = `sprint5-ui-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const tokenStorageKey = "playsay.auth.tokens";

const demoUsers = {
  teacher: {
    envPassword: "PLAY_SAY_SMOKE_TEACHER_PASSWORD",
    envUsername: "PLAY_SAY_SMOKE_TEACHER_USERNAME",
    secretKey: "teacher-demo-password",
    username: "teacher-demo",
  },
  studentA: {
    envPassword: "PLAY_SAY_SMOKE_STUDENT_A_PASSWORD",
    envUsername: "PLAY_SAY_SMOKE_STUDENT_A_USERNAME",
    secretKey: "student-demo-password",
    username: "student-demo",
  },
  studentB: {
    envPassword: "PLAY_SAY_SMOKE_STUDENT_B_PASSWORD",
    envUsername: "PLAY_SAY_SMOKE_STUDENT_B_USERNAME",
    secretKey: "student-demo-2-password",
    username: "student-demo-2",
  },
};

const summary = {
  runId,
  webBaseUrl,
  checks: [],
  lessonId: null,
  materialId: null,
};

const created = {
  lessonId: null,
  materialRequest: null,
  materialId: null,
};

let browser;
const sessions = [];

try {
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ headless });

  const passwords = readDemoPasswords();
  const teacher = await createSession(browser, "teacher", passwords.teacher);
  const studentA = await createSession(browser, "studentA", passwords.studentA);
  const studentB = await createSession(browser, "studentB", passwords.studentB);
  sessions.push(teacher, studentA, studentB);

  const [rawStudentAProfile, studentBProfile] = await Promise.all([
    apiRequest(studentA.tokens.accessToken, "GET", "/users/me/profile", 200),
    apiRequest(studentB.tokens.accessToken, "GET", "/users/me/profile", 200),
  ]);
  const studentAProfile = await ensureStudentBirthDate(studentA.tokens.accessToken, rawStudentAProfile);
  addCheck("keycloak-login-and-profiles");

  if (!annotationOnly) {
    await verifyAiTutorPersonaSwitching(teacher.page);
    addCheck("ai-tutor-personas-switch-animated-avatar");
  }

  const material = await createSmokeMaterial(teacher.tokens.accessToken);
  created.materialId = material.id;
  summary.materialId = material.id;

  const lesson = await createSmokeLesson(
    teacher.tokens.accessToken,
    material.id,
    [studentAProfile.subject, studentBProfile.subject],
  );
  created.lessonId = lesson.id;
  summary.lessonId = lesson.id;
  addCheck("temporary-group-lesson-created");

  if (!annotationOnly) {
    await verifyAiDialogAllowanceGrantAndDebit(teacher, studentA, studentAProfile.subject);
    addCheck("ai-dialog-allowance-grant-and-net-zero-debit");
  }

  await Promise.all([
    ensureCollaborationDocument(studentA.tokens.accessToken, lesson.id, material.id, "GROUP"),
  ]);
  addCheck("shared-collaboration-document-precreated");

  await openClassroom(teacher.page, lesson.id, "[data-testid='lesson-material-surface']", { revealTeacherTask: true });
  await Promise.all([
    openClassroom(studentA.page, lesson.id, "[data-testid='lesson-material-surface']"),
    openClassroom(studentB.page, lesson.id, "[data-testid='lesson-material-surface']"),
  ]);
  addCheck("classroom-opened-for-teacher-and-two-students");

  await Promise.all([
    assertStudentDocumentChromeHidden(studentA.page),
    assertStudentDocumentChromeHidden(studentB.page),
  ]);
  addCheck("student-workspace-hides-document-tabs-and-side-editor");

  if (annotationOnly) {
    await drawTextAndMindMap(teacher.page);
    await captureAnnotationScreenshot(teacher.page);
    addCheck("text-and-mind-map-use-compact-content-bounds");
  } else {
    await waitForSharedPresenceReady(teacher.page, studentA.page, studentB.page);
    await drawTextAndMindMap(teacher.page);
    await captureAnnotationScreenshot(teacher.page);
    addCheck("text-and-mind-map-use-compact-content-bounds");
    await clearMaterialCursors(teacher.page, studentA.page, studentB.page);
    await verifyMaterialCursor(studentA.page, studentB.page);
    await verifyMaterialCursorAlignment(studentA.page, studentB.page, 0.34, 0.38, "student A cursor on student B");
    await clearMaterialCursors(teacher.page, studentA.page, studentB.page);
    await verifyMaterialCursorAlignment(studentB.page, studentA.page, 0.62, 0.32, "student B cursor on student A");
    await clearMaterialCursors(teacher.page, studentA.page, studentB.page);
    await verifyMaterialCursorAlignment(teacher.page, studentA.page, 0.49, 0.46, "teacher cursor on student A");
    await verifyMaterialCursorAlignment(teacher.page, studentB.page, 0.49, 0.46, "teacher cursor on student B");
    addCheck("material-presence-cursors-are-aligned-and-clipped");

    await drawAnnotation(studentA.page);
    await waitForLocatorCount(studentB.page, "[data-testid='lesson-material-surface'] .playsay-annotation-layer path.playsay-annotation-element", 1, "student B annotation path");
    await assertAnnotationInsideSurface(studentB.page);
    await scrollMaterialDocument(studentB.page, 120);
    await assertAnnotationInsideSurface(studentB.page);
    await studentB.page.setViewportSize({ width: 920, height: 820 });
    await assertAnnotationInsideSurface(studentB.page);
    addCheck("annotation-sync-stays-inside-material-after-scroll-and-resize");

    await studentB.page.reload({ waitUntil: "domcontentloaded" });
    await completeClassroomPreJoin(studentB.page);
    await studentB.page.locator("[data-testid='lesson-material-surface']").waitFor({ timeout: timeoutMs });
    await waitForSharedPresenceReady(studentB.page);
    await waitForLocatorCount(studentB.page, "[data-testid='lesson-material-surface'] .playsay-annotation-layer path.playsay-annotation-element", 1, "student B annotation path after reload");
    addCheck("reconnect-restores-annotations");

    await submitStudentMaterialWork(studentA.page, studentA.tokens.accessToken, lesson.id);
    addCheck("student-material-submit-creates-submission");
  }

  await cleanup(teacher.tokens.accessToken);
  addCheck("cleanup-completed");

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  try {
    const teacherToken = sessions.find((session) => session.role === "teacher")?.tokens.accessToken;
    if (teacherToken) {
      await cleanup(teacherToken);
    }
  } catch {
    // Keep the smoke failure focused on the original error.
  }
  console.error(`Sprint 5 UI smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(sessions.map((session) => session.context.close()));
  await browser?.close();
}

function loadPlaywright() {
  const requireFromTools = createRequire(path.join(playwrightPackageDir, "package.json"));
  return requireFromTools("playwright");
}

function readDemoPasswords() {
  return Object.fromEntries(
    Object.entries(demoUsers).map(([role, user]) => [
      role,
      {
        password: process.env[user.envPassword] ?? readPasswordFromDevSecret(user.secretKey),
        username: process.env[user.envUsername] ?? user.username,
      },
    ]),
  );
}

function readPasswordFromDevSecret(secretKey) {
  if (process.env.PLAY_SAY_SMOKE_FETCH_PASSWORDS === "false") {
    throw new Error(`Missing password env for ${secretKey}; secret fetching is disabled.`);
  }
  try {
    return execFileSync(
      "ssh",
      [
        sshHost,
        `kubectl -n keycloak get secret keycloak-dev-users -o jsonpath='{.data.${secretKey}}' | base64 -d`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    throw new Error(`Unable to read ${secretKey} from dev Keycloak secret.`);
  }
}

async function createSession(nextBrowser, role, credentials) {
  const context = await nextBrowser.newContext({
    ignoreHTTPSErrors: true,
    viewport: role === "teacher" ? { width: 1440, height: 920 } : { width: 1180, height: 860 },
  });
  const page = await context.newPage();
  const tokens = await loginWithKeycloakUi(page, credentials);

  await context.addInitScript(({ storageKey, tokenSet }) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify(tokenSet));
  }, { storageKey: tokenStorageKey, tokenSet: tokens });

  return { context, page, role, tokens };
}

async function verifyAiTutorPersonaSwitching(page) {
  await page.goto(webBaseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await openWorkspaceTab(page, "aiTutor");
  await page.locator('[data-testid="ai-tutor-avatar-image"]').waitFor({ timeout: timeoutMs });

  const animationAssets = ["blink", "blink-half", "mouth-small", "mouth-open", "mouth-wide"]
    .flatMap((layer) => ["maya", "leo", "nova"].map((personaId) => `/avatars/animated/${personaId}/${layer}.webp`));
  const unavailableAssets = await page.evaluate(async (assetUrls) => {
    const checks = await Promise.all(assetUrls.map(async (assetUrl) => {
      const response = await fetch(assetUrl, { cache: "no-store" });
      return response.ok && response.headers.get("content-type")?.includes("image/webp") ? null : assetUrl;
    }));
    return checks.filter(Boolean);
  }, animationAssets);
  if (unavailableAssets.length > 0) {
    throw new Error(`AI tutor animation assets are unavailable: ${unavailableAssets.join(", ")}`);
  }

  for (const personaId of ["maya", "leo", "nova"]) {
    const card = page.locator(`[data-testid="ai-tutor-persona-card-${personaId}"]`);
    await card.click();
    const radio = card.locator('input[type="radio"]');
    if (!await radio.isChecked()) {
      throw new Error(`AI tutor persona ${personaId} was not selected.`);
    }
    await page.waitForFunction((nextPersonaId) => {
      const stage = document.querySelector('[data-testid="ai-tutor-avatar-stage"]');
      const image = document.querySelector('[data-testid="ai-tutor-avatar-image"]');
      const animationLayers = Array.from(stage?.querySelectorAll('[data-avatar-layer]') ?? []);
      return stage?.getAttribute("data-persona-id") === nextPersonaId &&
        image instanceof HTMLImageElement &&
        image.getAttribute("src") === `/avatars/${nextPersonaId}.webp` &&
        image.complete &&
        image.naturalWidth > 0 &&
        animationLayers.length === 5 &&
        animationLayers.every((layer) => layer instanceof HTMLImageElement &&
          layer.getAttribute("src")?.startsWith(`/avatars/animated/${nextPersonaId}/`) &&
          layer.complete && layer.naturalWidth > 0) &&
        image.parentElement?.getAttribute("data-avatar-fallback") === "false";
    }, personaId, { timeout: timeoutMs });
  }

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (horizontalOverflow > 1) {
    throw new Error(`AI tutor layout overflows horizontally by ${horizontalOverflow}px.`);
  }
}

async function verifyAiDialogAllowanceGrantAndDebit(teacher, student, studentSubject) {
  const before = await apiRequest(student.tokens.accessToken, "GET", "/ai-tutor/dialog-allowance", 200);
  if (!before.limited || !Number.isInteger(before.remainingDialogs) || before.maxDurationSeconds !== 600) {
    throw new Error(`Unexpected student dialog allowance: ${JSON.stringify(before)}`);
  }
  if (!before.canStart || before.remainingDialogs < 1) {
    throw new Error(`AI dialog smoke requires at least one existing demo credit: ${JSON.stringify(before)}`);
  }

  const teacherAllowances = await apiRequest(teacher.tokens.accessToken, "GET", "/ai-tutor/teacher/dialog-allowances", 200);
  const studentAllowance = teacherAllowances.find((entry) => entry.studentSubject === studentSubject);
  if (!studentAllowance) {
    throw new Error(`Teacher allowance list does not include lesson participant ${studentSubject}.`);
  }

  const session = await apiRequest(student.tokens.accessToken, "POST", "/ai-tutor/sessions", 201, {
    clientRequestId: randomUUID(),
    feedbackMode: "SIGNIFICANT",
    personaId: "maya",
    scenarioId: "meet-someone",
  });
  if (!session.realtime?.available || !session.expiresAt) {
    throw new Error("AI dialog smoke expected live Realtime credentials and a server expiry.");
  }
  await apiRequest(student.tokens.accessToken, "POST", `/ai-tutor/sessions/${session.id}/finish`, 200);

  const granted = await apiRequest(
    teacher.tokens.accessToken,
    "POST",
    `/ai-tutor/teacher/dialog-allowances/${studentAllowance.studentUserId}/grants`,
    200,
    { quantity: 1, requestId: randomUUID() },
  );
  if (granted.remainingDialogs !== before.remainingDialogs) {
    throw new Error(`Dialog grant did not restore the debited balance: before=${before.remainingDialogs}, after=${granted.remainingDialogs}.`);
  }

  const after = await apiRequest(student.tokens.accessToken, "GET", "/ai-tutor/dialog-allowance", 200);
  if (after.remainingDialogs !== before.remainingDialogs) {
    throw new Error(`AI dialog smoke did not restore the original balance: before=${before.remainingDialogs}, after=${after.remainingDialogs}.`);
  }

  await teacher.page.goto(webBaseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await openWorkspaceTab(teacher.page, "aiTutor");
  await teacher.page.locator('[data-testid="ai-tutor-teacher-allowances"]').waitFor({ timeout: timeoutMs });
  await teacher.page.locator(`[data-student-id="${studentAllowance.studentUserId}"]`).waitFor({ timeout: timeoutMs });

  await student.page.goto(webBaseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await openWorkspaceTab(student.page, "aiTutor");
  await student.page.locator('[data-testid="ai-tutor-dialog-allowance"]').waitFor({ timeout: timeoutMs });
}

async function openWorkspaceTab(page, tabId) {
  const tab = page.locator(`[data-tab-id="${tabId}"]`);
  if (await tab.count() === 0) {
    const trigger = page.locator('[data-testid="workspace-switcher-trigger"]');
    await trigger.waitFor({ timeout: timeoutMs });
    await trigger.click();
  }
  await tab.waitFor({ timeout: timeoutMs });
  await tab.click();
}

async function ensureStudentBirthDate(token, profile) {
  if (profile.birthDate) {
    return profile;
  }
  return apiRequest(token, "PUT", "/users/me/profile", 200, {
    birthDate: "2000-01-01",
    countryCode: profile.countryCode,
    displayName: profile.displayName,
    learningGoal: profile.learningGoal,
    locale: profile.locale,
    timezone: profile.timezone,
  });
}

async function loginWithKeycloakUi(page, credentials) {
  const redirectUri = `${webBaseUrl}/auth/callback`;
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  const state = base64Url(randomBytes(24));
  const authorizeUrl = new URL(`${authIssuer}/protocol/openid-connect/auth`);
  authorizeUrl.searchParams.set("client_id", authClientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("ui_locales", "ru");

  await page.goto(authorizeUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const callbackUrl = await submitKeycloakLoginForm(page, credentials);
  if (callbackUrl.searchParams.get("state") !== state) {
    throw new Error("Keycloak callback state mismatch.");
  }
  const code = callbackUrl.searchParams.get("code");
  if (!code) {
    throw new Error("Keycloak callback did not include an authorization code.");
  }

  const response = await fetch(`${authIssuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: authClientId,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Keycloak token exchange failed with HTTP ${response.status}.`);
  }

  const tokenResponse = await response.json();
  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    idToken: tokenResponse.id_token,
    expiresAt: Date.now() + Number(tokenResponse.expires_in) * 1000,
  };
}

async function submitKeycloakLoginForm(page, credentials) {
  const form = await page.locator("#kc-form-login").evaluate((element) => {
    if (!(element instanceof HTMLFormElement)) {
      throw new Error("Keycloak login form is not available.");
    }
    return {
      action: element.action,
      inputs: [...element.querySelectorAll("input")].map((input) => ({
        name: input.name,
        type: input.type,
        value: input.value,
      })),
    };
  });
  const body = new URLSearchParams();
  form.inputs.forEach((input) => {
    if (!input.name) {
      return;
    }
    if (input.name === "username") {
      body.set(input.name, credentials.username);
      return;
    }
    if (input.name === "password") {
      body.set(input.name, credentials.password);
      return;
    }
    body.set(input.name, input.value);
  });
  const formUrl = new URL(form.action);
  const cookies = (await page.context().cookies()).filter((cookie) => {
    const cookieDomain = cookie.domain.replace(/^\./, "");
    return formUrl.hostname.endsWith(cookieDomain) && formUrl.pathname.startsWith(cookie.path);
  });
  const response = await page.context().request.post(form.action, {
    data: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    },
    maxRedirects: 0,
    timeout: timeoutMs,
  });
  const location = response.headers().location;
  if (response.status() < 300 || response.status() >= 400 || !location) {
    const responseText = await response.text().catch(() => "");
    throw new Error(`Keycloak login form did not return an auth redirect; HTTP ${response.status()}${responseText ? `: ${responseText.slice(0, 240)}` : ""}`);
  }
  const callbackUrl = new URL(location, webBaseUrl);
  if (callbackUrl.pathname !== "/auth/callback" || !callbackUrl.searchParams.has("code")) {
    throw new Error(`Keycloak login redirected to unexpected path: ${callbackUrl.pathname}`);
  }
  return callbackUrl;
}

async function createSmokeMaterial(token) {
  created.materialRequest = {
    cefrLevel: "A2",
    description: "Temporary Sprint 5 UI smoke material.",
    document: {
      schemaVersion: 1,
      pages: [
        {
          blocks: [
            {
              body: "Use this page to verify material cursors, shared annotations, and material submission.",
              id: "smoke-text",
              title: "Live collaboration",
              type: "text",
            },
            {
              assessment: { maxAttempts: 3, maxErrors: 3 },
              id: "smoke-gap",
              items: [
                {
                  answer: "write",
                  gapMode: "singleChoice",
                  id: "smoke-gap-item",
                  options: ["write", "writes", "writing"],
                  prompt: "I ___ in the shared material.",
                },
              ],
              title: "Warm up",
              type: "fillGaps",
            },
            {
              id: "smoke-writing",
              prompt: "Write a short answer in the material.",
              title: "Individual answer",
              type: "freeWriting",
            },
            {
              height: 360,
              id: "smoke-drawing",
              title: "Shared drawing area",
              type: "drawingArea",
            },
          ],
          id: "smoke-page",
          layout: "FLOW",
          title: "Sprint 5 live workspace",
        },
      ],
    },
    language: "en",
    scoringRubric: { maxScore: 10 },
    sourceMeta: { kind: "SMOKE", runId },
    status: "PUBLISHED",
    title: `Sprint 5 UI smoke ${runId}`,
    visibility: "PRIVATE",
  };
  return apiRequest(token, "POST", "/materials", 201, created.materialRequest);
}

async function createSmokeLesson(token, materialId, participantSubjects) {
  const now = Date.now();
  const lesson = await apiRequest(token, "POST", "/schedule/lessons", 201, {
    materialId,
    participantSubjects,
    scheduledEnd: new Date(now + 75 * 60 * 1000).toISOString(),
    scheduledStart: new Date(now - 5 * 60 * 1000).toISOString(),
    status: "SCHEDULED",
    type: "GROUP",
    workMode: "SHARED",
  });
  return apiRequest(token, "POST", `/schedule/lessons/${lesson.id}/start`, 200);
}

async function ensureCollaborationDocument(token, lessonId, materialId, scope) {
  return apiRequest(token, "POST", `/schedule/lessons/${lessonId}/collaboration-documents/current`, 200, {
    documentKind: "MATERIAL_WORK",
    materialId,
    scope,
  });
}

async function openClassroom(page, lessonId, readySelector, options = {}) {
  await page.goto(`${webBaseUrl}/lessons/${lessonId}/classroom`, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await completeClassroomPreJoin(page);
  if (options.revealTeacherTask) {
    const revealButton = page.locator("button").filter({ hasText: /Показать задание|Show task|Aufgabe anzeigen|Afficher la tâche/i }).first();
    await revealButton.waitFor({ timeout: timeoutMs });
    await revealButton.click();
  }
  await page.locator(readySelector).waitFor({ timeout: timeoutMs });
  await page.locator("[data-testid='lesson-material-surface']").waitFor({ timeout: timeoutMs });
}

async function completeClassroomPreJoin(page) {
  const checkedJoinButton = page.locator("[data-testid='classroom-prejoin-join']");
  const joinWithoutAudioButton = page.locator("[data-testid='classroom-prejoin-join-without-audio']");
  await checkedJoinButton.waitFor({ timeout: timeoutMs });
  await page.waitForFunction(() => {
    const checkedJoin = document.querySelector("[data-testid='classroom-prejoin-join']");
    const fallbackJoin = document.querySelector("[data-testid='classroom-prejoin-join-without-audio']");
    return (checkedJoin instanceof HTMLButtonElement && !checkedJoin.disabled) ||
      (fallbackJoin instanceof HTMLButtonElement && !fallbackJoin.disabled);
  }, null, { timeout: timeoutMs });
  if (await joinWithoutAudioButton.isVisible()) {
    await joinWithoutAudioButton.click();
  } else {
    await checkedJoinButton.click();
  }
}

async function assertStudentDocumentChromeHidden(page) {
  await page.waitForFunction(() => {
    return !document.querySelector("[data-testid='collaboration-mode-individual']") &&
      !document.querySelector("[data-testid='collaboration-mode-group']") &&
      !document.querySelector("[data-testid='collaboration-live-textarea']") &&
      !document.querySelector("[data-testid='collaboration-finalize-button']") &&
      Boolean(document.querySelector("[data-testid='lesson-material-surface']"));
  }, null, { timeout: timeoutMs });
}

async function waitForSharedPresenceReady(...pages) {
  await Promise.all(pages.map((page) => page.waitForFunction(() => {
    const surface = document.querySelector("[data-testid='lesson-material-surface']");
    return surface?.getAttribute("data-live-presence-ready") === "true";
  }, null, { timeout: timeoutMs })));
}

async function clearMaterialCursors(...pages) {
  await Promise.all(pages.map((page) => page.mouse.move(0, 0)));
  await Promise.all(pages.map((page) => page.waitForFunction(() => (
    document.querySelectorAll("[data-testid='lesson-material-surface'] .playsay-presence-cursor").length === 0
  ), null, { timeout: timeoutMs })));
}

async function verifyMaterialCursor(sourcePage, targetPage) {
  const sourceSurface = sourcePage.locator("[data-testid='lesson-material-surface']").first();
  const box = await sourceSurface.boundingBox();
  if (!box) {
    throw new Error("Source material surface is not visible.");
  }
  await sourcePage.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.38);
  await targetPage.waitForFunction(() => {
    const surface = document.querySelector("[data-testid='lesson-material-surface']");
    const cursor = surface?.querySelector(".playsay-presence-cursor");
    if (!surface || !cursor) {
      return false;
    }
    const surfaceRect = surface.getBoundingClientRect();
    const cursorRect = cursor.getBoundingClientRect();
    return cursorRect.left >= surfaceRect.left - 1 &&
      cursorRect.top >= surfaceRect.top - 1 &&
      cursorRect.right <= surfaceRect.right + 1 &&
      cursorRect.bottom <= surfaceRect.bottom + 1;
  }, null, { timeout: timeoutMs });
}

async function verifyMaterialCursorAlignment(sourcePage, targetPage, xRatio, yRatio, label) {
  const sourceSurface = sourcePage.locator("[data-testid='lesson-material-surface']").first();
  const box = await sourceSurface.boundingBox();
  if (!box) {
    throw new Error(`Source material surface is not visible for ${label}.`);
  }
  await sourcePage.mouse.move(box.x + box.width * xRatio, box.y + box.height * yRatio);
  await targetPage.waitForFunction(({ expectedXRatio, expectedYRatio, nextLabel }) => {
    const surface = document.querySelector("[data-testid='lesson-material-surface']");
    const cursor = surface?.querySelector(".playsay-presence-cursor");
    const cursorIcon = cursor?.querySelector("svg");
    if (!surface || !cursor || !cursorIcon) {
      return false;
    }

    const surfaceRect = surface.getBoundingClientRect();
    const iconRect = cursorIcon.getBoundingClientRect();
    const expectedX = surfaceRect.left + surfaceRect.width * expectedXRatio;
    const expectedY = surfaceRect.top + surfaceRect.height * expectedYRatio;
    const tipX = iconRect.left + iconRect.width * (4.037 / 24);
    const tipY = iconRect.top + iconRect.height * (4.688 / 24);
    const distance = Math.hypot(tipX - expectedX, tipY - expectedY);
    if (distance <= 3) {
      return true;
    }

    window.__playsayCursorAlignmentDebug = {
      distance,
      expectedX,
      expectedY,
      label: nextLabel,
      tipX,
      tipY,
    };
    return false;
  }, { expectedXRatio: xRatio, expectedYRatio: yRatio, nextLabel: label }, { timeout: timeoutMs }).catch(async (error) => {
    const debug = await targetPage.evaluate(() => window.__playsayCursorAlignmentDebug ?? null).catch(() => null);
    throw new Error(`Timed out waiting for aligned ${label}; debug=${JSON.stringify(debug)}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function drawAnnotation(page) {
  await page.locator("[data-testid='annotation-tool-pen']").click();
  await page.waitForFunction(() => {
    return document.querySelector(".playsay-annotation-layer")?.getAttribute("data-tool") === "pen";
  }, null, { timeout: timeoutMs });
  const surface = page.locator("[data-testid='lesson-material-surface']").first();
  const box = await surface.boundingBox();
  if (!box) {
    throw new Error("Material surface is not visible for drawing.");
  }
  const viewport = page.viewportSize() ?? { width: 1280, height: 860 };
  const visibleY = Math.min(Math.max(box.y + 220, box.y + 48), viewport.height - 120);
  const start = { x: box.x + box.width * 0.28, y: visibleY };
  const mid = { x: box.x + box.width * 0.42, y: visibleY + 36 };
  const end = { x: box.x + box.width * 0.56, y: visibleY - 12 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 8 });
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await waitForLocatorCount(page, "[data-testid='lesson-material-surface'] .playsay-annotation-layer path.playsay-annotation-element", 1, "student A annotation path");
  await page.locator("[data-testid='annotation-tool-pointer']").click();
}

async function drawTextAndMindMap(page) {
  const layer = page.locator(".playsay-annotation-layer");
  const bounds = await layer.boundingBox();
  if (!bounds) {
    throw new Error("Annotation layer is not visible for Text/Mind Map smoke.");
  }

  await page.locator("[data-testid='annotation-tool-text']").click();
  await page.mouse.click(bounds.x + bounds.width * 0.56, bounds.y + bounds.height * 0.34);
  const textEditor = page.locator(".playsay-annotation-text-text textarea");
  await textEditor.waitFor({ timeout: timeoutMs });
  await textEditor.fill("Small friendly text");
  await textEditor.press("Control+Enter");

  await page.locator("[data-testid='annotation-tool-mind-map']").click();
  await page.mouse.click(bounds.x + bounds.width * 0.48, bounds.y + bounds.height * 0.46);
  const mindMapEditor = page.locator(".playsay-annotation-text-mindMapNode textarea");
  await mindMapEditor.waitFor({ timeout: timeoutMs });
  await mindMapEditor.fill("Present Simple");
  await mindMapEditor.press("Tab");
  await mindMapEditor.waitFor({ timeout: timeoutMs });
  await mindMapEditor.fill("Habits and routines");
  await mindMapEditor.press("Escape");
  await waitForLocatorCount(page, ".playsay-annotation-text-mindMapNode", 2, "compact mind map nodes");

  const sizes = await page.locator("foreignObject.playsay-annotation-element").evaluateAll((elements) => elements
    .map((element) => {
      const content = element.querySelector(".playsay-annotation-text-text, .playsay-annotation-text-mindMapNode");
      const visibleText = content?.querySelector("span:not(.playsay-annotation-text-measure)");
      const textRange = visibleText ? document.createRange() : null;
      if (textRange && visibleText) textRange.selectNodeContents(visibleText);
      return content ? {
        height: Number(element.getAttribute("height")),
        kind: content.classList.contains("playsay-annotation-text-text") ? "text" : "mindMapNode",
        lineCount: textRange ? textRange.getClientRects().length : null,
        width: Number(element.getAttribute("width")),
      } : null;
    })
    .filter(Boolean));
  const textSize = sizes.find((size) => size.kind === "text");
  const mindMapSizes = sizes.filter((size) => size.kind === "mindMapNode");
  if (!textSize || textSize.width >= 220 || textSize.height >= 90 || textSize.lineCount !== 1) {
    throw new Error(`Text did not compact to its content: ${JSON.stringify(textSize)}`);
  }
  if (mindMapSizes.length !== 2 || mindMapSizes.some((size) => size.width > 220 || size.height > 160)) {
    throw new Error(`Mind map nodes exceeded compact bounds: ${JSON.stringify(mindMapSizes)}`);
  }
  if (await page.locator(".playsay-mind-map-connector").count() !== 1) {
    throw new Error("Mind map connector was not rendered exactly once.");
  }
}

async function captureAnnotationScreenshot(page) {
  if (!annotationScreenshotPath) return;
  mkdirSync(path.dirname(annotationScreenshotPath), { recursive: true });
  const originalViewport = page.viewportSize();
  await page.screenshot({ path: annotationScreenshotPath });
  const textAnnotation = page.locator(".playsay-annotation-text-text");
  if (await textAnnotation.count() === 1) {
    await textAnnotation.click();
    const extension = path.extname(annotationScreenshotPath);
    const selectedTextPath = `${annotationScreenshotPath.slice(0, -extension.length)}-text-selected${extension}`;
    await page.screenshot({ path: selectedTextPath });

    const screenshotStem = annotationScreenshotPath.slice(0, -extension.length);
    const mobileStem = screenshotStem.endsWith("-desktop")
      ? `${screenshotStem.slice(0, -"-desktop".length)}-mobile`
      : `${screenshotStem}-mobile`;
    await page.setViewportSize({ width: 390, height: 844 });
    await textAnnotation.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${mobileStem}${extension}` });
    if (originalViewport) {
      await page.setViewportSize(originalViewport);
    }
  }
}

async function assertAnnotationInsideSurface(page) {
  await page.waitForFunction(() => {
    const surface = document.querySelector("[data-testid='lesson-material-surface']");
    const path = surface?.querySelector(".playsay-annotation-layer path.playsay-annotation-element");
    if (!surface || !path) {
      return false;
    }
    const surfaceRect = surface.getBoundingClientRect();
    const pathRect = path.getBoundingClientRect();
    return pathRect.width > 0 &&
      pathRect.height > 0 &&
      pathRect.left >= surfaceRect.left - 2 &&
      pathRect.top >= surfaceRect.top - 2 &&
      pathRect.right <= surfaceRect.right + 2 &&
      pathRect.bottom <= surfaceRect.bottom + 2;
  }, null, { timeout: timeoutMs });
}

async function scrollMaterialDocument(page, top) {
  await page.locator(".playsay-task-document").evaluate((element, nextTop) => {
    element.scrollTop = nextTop;
  }, top);
}

async function submitStudentMaterialWork(page, token, lessonId) {
  await page.locator(".playsay-render-block-fill-gaps .playsay-inline-select").selectOption("write");
  await page.locator(".playsay-student-answer").fill(`Material answer ${runId}`);
  await page.locator(".playsay-task-footer button").first().click();
  await waitForApi(async () => {
    const submission = await apiRequest(token, "GET", `/schedule/lessons/${lessonId}/material-submission`, 200);
    return Boolean(submission.submittedAt);
  });
}

async function waitForLocatorCount(page, selector, minimumCount, label = selector) {
  await page.waitForFunction(({ nextSelector, min }) => {
    return document.querySelectorAll(nextSelector).length >= min;
  }, { nextSelector: selector, min: minimumCount }, { timeout: timeoutMs }).catch((error) => {
    throw new Error(`Timed out waiting for ${label}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function waitForApi(check) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await check()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(750);
  }
  throw lastError ?? new Error("Timed out waiting for API condition.");
}

async function cleanup(token) {
  if (created.lessonId) {
    await apiRequest(token, "DELETE", `/schedule/lessons/${created.lessonId}`, 204).catch(() => null);
    created.lessonId = null;
  }
  if (created.materialId && created.materialRequest) {
    await apiRequest(token, "PUT", `/materials/${created.materialId}`, 200, {
      ...created.materialRequest,
      status: "ARCHIVED",
      title: `${created.materialRequest.title} archived`,
    }).catch(() => null);
    created.materialId = null;
  }
}

async function apiRequest(token, method, pathName, expectedStatus, body) {
  const response = await fetch(`${apiBaseUrl}${pathName}`, {
    method,
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${pathName} expected HTTP ${expectedStatus}, got ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  if (!text || expectedStatus === 204) {
    return null;
  }
  return JSON.parse(text);
}

function addCheck(name) {
  summary.checks.push(name);
  console.log(`ok ${name}`);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
