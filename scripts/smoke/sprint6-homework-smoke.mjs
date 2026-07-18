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
const timeoutMs = Number(process.env.PLAY_SAY_SMOKE_TIMEOUT_MS ?? 60_000);
const runId = `sprint6-homework-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const tokenStorageKey = "playsay.auth.tokens";
const languageStorageKey = "playsay.language";

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
  materialId: null,
  groupAssignmentId: null,
  singleAssignmentId: null,
  lessonHomeworkAssignmentId: null,
  completedLessonId: null,
};

const created = {
  materialId: null,
  materialRequest: null,
  completedLessonId: null,
};

let browser;
const sessions = [];

try {
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ headless });

  const passwords = readDemoPasswords();
  const teacher = await createSession(browser, "teacher", passwords.teacher, { width: 1440, height: 920 });
  const studentA = await createSession(browser, "studentA", passwords.studentA, { width: 390, height: 844 });
  const studentB = await createSession(browser, "studentB", passwords.studentB, { width: 1180, height: 860 });
  sessions.push(teacher, studentA, studentB);

  const [, studentAProfile, studentBProfile] = await Promise.all([
    ensureSmokeProfileLocale(teacher.tokens.accessToken),
    ensureSmokeProfileLocale(studentA.tokens.accessToken),
    ensureSmokeProfileLocale(studentB.tokens.accessToken),
  ]);
  addCheck("keycloak-login-and-student-profiles");

  const material = await createHomeworkMaterial(teacher.tokens.accessToken);
  created.materialId = material.id;
  summary.materialId = material.id;
  addCheck("temporary-homework-material-created");

  const dueAt = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
  const instructions = `Sprint 6 instructions ${runId}`;

  const groupAssignment = await apiRequest(teacher.tokens.accessToken, "POST", "/assignments", 201, {
    dueAt,
    instructions,
    materialId: material.id,
    studentSubjects: [studentAProfile.subject, studentBProfile.subject],
    title: `Sprint 6 group homework ${runId}`,
  });
  summary.groupAssignmentId = groupAssignment.assignment.id;
  assert(groupAssignment.assignment.recipientCount === 2, "Group assignment must have two recipients.");
  assert(groupAssignment.assignment.scoredCount === 0, "New group assignment must start with zero scored recipients.");
  assert(
    groupAssignment.assignment.averageScore === null || groupAssignment.assignment.averageScore === undefined,
    "New group assignment must not start with an average score.",
  );
  assert(
    groupAssignment.recipients.every((row) => row.score === null || row.score === undefined),
    "New group assignment recipients must not start with score.",
  );
  const teacherAssignmentsAfterCreate = await apiRequest(teacher.tokens.accessToken, "GET", "/assignments", 200);
  assert(
    teacherAssignmentsAfterCreate.some((assignment) => assignment.id === groupAssignment.assignment.id),
    "Teacher assignments API must list the newly created group homework.",
  );
  addCheck("teacher-created-standalone-group-homework");

  const singleAssignment = await apiRequest(teacher.tokens.accessToken, "POST", "/assignments", 201, {
    dueAt,
    instructions: `Single ${instructions}`,
    materialId: material.id,
    studentSubjects: [studentAProfile.subject],
    title: `Sprint 6 single homework ${runId}`,
  });
  summary.singleAssignmentId = singleAssignment.assignment.id;
  assert(singleAssignment.assignment.recipientCount === 1, "Single assignment must have one recipient.");
  assert(
    singleAssignment.recipients.length === 1 && singleAssignment.recipients[0].showGroupIndicator === false,
    "Single assignment must not render group indicator.",
  );
  addCheck("single-student-homework-has-no-health-indicator");

  await openHomeworkTab(teacher.page);
  await selectHomeworkAssignment(teacher.page, groupAssignment.assignment.title);
  await expectText(teacher.page, groupAssignment.assignment.title);
  await expectText(teacher.page, instructions);
  await expectText(teacher.page, "2 recipients");
  await expectText(teacher.page, "0/2 scored");
  addCheck("teacher-ui-shows-group-homework-due-instructions-and-empty-progress");

  await openHomeworkTab(studentA.page);
  await expectText(studentA.page, groupAssignment.assignment.title);
  await expectText(studentA.page, instructions);
  await expectText(studentA.page, "Draft not submitted");
  await assertMobileHomeworkLayout(studentA.page);
  addCheck("student-mobile-ui-shows-homework-with-compact-fill-gaps");

  const wrongContent = homeworkContent(material.id, {
    fish: "flies",
    bird: "swims",
  });
  const draft = await apiRequest(studentA.tokens.accessToken, "PUT", `/me/assignments/${groupAssignment.assignment.id}/submission`, 200, {
    content: wrongContent,
    submitted: false,
  });
  assert(draft.submittedAt === null, "Draft save must not set submittedAt.");
  addCheck("student-a-can-save-homework-draft-through-api");

  await studentCanReadOwnAssignment(studentB.tokens.accessToken, groupAssignment.assignment.id);
  addCheck("student-b-can-access-own-group-assignment");
  await apiRequest(studentB.tokens.accessToken, "GET", `/me/assignments/${singleAssignment.assignment.id}`, 404);
  addCheck("student-cannot-read-another-students-assignment");

  await selectHomeworkAssignment(studentA.page, groupAssignment.assignment.title);
  await chooseSelectAnswers(studentA.page, ["flies", "swims"]);
  await clickSubmit(studentA.page);
  await waitForSubmitted(studentA.tokens.accessToken, groupAssignment.assignment.id);
  addCheck("student-a-submits-known-wrong-answers-through-ui");

  await apiRequest(studentB.tokens.accessToken, "PUT", `/me/assignments/${groupAssignment.assignment.id}/submission`, 200, {
    content: homeworkContent(material.id, {
      fish: "swims",
      bird: "flies",
    }),
    submitted: true,
  });
  const firstProgress = await apiRequest(teacher.tokens.accessToken, "GET", `/assignments/${groupAssignment.assignment.id}`, 200);
  const weak = firstProgress.recipients.find((row) => row.studentSubject === studentAProfile.subject);
  const strong = firstProgress.recipients.find((row) => row.studentSubject === studentBProfile.subject);
  assert(
    weak?.submitted === true && strong?.submitted === true,
    `Both students must be submitted for comparison. Recipients: ${JSON.stringify(firstProgress.recipients, null, 2)}`,
  );
  assert(
    weak.showGroupIndicator === true && strong.showGroupIndicator === true,
    "Group progress indicator should be shown after scored answers in multi-student assignment.",
  );
  assert(
    typeof weak.progressTone === "number" && typeof strong.progressTone === "number",
    "Both group recipients must have progress tone.",
  );
  assert(
    strong.progressTone > weak.progressTone,
    `Expected Student B tone > Student A tone, got ${strong.progressTone} <= ${weak.progressTone}.`,
  );
  assert((weak.errorsCount ?? 0) > (strong.errorsCount ?? 0), "Student A should have more errors than Student B.");
  addCheck("teacher-api-sees-group-progress-worse-for-student-a");

  await openHomeworkTab(teacher.page);
  await selectHomeworkAssignment(teacher.page, groupAssignment.assignment.title);
  await expectText(teacher.page, "With errors");
  await expectText(teacher.page, "errors:");
  addCheck("teacher-ui-shows-group-progress-filter-and-error-summary");

  await apiRequest(studentA.tokens.accessToken, "PUT", `/me/assignments/${groupAssignment.assignment.id}/submission`, 200, {
    content: homeworkContent(material.id, {
      fish: "swims",
      bird: "flies",
    }),
    submitted: true,
  });
  const improvedProgress = await apiRequest(teacher.tokens.accessToken, "GET", `/assignments/${groupAssignment.assignment.id}`, 200);
  const improvedA = improvedProgress.recipients.find((row) => row.studentSubject === studentAProfile.subject);
  assert((improvedA?.errorsCount ?? 1) === 0, "Student A errors should improve to zero.");
  assert((improvedA?.score ?? 0) > (weak.score ?? -1), "Student A score should improve after corrected answers.");
  addCheck("student-a-can-improve-score-after-resubmission");

  const completedLesson = await createCompletedLesson(
    teacher.tokens.accessToken,
    material.id,
    [studentAProfile.subject, studentBProfile.subject],
  );
  created.completedLessonId = completedLesson.id;
  summary.completedLessonId = completedLesson.id;
  await apiRequest(studentA.tokens.accessToken, "POST", `/schedule/lessons/${completedLesson.id}/room-token`, 404);
  const lessonHomework = await apiRequest(teacher.tokens.accessToken, "POST", `/schedule/lessons/${completedLesson.id}/homework`, 201, {
    dueAt,
    instructions: `Carry-over ${instructions}`,
    title: `Sprint 6 carry-over homework ${runId}`,
  });
  summary.lessonHomeworkAssignmentId = lessonHomework.assignment.id;
  const studentCarryOverList = await apiRequest(studentA.tokens.accessToken, "GET", "/me/assignments", 200);
  assert(
    studentCarryOverList.some((item) => item.id === lessonHomework.assignment.id),
    "Student A must see carry-over homework after completed lesson.",
  );
  addCheck("completed-lesson-is-not-joinable-but-carry-over-homework-is-visible");

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
    // Keep output focused on the primary failure.
  }
  console.error(`Sprint 6 homework smoke failed: ${error instanceof Error ? error.message : String(error)}`);
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

async function createSession(nextBrowser, role, credentials, viewport) {
  const context = await nextBrowser.newContext({
    ignoreHTTPSErrors: true,
    viewport,
  });
  const page = await context.newPage();
  const tokens = await loginWithKeycloakUi(page, credentials);
  await context.addInitScript(({ storageKey, languageKey, tokenSet }) => {
    window.localStorage.setItem(languageKey, "en");
    window.sessionStorage.setItem(storageKey, JSON.stringify(tokenSet));
  }, { storageKey: tokenStorageKey, languageKey: languageStorageKey, tokenSet: tokens });
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
  authorizeUrl.searchParams.set("ui_locales", "en");

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
    throw new Error(`Keycloak login form did not return an auth redirect; HTTP ${response.status()}`);
  }
  const callbackUrl = new URL(location, webBaseUrl);
  if (callbackUrl.pathname !== "/auth/callback" || !callbackUrl.searchParams.has("code")) {
    throw new Error(`Keycloak login redirected to unexpected path: ${callbackUrl.pathname}`);
  }
  return callbackUrl;
}

async function openHomeworkTab(page) {
  await page.goto(webBaseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const homeworkTab = page.locator('.playsay-workspace-tab[data-tab-id="homework"]');
  if (await homeworkTab.count() === 0) {
    const trigger = page.locator('[data-testid="workspace-switcher-trigger"]');
    await trigger.waitFor({ timeout: timeoutMs });
    await trigger.click();
  }
  await homeworkTab.waitFor({ timeout: timeoutMs });
  await homeworkTab.click();
  await page.locator(".playsay-homework-panel").waitFor({ timeout: timeoutMs });
}

async function selectHomeworkAssignment(page, title) {
  const item = page.locator(".playsay-homework-panel button").filter({ hasText: title }).first();
  await item.waitFor({ timeout: timeoutMs });
  await item.click();
  await page.waitForFunction((expectedTitle) => {
    const buttons = [...document.querySelectorAll(".playsay-homework-panel button")];
    const button = buttons.find((candidate) => candidate.textContent?.includes(expectedTitle));
    return button?.getAttribute("data-active") === "true";
  }, title, { timeout: timeoutMs });
  await page.locator(".playsay-homework-panel h3").filter({ hasText: title }).first().waitFor({ timeout: timeoutMs });
}

async function expectText(page, text) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout: timeoutMs });
  } catch (caught) {
    const snapshot = await page.locator(".playsay-homework-panel").first().innerText({ timeout: 2_000 })
      .catch(async () => page.locator("body").innerText({ timeout: 2_000 }).catch(() => "<unavailable>"));
    throw new Error(`Expected visible text ${JSON.stringify(text)}. Homework panel snapshot:\n${snapshot.slice(0, 4000)}\n${caught instanceof Error ? caught.message : String(caught)}`);
  }
}

async function chooseSelectAnswers(page, values) {
  const selects = page.locator(".playsay-homework-panel .playsay-inline-select");
  await waitForCount(page, ".playsay-homework-panel .playsay-inline-select", values.length);
  for (let index = 0; index < values.length; index += 1) {
    await selects.nth(index).selectOption(values[index]);
  }
}

async function clickSubmit(page) {
  const submit = page.getByRole("button", { name: /^submit$/i }).first();
  await submit.waitFor({ timeout: timeoutMs });
  const submissionResponse = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "PUT" && response.url().includes("/api/me/assignments/") && response.url().endsWith("/submission");
  }, { timeout: 10_000 }).catch(() => null);
  await submit.click();
  const response = await submissionResponse;
  if (!response) {
    const panel = await page.locator(".playsay-homework-panel").innerText({ timeout: 2_000 }).catch(() => "<unavailable>");
    throw new Error(`Clicking Submit did not issue a homework submission PUT. Panel snapshot:\n${panel.slice(0, 4000)}`);
  }
  if (response.status() !== 200) {
    throw new Error(`Homework submission PUT returned HTTP ${response.status()}.`);
  }
}

async function waitForSubmitted(token, assignmentId) {
  const deadline = Date.now() + timeoutMs;
  let lastSubmission = null;
  while (Date.now() < deadline) {
    lastSubmission = await apiRequest(token, "GET", `/me/assignments/${assignmentId}/submission`, 200);
    if (lastSubmission.submittedAt) {
      return lastSubmission;
    }
    await delay(1_000);
  }
  throw new Error(`Submission ${assignmentId} was not marked submitted before timeout. Last snapshot: ${JSON.stringify(lastSubmission)}`);
}

async function assertMobileHomeworkLayout(page) {
  await page.waitForFunction(() => {
    return document.querySelectorAll(".playsay-homework-panel .playsay-answer-fragment").length >= 2;
  }, null, { timeout: timeoutMs });
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const fragments = [...document.querySelectorAll(".playsay-homework-panel .playsay-answer-fragment")]
      .map((element) => element.getBoundingClientRect());
    return {
      horizontalOverflow: root.scrollWidth > window.innerWidth + 1,
      fragmentCount: fragments.length,
      verticalGap: fragments.length >= 2 ? Math.abs(fragments[1].top - fragments[0].top) : 0,
    };
  });
  assert(result.fragmentCount >= 2, "Expected at least two fill-gap fragments.");
  assert(result.verticalGap >= 16, `Expected mobile fill gaps to be vertically separated, got gap ${result.verticalGap}.`);
  assert(!result.horizontalOverflow, "Expected no horizontal overflow on mobile homework.");
}

async function waitForCount(page, selector, minimumCount) {
  await page.waitForFunction(({ nextSelector, min }) => {
    return document.querySelectorAll(nextSelector).length >= min;
  }, { nextSelector: selector, min: minimumCount }, { timeout: timeoutMs });
}

async function createHomeworkMaterial(token) {
  created.materialRequest = {
    cefrLevel: "A1",
    description: "Temporary Sprint 6 homework smoke material.",
    document: {
      schemaVersion: 1,
      pages: [
        {
          blocks: [
            {
              body: "Complete the animal sentences.",
              id: "intro",
              title: "Instructions",
              type: "text",
            },
            {
              assessment: { maxAttempts: 3, maxErrors: 3 },
              id: "animal-gaps",
              items: [
                {
                  answer: "swims",
                  gapMode: "singleChoice",
                  id: "fish",
                  options: ["swims", "flies", "walks"],
                  prompt: "A fish ___ in the water.",
                },
                {
                  answer: "flies",
                  gapMode: "singleChoice",
                  id: "bird",
                  options: ["flies", "swims", "walks"],
                  prompt: "A bird ___ in the sky.",
                },
              ],
              title: "Animal actions",
              type: "fillGaps",
            },
          ],
          id: "homework-page",
          layout: "FLOW",
          title: "Sprint 6 homework",
        },
      ],
    },
    language: "en",
    scoringRubric: { maxScore: 10 },
    sourceMeta: { kind: "SMOKE", runId },
    status: "PUBLISHED",
    title: `Sprint 6 homework smoke material ${runId}`,
    visibility: "PRIVATE",
  };
  return apiRequest(token, "POST", "/materials", 201, created.materialRequest);
}

async function createCompletedLesson(token, materialId, participantSubjects) {
  const now = Date.now();
  const lesson = await apiRequest(token, "POST", "/schedule/lessons", 201, {
    materialId,
    participantSubjects,
    scheduledEnd: new Date(now - 5 * 60 * 1000).toISOString(),
    scheduledStart: new Date(now - 65 * 60 * 1000).toISOString(),
    status: "SCHEDULED",
    type: "GROUP",
  });
  await apiRequest(token, "POST", `/schedule/lessons/${lesson.id}/start`, 200);
  return apiRequest(token, "POST", `/schedule/lessons/${lesson.id}/complete`, 200);
}

function homeworkContent(materialId, items) {
  return {
    schemaVersion: 1,
    materialId,
    answers: {
      "animal-gaps": {
        type: "fillGaps",
        items,
        optionIds: {},
        attempts: Object.fromEntries(Object.entries(items).map(([key, value]) => [
          key,
          [{ at: new Date().toISOString(), correct: value === (key === "fish" ? "swims" : "flies"), value }],
        ])),
        context: {
          blockId: "animal-gaps",
          blockTitle: "Animal actions",
          blockType: "fillGaps",
        },
        hints: {},
      },
    },
  };
}

async function studentCanReadOwnAssignment(token, assignmentId) {
  await apiRequest(token, "GET", `/me/assignments/${assignmentId}`, 200);
}

async function ensureSmokeProfileLocale(token) {
  const profile = await apiRequest(token, "GET", "/users/me/profile", 200);
  if (profile.locale === "en") {
    return profile;
  }
  return apiRequest(token, "PUT", "/users/me/profile", 200, {
    displayName: profile.displayName,
    learningGoal: profile.learningGoal,
    locale: "en",
    timezone: profile.timezone,
  });
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

async function cleanup(token) {
  if (created.completedLessonId) {
    await apiRequest(token, "DELETE", `/schedule/lessons/${created.completedLessonId}`, 204).catch(() => null);
    created.completedLessonId = null;
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

function addCheck(name) {
  summary.checks.push(name);
  console.log(`ok ${name}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
