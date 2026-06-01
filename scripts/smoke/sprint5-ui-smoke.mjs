#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
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

  const [studentAProfile, studentBProfile] = await Promise.all([
    apiRequest(studentA.tokens.accessToken, "GET", "/users/me/profile", 200),
    apiRequest(studentB.tokens.accessToken, "GET", "/users/me/profile", 200),
  ]);
  addCheck("keycloak-login-and-profiles");

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

  await Promise.all([
    ensureCollaborationDocument(studentA.tokens.accessToken, lesson.id, material.id, "INDIVIDUAL"),
    ensureCollaborationDocument(studentB.tokens.accessToken, lesson.id, material.id, "INDIVIDUAL"),
    ensureCollaborationDocument(studentA.tokens.accessToken, lesson.id, material.id, "GROUP"),
  ]);
  addCheck("collaboration-documents-precreated");

  await openClassroom(teacher.page, lesson.id, ".playsay-collaboration-panel");
  await Promise.all([
    openClassroom(studentA.page, lesson.id, ".playsay-live-workspace"),
    openClassroom(studentB.page, lesson.id, ".playsay-live-workspace"),
  ]);
  addCheck("classroom-opened-for-teacher-and-two-students");

  const studentAText = `Student A individual ${runId}`;
  const studentBText = `Student B individual ${runId}`;
  await fillStudentWorkspace(studentA.page, studentAText);
  console.log("ok student-a-individual-text-entered");
  await fillStudentWorkspace(studentB.page, studentBText);
  console.log("ok student-b-individual-text-entered");
  await refreshTeacherPanel(teacher.page);
  await waitForLocatorCount(teacher.page, ".playsay-collaboration-student-row:not([disabled])", 2, "teacher student document rows");
  addCheck("students-created-individual-documents");

  await openTeacherStudentDocument(teacher.page, studentAProfile);
  await waitForValueContains(teacher.page, ".playsay-teacher-live-editor textarea", studentAText, "teacher selected student document text");
  const teacherNote = `Teacher edit ${runId}`;
  await appendTextarea(teacher.page, ".playsay-teacher-live-editor textarea", `\n${teacherNote}`);
  await waitForValueContains(studentA.page, "[data-testid='collaboration-live-textarea']", teacherNote, "student receives teacher edit");
  addCheck("teacher-sees-and-edits-student-document");

  const groupText = `Group workspace ${runId}`;
  await switchStudentMode(studentA.page, "group");
  await switchStudentMode(studentB.page, "group");
  await fillStudentWorkspace(studentA.page, groupText);
  await waitForValueContains(studentB.page, "[data-testid='collaboration-live-textarea']", groupText, "student B receives group text");
  await openTeacherGroupDocument(teacher.page);
  await waitForValueContains(teacher.page, ".playsay-teacher-live-editor textarea", groupText, "teacher receives group text");
  addCheck("group-document-syncs-between-participants-and-teacher");

  await switchStudentMode(studentA.page, "individual");
  await switchStudentMode(studentB.page, "individual");
  await verifyMaterialCursor(studentA.page, studentB.page);
  addCheck("material-presence-cursor-is-clipped-to-material-surface");

  await drawAnnotation(studentA.page);
  await waitForLocatorCount(studentB.page, "[data-testid='lesson-material-surface'] .playsay-annotation-layer path", 1, "student B annotation path");
  await assertAnnotationInsideSurface(studentB.page);
  await scrollMaterialDocument(studentB.page, 120);
  await assertAnnotationInsideSurface(studentB.page);
  await studentB.page.setViewportSize({ width: 920, height: 820 });
  await assertAnnotationInsideSurface(studentB.page);
  addCheck("annotation-sync-stays-inside-material-after-scroll-and-resize");

  await studentB.page.reload({ waitUntil: "domcontentloaded" });
  await studentB.page.locator(".playsay-live-workspace").waitFor({ timeout: timeoutMs });
  await waitForLocatorCount(studentB.page, "[data-testid='lesson-material-surface'] .playsay-annotation-layer path", 1, "student B annotation path after reload");
  addCheck("reconnect-restores-annotations");

  await switchStudentMode(studentA.page, "individual");
  await finalizeStudentWork(studentA.page, studentA.tokens.accessToken, lesson.id);
  addCheck("finalize-creates-material-submission");

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
              body: "Use this page to verify live text, material cursors, and shared annotations.",
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
                  prompt: "I ___ in the live workspace.",
                },
              ],
              title: "Warm up",
              type: "fillGaps",
            },
            {
              id: "smoke-writing",
              prompt: "Write a short answer in the live document.",
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
  return apiRequest(token, "POST", "/schedule/lessons", 201, {
    materialId,
    participantSubjects,
    scheduledEnd: new Date(now + 75 * 60 * 1000).toISOString(),
    scheduledStart: new Date(now - 5 * 60 * 1000).toISOString(),
    status: "IN_PROGRESS",
    type: "GROUP",
  });
}

async function ensureCollaborationDocument(token, lessonId, materialId, scope) {
  return apiRequest(token, "POST", `/schedule/lessons/${lessonId}/collaboration-documents/current`, 200, {
    documentKind: "MATERIAL_WORK",
    materialId,
    scope,
  });
}

