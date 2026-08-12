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
const fakeMedia = process.env.PLAY_SAY_SMOKE_FAKE_MEDIA === "true";
const timeoutMs = Number(process.env.PLAY_SAY_SMOKE_TIMEOUT_MS ?? 45_000);
const annotationScreenshotPath = process.env.PLAY_SAY_SMOKE_ANNOTATION_SCREENSHOT_PATH?.trim() || null;
const failureScreenshotDir = process.env.PLAY_SAY_SMOKE_FAILURE_SCREENSHOT_DIR?.trim()
  || (annotationScreenshotPath ? path.dirname(annotationScreenshotPath) : null);
const annotationOnly = process.env.PLAY_SAY_SMOKE_ANNOTATION_ONLY === "true";
const runId = `sprint5-ui-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const tokenStorageKey = "playsay.auth.tokens";
const scrollImageBlockId = "smoke-scroll-image";
const scrollImageText = "Anchored scroll text";

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
  browser = await chromium.launch({
    headless,
    args: fakeMedia
      ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
      : [],
  });

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

  let material = await createSmokeMaterial(teacher.tokens.accessToken);
  created.materialId = material.id;
  summary.materialId = material.id;
  material = await addSmokeScrollImage(teacher.tokens.accessToken, material);
  addCheck("scroll-image-material-prepared");

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
  if (fakeMedia) {
    await verifyLiveKitMedia(teacher.page, studentA.page, studentB.page);
    addCheck("livekit-camera-and-microphone-media-connected");
  }

  await Promise.all([
    assertStudentDocumentChromeHidden(studentA.page),
    assertStudentDocumentChromeHidden(studentB.page),
  ]);
  addCheck("student-workspace-hides-document-tabs-and-side-editor");

  if (annotationOnly) {
    await waitForSharedPresenceReady(teacher.page, studentA.page, studentB.page);
    await drawTextAndMindMap(teacher.page);
    await captureAnnotationScreenshot(teacher.page);
    addCheck("text-and-mind-map-use-compact-content-bounds");
    await verifyAnchoredTextScroll(teacher.page, studentA.page);
    addCheck("teacher-and-student-text-stays-anchored-during-image-scroll");
  } else {
    await waitForSharedPresenceReady(teacher.page, studentA.page, studentB.page);
    await drawTextAndMindMap(teacher.page);
    await captureAnnotationScreenshot(teacher.page);
    addCheck("text-and-mind-map-use-compact-content-bounds");
    await verifyAnchoredTextScroll(teacher.page, studentA.page);
    addCheck("teacher-and-student-text-stays-anchored-during-image-scroll");
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

    await verifySharedExerciseSync(teacher.page, studentA.page);
    addCheck("shared-exercise-actions-and-answers-sync-live");

    await studentB.page.reload({ waitUntil: "domcontentloaded" });
    await completeClassroomPreJoin(studentB.page);
    await studentB.page.locator("[data-testid='lesson-material-surface']").waitFor({ timeout: timeoutMs });
    await waitForSharedPresenceReady(studentB.page);
    await waitForLocatorCount(studentB.page, "[data-testid='lesson-material-surface'] .playsay-annotation-layer path.playsay-annotation-element", 1, "student B annotation path after reload");
    addCheck("reconnect-restores-annotations");
    await assertSharedExerciseState(studentB.page);
    addCheck("reconnect-restores-shared-exercise-answers");

    await submitStudentMaterialWork(studentA.page, studentA.tokens.accessToken, lesson.id);
    addCheck("student-material-submit-creates-submission");
  }

  await cleanup(teacher.tokens.accessToken);
  addCheck("cleanup-completed");

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  await captureFailureScreenshots(sessions);
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
  if (fakeMedia) {
    await context.grantPermissions(["camera", "microphone"], { origin: webBaseUrl });
  }
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
  const passkeyPrompt = page.locator('[data-testid="passkey-prompt"]');
  if (await passkeyPrompt.isVisible().catch(() => false)) {
    await passkeyPrompt.press("Escape");
    await passkeyPrompt.waitFor({ state: "detached", timeout: timeoutMs });
  }

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
              id: "smoke-word-bank",
              items: [
                {
                  answer: "cloud",
                  answerOptionId: "smoke-bank-cloud",
                  gapMode: "wordBank",
                  id: "smoke-bank-gap",
                  prompt: "I can see a ␣.",
                },
              ],
              title: "Word cloud",
              type: "fillGaps",
              wordBankOptions: [
                { id: "smoke-bank-cloud", value: "cloud" },
                { id: "smoke-bank-rain", value: "rain" },
              ],
            },
            {
              id: "smoke-matching",
              pairs: [
                { id: "smoke-pair-cloud", left: "cloud", right: "cloud", targetKind: "TEXT" },
                { id: "smoke-pair-rain", left: "rain", right: "rain", targetKind: "TEXT" },
              ],
              title: "Match weather words",
              type: "matchingPairs",
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

async function addSmokeScrollImage(token, material) {
  const imageAsset = await uploadSmokeImageAsset(token, material.id);
  created.materialRequest = {
    ...created.materialRequest,
    document: {
      ...created.materialRequest.document,
      pages: created.materialRequest.document.pages.map((page, index) => index === 0 ? {
        ...page,
        blocks: [{
          alt: "Tall worksheet used to verify annotation scrolling.",
          id: scrollImageBlockId,
          imageSize: "FULL",
          title: "Tall annotation worksheet",
          type: "image",
          url: `material-asset:${imageAsset.id}`,
        }, ...page.blocks],
      } : page),
    },
  };
  return apiRequest(token, "PUT", `/materials/${material.id}`, 200, created.materialRequest);
}

async function uploadSmokeImageAsset(token, materialId) {
  const formData = new FormData();
  formData.append("file", new Blob([tallSmokeSvg()], { type: "image/svg+xml" }), "annotation-scroll.svg");
  const response = await fetch(`${apiBaseUrl}/materials/${materialId}/assets/images`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const text = await response.text();
  if (response.status !== 201) {
    throw new Error(`POST /materials/${materialId}/assets/images expected HTTP 201, got ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  return JSON.parse(text);
}

function tallSmokeSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="2400" viewBox="0 0 800 2400">
  <rect width="800" height="2400" fill="#fffaf6"/>
  <rect x="48" y="48" width="704" height="2304" rx="28" fill="#ffffff" stroke="#ece6df" stroke-width="8"/>
  <circle cx="120" cy="180" r="38" fill="#ff5c00"/>
  <text x="180" y="200" font-family="sans-serif" font-size="54" font-weight="700" fill="#111111">Annotation scroll smoke</text>
  <path d="M100 420 H700 M100 780 H700 M100 1140 H700 M100 1500 H700 M100 1860 H700 M100 2220 H700" stroke="#00a878" stroke-width="16"/>
  <text x="120" y="390" font-family="sans-serif" font-size="42" fill="#62666f">Section 1</text>
  <text x="120" y="750" font-family="sans-serif" font-size="42" fill="#62666f">Section 2</text>
  <text x="120" y="1110" font-family="sans-serif" font-size="42" fill="#62666f">Section 3</text>
  <text x="120" y="1470" font-family="sans-serif" font-size="42" fill="#62666f">Section 4</text>
  <text x="120" y="1830" font-family="sans-serif" font-size="42" fill="#62666f">Section 5</text>
  <text x="120" y="2190" font-family="sans-serif" font-size="42" fill="#62666f">Section 6</text>
</svg>`;
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
  if (fakeMedia) {
    const recordButton = page.locator(".playsay-prejoin-audio-actions button[data-recording]").first();
    await recordButton.waitFor({ state: "visible", timeout: timeoutMs });
    await recordButton.dispatchEvent("pointerdown", {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    });
    await page.waitForTimeout(600);
    await recordButton.dispatchEvent("pointerup", {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    });
    const heardRecordingButton = page.locator(".playsay-prejoin-audio-confirm button").first();
    await heardRecordingButton.waitFor({ state: "visible", timeout: timeoutMs });
    await heardRecordingButton.click();
  }
  await page.waitForFunction((requireCheckedMedia) => {
    const checkedJoin = document.querySelector("[data-testid='classroom-prejoin-join']");
    const fallbackJoin = document.querySelector("[data-testid='classroom-prejoin-join-without-audio']");
    const checkedReady = checkedJoin instanceof HTMLButtonElement && !checkedJoin.disabled;
    return requireCheckedMedia ? checkedReady : checkedReady ||
      (fallbackJoin instanceof HTMLButtonElement && !fallbackJoin.disabled);
  }, fakeMedia, { timeout: timeoutMs });
  if (fakeMedia) {
    await checkedJoinButton.click();
  } else if (await joinWithoutAudioButton.isVisible()) {
    await joinWithoutAudioButton.click();
  } else {
    await checkedJoinButton.click();
  }
}

async function verifyLiveKitMedia(...pages) {
  await Promise.all(pages.map((page) => page.waitForFunction(() => {
    const playableVideos = Array.from(document.querySelectorAll("video")).filter((video) => (
      video instanceof HTMLVideoElement &&
      video.srcObject instanceof MediaStream &&
      video.srcObject.getVideoTracks().some((track) => track.readyState === "live") &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ));
    return playableVideos.length >= 2;
  }, null, { timeout: timeoutMs })));
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
  await Promise.all(pages.map(async (page) => {
    const surface = page.locator("[data-testid='lesson-material-surface']").first();
    if (await surface.count()) {
      await surface.dispatchEvent("pointerout", {
        bubbles: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
        relatedTarget: null,
      });
    }
  }));
  await Promise.all(pages.map((page) => page.waitForFunction(() => (
    document.querySelectorAll("[data-testid='lesson-material-surface'] .playsay-presence-cursor").length === 0
  ), null, { timeout: timeoutMs })));
}

async function verifyMaterialCursor(sourcePage, targetPage) {
  await dispatchMaterialCursorMove(sourcePage, 0.34, 0.38, "material cursor");
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
  await dispatchMaterialCursorMove(sourcePage, xRatio, yRatio, label);
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

async function dispatchMaterialCursorMove(sourcePage, xRatio, yRatio, label) {
  const sourceSurface = sourcePage.locator("[data-testid='lesson-material-surface']").first();
  const box = await sourceSurface.boundingBox();
  if (!box) {
    throw new Error(`Source material surface is not visible for ${label}.`);
  }
  await sourceSurface.dispatchEvent("pointermove", {
    bubbles: true,
    buttons: 0,
    clientX: box.x + box.width * xRatio,
    clientY: box.y + box.height * yRatio,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
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
  const layer = page.locator('.playsay-annotation-layer[data-anchored="false"]');
  const bounds = await layer.boundingBox();
  if (!bounds) {
    throw new Error("Annotation layer is not visible for Text/Mind Map smoke.");
  }
  const viewport = page.viewportSize() ?? { width: 1280, height: 860 };
  const textY = Math.min(Math.max(bounds.y + 220, bounds.y + 48), viewport.height - 280);
  const mindMapY = Math.min(Math.max(textY + 150, bounds.y + 120), viewport.height - 120);

  await page.locator("[data-testid='annotation-tool-text']").click();
  await page.mouse.click(bounds.x + bounds.width * 0.56, textY);
  const textEditor = page.locator(".playsay-annotation-text-text textarea");
  await textEditor.waitFor({ timeout: timeoutMs });
  await textEditor.fill("Friendly text");
  const initialTextSize = await textEditor.evaluate((editor) => {
    const frame = editor.closest("foreignObject");
    return frame ? {
      height: Number(frame.getAttribute("height")),
      width: Number(frame.getAttribute("width")),
    } : null;
  });
  if (
    !initialTextSize
    || initialTextSize.width < 230
    || initialTextSize.width > 250
    || initialTextSize.height < 50
    || initialTextSize.height > 70
  ) {
    throw new Error(`Text did not start with wide readable bounds: ${JSON.stringify(initialTextSize)}`);
  }
  await textEditor.fill(
    "Friendly text wraps automatically across several lines without manually stretching its frame downward.",
  );
  await page.waitForFunction(() => {
    const editor = document.querySelector(".playsay-annotation-text-text textarea");
    const frame = editor?.closest("foreignObject");
    return Number(frame?.getAttribute("height")) > 56;
  }, null, { timeout: timeoutMs });
  const expandedTextHeight = await textEditor.evaluate((editor) => (
    Number(editor.closest("foreignObject")?.getAttribute("height"))
  ));
  if (expandedTextHeight <= initialTextSize.height) {
    throw new Error(`Text did not grow to fit wrapped content: ${expandedTextHeight}`);
  }
  await textEditor.fill("Friendly text");
  await textEditor.press("Control+Enter");

  await page.locator("[data-testid='annotation-tool-mind-map']").click();
  await page.mouse.click(bounds.x + bounds.width * 0.48, mindMapY);
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
  if (
    !textSize
    || textSize.width < 230
    || textSize.width > 250
    || textSize.height < 50
    || textSize.height > 70
    || textSize.lineCount !== 1
  ) {
    throw new Error(`Text did not retain its readable default bounds: ${JSON.stringify(textSize)}`);
  }
  if (mindMapSizes.length !== 2 || mindMapSizes.some((size) => size.width > 220 || size.height > 160)) {
    throw new Error(`Mind map nodes exceeded compact bounds: ${JSON.stringify(mindMapSizes)}`);
  }
  if (await page.locator(".playsay-mind-map-connector").count() !== 1) {
    throw new Error("Mind map connector was not rendered exactly once.");
  }
}

async function verifyAnchoredTextScroll(teacherPage, studentPage) {
  await openFocusedSmokeImage(teacherPage);
  await waitForFocusedSmokeImage(studentPage);

  const teacherLayer = teacherPage.locator(`.playsay-annotation-layer[data-anchor-id='${scrollImageBlockId}']`);
  const teacherBounds = await teacherLayer.boundingBox();
  if (!teacherBounds) {
    throw new Error("Teacher image annotation layer is not visible.");
  }
  const teacherViewport = teacherPage.viewportSize() ?? { width: 1440, height: 920 };
  const clickY = Math.min(Math.max(teacherBounds.y + 180, teacherBounds.y + 48), teacherViewport.height - 140);
  await teacherPage.locator("[data-testid='annotation-tool-text']").click();
  await teacherPage.mouse.click(teacherBounds.x + teacherBounds.width * 0.52, clickY);
  const teacherEditor = teacherLayer.locator(".playsay-annotation-text-text textarea");
  await teacherEditor.waitFor({ timeout: timeoutMs });
  await teacherEditor.fill(scrollImageText);
  await teacherEditor.press("Control+Enter");

  const studentText = studentPage.locator(
    `.playsay-annotation-layer[data-anchor-id='${scrollImageBlockId}'] .playsay-annotation-text-text`,
  ).filter({ hasText: scrollImageText });
  await studentText.waitFor({ timeout: timeoutMs });

  await assertAnchoredTextFollowsImageScroll(teacherPage, "teacher");
  await assertAnchoredTextFollowsImageScroll(studentPage, "student");

  await studentPage.locator("[data-testid='material-focus-close']").click();
  const closeResults = await Promise.allSettled([
    waitForFocusedSmokeImageClosed(teacherPage, "teacher"),
    waitForFocusedSmokeImageClosed(studentPage, "student"),
  ]);
  if (closeResults.some((result) => result.status === "rejected")) {
    const [teacherState, studentState] = await Promise.all([
      focusedImageState(teacherPage),
      focusedImageState(studentPage),
    ]);
    const failures = closeResults
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
    throw new Error(`shared image close did not converge; teacher=${JSON.stringify(teacherState)}, student=${JSON.stringify(studentState)}: ${failures.join("; ")}`);
  }
}

async function openFocusedSmokeImage(page) {
  await page.locator(`[data-testid='material-image-focus-${scrollImageBlockId}']`).click();
  await waitForFocusedSmokeImage(page);
}

async function waitForFocusedSmokeImage(page) {
  await page.locator(
    `.playsay-material-focus-stack[data-active='true'] img[data-playsay-annotation-anchor-id='${scrollImageBlockId}']`,
  ).waitFor({ timeout: timeoutMs });
  await page.waitForFunction((blockId) => {
    const image = document.querySelector(`.playsay-material-focus-stack[data-active='true'] img[data-playsay-annotation-anchor-id='${blockId}']`);
    return image instanceof HTMLImageElement && image.complete && image.naturalHeight > 0;
  }, scrollImageBlockId, { timeout: timeoutMs });
}

async function waitForFocusedSmokeImageClosed(page, role) {
  try {
    await page.locator(".playsay-material-focus-stack[data-active='false']").waitFor({
      state: "attached",
      timeout: timeoutMs,
    });
    await page.locator("[data-testid='material-focus-close']").waitFor({ state: "detached", timeout: timeoutMs });
  } catch (error) {
    const state = await focusedImageState(page);
    throw new Error(`${role} did not close shared image focus; state=${JSON.stringify(state)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function focusedImageState(page) {
  return page.evaluate(() => {
    const board = document.querySelector(".playsay-task-board");
    const focusStack = document.querySelector(".playsay-material-focus-stack");
    const focusedImage = document.querySelector(".playsay-material-focused-image");
    const surface = document.querySelector("[data-testid='lesson-material-surface']");
    return {
      boardMode: board?.getAttribute("data-presentation-mode") ?? null,
      collaborationReady: surface?.getAttribute("data-live-presence-ready") ?? null,
      focusActive: focusStack?.getAttribute("data-active") ?? null,
      focusedImageScrollTop: focusedImage instanceof HTMLElement ? focusedImage.scrollTop : null,
    };
  }).catch(() => null);
}

async function assertAnchoredTextFollowsImageScroll(page, role) {
  const before = await stableImageTextGeometry(page);
  const targetScrollTop = Math.min(360, before.scrollHeight - before.clientHeight);
  if (targetScrollTop < 120) {
    throw new Error(`${role} focused image is not vertically scrollable: ${JSON.stringify(before)}`);
  }

  await page.locator(".playsay-material-focused-image").evaluate((element, scrollTop) => {
    element.scrollTop = scrollTop;
    element.dispatchEvent(new Event("scroll"));
  }, targetScrollTop);
  await page.waitForFunction(({ blockId, expectedOffset, expectedScrollTop, text }) => {
    const scroller = document.querySelector(".playsay-material-focused-image");
    const image = document.querySelector(`.playsay-material-focus-stack[data-active='true'] img[data-playsay-annotation-anchor-id='${blockId}']`);
    const annotations = Array.from(document.querySelectorAll(
      `.playsay-annotation-layer[data-anchor-id='${blockId}'] .playsay-annotation-text-text`,
    ));
    const annotation = annotations.find((element) => element.textContent?.includes(text));
    if (!(scroller instanceof HTMLElement) || !(image instanceof HTMLElement) || !(annotation instanceof HTMLElement)) {
      return false;
    }
    const imageRect = image.getBoundingClientRect();
    const annotationRect = annotation.getBoundingClientRect();
    return Math.abs(scroller.scrollTop - expectedScrollTop) <= 1
      && Math.abs((annotationRect.top - imageRect.top) - expectedOffset) <= 3;
  }, {
    blockId: scrollImageBlockId,
    expectedOffset: before.textOffsetTop,
    expectedScrollTop: targetScrollTop,
    text: scrollImageText,
  }, { timeout: timeoutMs }).catch(async (error) => {
    const after = await imageTextGeometry(page).catch(() => null);
    throw new Error(`${role} text detached from its image during scroll; before=${JSON.stringify(before)}, after=${JSON.stringify(after)}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function stableImageTextGeometry(page) {
  let previous = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await imageTextGeometry(page);
    if (previous
      && Math.abs(current.scrollTop - previous.scrollTop) <= 1
      && Math.abs(current.textOffsetTop - previous.textOffsetTop) <= 1) {
      return current;
    }
    previous = current;
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  }
  return previous;
}

async function imageTextGeometry(page) {
  return page.evaluate(({ blockId, text }) => {
    const scroller = document.querySelector(".playsay-material-focused-image");
    const image = document.querySelector(`.playsay-material-focus-stack[data-active='true'] img[data-playsay-annotation-anchor-id='${blockId}']`);
    const annotations = Array.from(document.querySelectorAll(
      `.playsay-annotation-layer[data-anchor-id='${blockId}'] .playsay-annotation-text-text`,
    ));
    const annotation = annotations.find((element) => element.textContent?.includes(text));
    if (!(scroller instanceof HTMLElement) || !(image instanceof HTMLElement) || !(annotation instanceof HTMLElement)) {
      throw new Error("Focused image or anchored text is missing.");
    }
    const imageRect = image.getBoundingClientRect();
    const annotationRect = annotation.getBoundingClientRect();
    return {
      clientHeight: scroller.clientHeight,
      imageTop: imageRect.top,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      textOffsetTop: annotationRect.top - imageRect.top,
      textTop: annotationRect.top,
    };
  }, { blockId: scrollImageBlockId, text: scrollImageText });
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

async function captureFailureScreenshots(activeSessions) {
  if (!failureScreenshotDir) return;
  mkdirSync(failureScreenshotDir, { recursive: true });
  await Promise.allSettled(activeSessions.map(({ page, role }) => page.screenshot({
    fullPage: true,
    path: path.join(failureScreenshotDir, `${runId}-${role}-failure.png`),
  })));
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
  const select = page.locator(".playsay-render-block-fill-gaps .playsay-inline-select").first();
  if (await select.inputValue() !== "write") {
    await select.selectOption("write");
  }
  await page.locator(".playsay-student-answer").fill(`Material answer ${runId}`);
  await page.locator(".playsay-task-footer button").first().click();
  await waitForApi(async () => {
    const submission = await apiRequest(token, "GET", `/schedule/lessons/${lessonId}/material-submission`, 200);
    return Boolean(submission.submittedAt);
  });
}

async function verifySharedExerciseSync(teacherPage, studentPage) {
  const studentChoice = studentPage.locator(".playsay-render-block-fill-gaps .playsay-inline-select").first();
  const teacherChoice = teacherPage.locator(".playsay-render-block-fill-gaps .playsay-inline-select").first();
  await studentChoice.selectOption("write");
  await waitForInputValue(teacherChoice, "write", "teacher shared choice");

  const studentWriting = studentPage.locator(".playsay-student-answer");
  const teacherWriting = teacherPage.locator(".playsay-student-answer");
  await studentWriting.fill(`Student live answer ${runId}`);
  await waitForInputValue(teacherWriting, `Student live answer ${runId}`, "teacher shared writing");

  const source = studentPage.locator("[data-option-id='smoke-bank-cloud']");
  const target = studentPage.locator("[data-item-key='smoke-bank-gap']");
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Word-bank source or target has no visible bounding box.");
  }
  await studentPage.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await studentPage.mouse.down();
  await studentPage.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height / 2 + 8, { steps: 4 });
  await studentPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await teacherPage.locator("[data-option-id='smoke-bank-cloud'][data-live-active='true']").waitFor({ timeout: timeoutMs });
  await teacherPage.locator("[data-item-key='smoke-bank-gap'][data-live-active='true']").waitFor({ timeout: timeoutMs });
  await studentPage.mouse.up();
  await waitForText(teacherPage.locator("[data-item-key='smoke-bank-gap']"), "cloud", "teacher applied word-bank answer");

  const studentLeft = studentPage.locator(".playsay-match-word[data-pair-id='smoke-pair-cloud']");
  const studentRight = studentPage.locator(".playsay-match-picture[data-pair-id='smoke-pair-cloud']");
  await studentLeft.click();
  await teacherPage.locator(".playsay-match-word[data-pair-id='smoke-pair-cloud'][data-live-active='true']").waitFor({ timeout: timeoutMs });
  await studentRight.hover();
  await teacherPage.locator(".playsay-match-picture[data-pair-id='smoke-pair-cloud'][data-live-active='true']").waitFor({ timeout: timeoutMs });
  await studentRight.click();
  await teacherPage.waitForFunction(() => {
    return Array.from(document.querySelectorAll(".playsay-match-solved-pair"))
      .some((element) => element.textContent?.includes("cloud"));
  }, null, { timeout: timeoutMs });

  await teacherWriting.fill(`Teacher live answer ${runId}`);
  await waitForInputValue(studentWriting, `Teacher live answer ${runId}`, "student shared teacher edit");
}

async function assertSharedExerciseState(page) {
  await waitForInputValue(
    page.locator(".playsay-render-block-fill-gaps .playsay-inline-select").first(),
    "write",
    "reconnected shared choice",
  );
  await waitForInputValue(
    page.locator(".playsay-student-answer"),
    `Teacher live answer ${runId}`,
    "reconnected shared writing",
  );
  await waitForText(page.locator("[data-item-key='smoke-bank-gap']"), "cloud", "reconnected word-bank answer");
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll(".playsay-match-solved-pair"))
      .some((element) => element.textContent?.includes("cloud"));
  }, null, { timeout: timeoutMs });
}

async function waitForInputValue(locator, value, label) {
  await locator.waitFor({ timeout: timeoutMs });
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await locator.inputValue().catch(() => null) === value) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}; expected input value ${JSON.stringify(value)}.`);
}

async function waitForText(locator, text, label) {
  await locator.waitFor({ timeout: timeoutMs });
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await locator.textContent().catch(() => null))?.includes(text)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}; expected text ${JSON.stringify(text)}.`);
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