async function openClassroom(page, lessonId, readySelector) {
  await page.goto(`${webBaseUrl}/lessons/${lessonId}/classroom`, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await page.locator(readySelector).waitFor({ timeout: timeoutMs });
  await page.locator("[data-testid='lesson-material-surface']").waitFor({ timeout: timeoutMs });
}

async function fillStudentWorkspace(page, text) {
  try {
    await fillStudentWorkspaceOnce(page, text);
  } catch (error) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".playsay-live-workspace").waitFor({ timeout: timeoutMs });
    await fillStudentWorkspaceOnce(page, text).catch(() => {
      throw error;
    });
  }
}

async function fillStudentWorkspaceOnce(page, text) {
  const textarea = page.locator("[data-testid='collaboration-live-textarea']");
  await textarea.waitFor({ timeout: timeoutMs });
  await page.waitForFunction(() => {
    const element = document.querySelector("[data-testid='collaboration-live-textarea']");
    return element instanceof HTMLTextAreaElement && !element.disabled;
  }, null, { timeout: timeoutMs }).catch((error) => {
    return page.evaluate(() => ({
      inlineMessage: document.querySelector(".playsay-lesson-inline-message")?.textContent?.trim() ?? "",
      status: document.querySelector(".playsay-live-sync-status")?.getAttribute("data-state") ?? "missing",
      statusText: document.querySelector(".playsay-live-sync-status")?.textContent?.trim() ?? "",
      textareaDisabled: document.querySelector("[data-testid='collaboration-live-textarea']") instanceof HTMLTextAreaElement
        ? document.querySelector("[data-testid='collaboration-live-textarea']").disabled
        : null,
    })).catch(() => ({ status: "debug-unavailable" })).then((debug) => {
      throw new Error(`Timed out waiting for enabled student live textarea; debug=${JSON.stringify(debug)}: ${error instanceof Error ? error.message : String(error)}`);
    });
  });
  await page.locator(".playsay-live-sync-status[data-state='connected']").waitFor({ timeout: timeoutMs }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      inlineMessage: document.querySelector(".playsay-lesson-inline-message")?.textContent?.trim() ?? "",
      status: document.querySelector(".playsay-live-sync-status")?.getAttribute("data-state") ?? "missing",
      statusText: document.querySelector(".playsay-live-sync-status")?.textContent?.trim() ?? "",
      textareaDisabled: document.querySelector("[data-testid='collaboration-live-textarea']") instanceof HTMLTextAreaElement
        ? document.querySelector("[data-testid='collaboration-live-textarea']").disabled
        : null,
    })).catch(() => ({ status: "debug-unavailable" }));
    throw new Error(`Timed out waiting for connected student Yjs workspace; debug=${JSON.stringify(debug)}: ${error instanceof Error ? error.message : String(error)}`);
  });
  await textarea.fill(text);
}

async function openTeacherStudentDocument(page, profile) {
  const label = profile.displayName ?? profile.username ?? profile.subject;
  const row = page.locator(".playsay-collaboration-student-row").filter({ hasText: label }).first();
  await row.waitFor({ timeout: timeoutMs });
  await row.click();
}

async function openTeacherGroupDocument(page) {
  const groupButton = page.locator(".playsay-collaboration-doc-status").first();
  await groupButton.waitFor({ timeout: timeoutMs });
  await groupButton.click();
}

async function refreshTeacherPanel(page) {
  const button = page.locator(".playsay-collaboration-panel-summary button").first();
  await button.waitFor({ timeout: timeoutMs });
  await button.click();
}

async function switchStudentMode(page, mode) {
  await page.locator(`[data-testid='collaboration-mode-${mode}']`).click();
  await page.waitForFunction((expectedMode) => {
    const button = document.querySelector(`[data-testid='collaboration-mode-${expectedMode}']`);
    const textarea = document.querySelector("[data-testid='collaboration-live-textarea']");
    return button?.getAttribute("data-active") === "true" &&
      textarea instanceof HTMLTextAreaElement &&
      !textarea.disabled;
  }, mode, { timeout: timeoutMs });
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
  await waitForLocatorCount(page, "[data-testid='lesson-material-surface'] .playsay-annotation-layer path", 1, "student A annotation path");
  await page.locator("[data-testid='annotation-tool-pointer']").click();
}

async function assertAnnotationInsideSurface(page) {
  await page.waitForFunction(() => {
    const surface = document.querySelector("[data-testid='lesson-material-surface']");
    const path = surface?.querySelector(".playsay-annotation-layer path");
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

async function finalizeStudentWork(page, token, lessonId) {
  const button = page.locator("[data-testid='collaboration-finalize-button']");
  await button.waitFor({ timeout: timeoutMs });
  await page.waitForFunction(() => {
    const element = document.querySelector("[data-testid='collaboration-finalize-button']");
    return element instanceof HTMLButtonElement && !element.disabled;
  }, null, { timeout: timeoutMs });
  await button.click();
  await waitForApi(async () => {
    const submission = await apiRequest(token, "GET", `/schedule/lessons/${lessonId}/material-submission`, 200);
    return Boolean(submission.submittedAt);
  });
}

async function appendTextarea(page, selector, value) {
  const textarea = page.locator(selector).first();
  const current = await textarea.inputValue();
  await textarea.fill(`${current}${value}`);
}

async function waitForValueContains(page, selector, text, label = selector) {
  await page.waitForFunction(({ nextSelector, expected }) => {
    const element = document.querySelector(nextSelector);
    return element instanceof HTMLTextAreaElement && element.value.includes(expected);
  }, { nextSelector: selector, expected: text }, { timeout: timeoutMs }).catch((error) => {
    throw new Error(`Timed out waiting for ${label}: ${error instanceof Error ? error.message : String(error)}`);
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
