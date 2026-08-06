#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const webBaseUrl = (process.env.PLAY_SAY_SMOKE_WEB_BASE_URL ?? "https://dev.online.honey.school").replace(/\/+$/, "");
const apiBaseUrl = `${webBaseUrl}/api`;
const authIssuer = process.env.PLAY_SAY_SMOKE_AUTH_ISSUER
  ?? "https://dev.ops.honey.school/keycloak/realms/playsay";
const playwrightPackageDir = process.env.PLAYWRIGHT_PACKAGE_DIR
  ?? "/Users/evgeniymednov/.codex/tools/playwright";
const outputDir = process.env.PLAY_SAY_GAME_COMPARE_OUTPUT_DIR
  ?? path.join(process.cwd(), "tmp", "game-adaptation-compare");
const timeoutMs = Number(process.env.PLAY_SAY_SMOKE_TIMEOUT_MS ?? 60_000);
const actionTimeoutMs = Number(process.env.PLAY_SAY_GAME_COMPARE_ACTION_TIMEOUT_MS ?? 5_000);
const sampleCount = Number(process.env.PLAY_SAY_GAME_COMPARE_SAMPLES ?? 40);
const candidateMode = process.env.PLAY_SAY_GAME_COMPARE_CANDIDATE ?? "fixed";
const runId = `game-compare-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const tokenStorageKey = "playsay.auth.tokens";
const blockId = "game-compare-racing";
const gameTitle = "English Racing";

const credentials = {
  teacher: {
    username: process.env.PLAY_SAY_SMOKE_TEACHER_USERNAME ?? "teacher-demo",
    password: requiredEnv("PLAY_SAY_SMOKE_TEACHER_PASSWORD"),
  },
  student: {
    username: process.env.PLAY_SAY_SMOKE_STUDENT_A_USERNAME ?? "student-demo",
    password: requiredEnv("PLAY_SAY_SMOKE_STUDENT_A_PASSWORD"),
  },
};

mkdirSync(outputDir, { recursive: true });

const summary = {
  runId,
  candidateMode,
  commit: process.env.GITHUB_AFTER ?? process.env.GIT_COMMIT ?? "local",
  build: process.env.BUILD_TAG ?? "local",
  measuredAt: new Date().toISOString(),
  materialId: null,
  originalLessonId: null,
  adaptedLessonId: null,
  adaptation: null,
  original: null,
  adapted: null,
  appearance: null,
  outputDir,
};

const createdLessonIds = [];
let materialRequest = null;
let teacherToken = null;
let browser = null;
let teacherContext = null;
let studentContext = null;

try {
  const requireFromTools = createRequire(path.join(playwrightPackageDir, "package.json"));
  const { chromium } = requireFromTools("playwright");
  browser = await chromium.launch({ headless: true });

  const teacher = await createSession(browser, "teacher", credentials.teacher);
  const student = await createSession(browser, "student", credentials.student);
  teacherContext = teacher.context;
  studentContext = student.context;
  teacherToken = teacher.tokens.accessToken;

  const studentProfile = await apiRequest(student.tokens.accessToken, "GET", "/users/me/profile", 200);
  const material = await createMaterial(teacher.tokens.accessToken);
  summary.materialId = material.id;

  const originalAsset = await uploadHtmlGame(teacher.tokens.accessToken, material.id, racingGameHtml());
  materialRequest = materialWithGame(originalAsset.id);
  await apiRequest(teacher.tokens.accessToken, "PUT", `/materials/${material.id}`, 200, materialRequest);

  const originalLesson = await createLesson(
    teacher.tokens.accessToken,
    material.id,
    studentProfile.subject,
  );
  summary.originalLessonId = originalLesson.id;
  createdLessonIds.push(originalLesson.id);
  summary.original = await measureLesson(
    teacher.page,
    student.page,
    student.tokens.accessToken,
    originalLesson.id,
    "original",
  );
  await deleteLesson(teacher.tokens.accessToken, originalLesson.id);

  let candidateHtml;
  if (candidateMode === "ai") {
    const adaptation = await requestAndWaitForAdaptation(
      teacher.tokens.accessToken,
      material.id,
      originalAsset.id,
    );
    summary.adaptation = {
      id: adaptation.id,
      status: adaptation.status,
      compatibility: adaptation.compatibility,
      mechanicsValidation: adaptation.mechanicsValidation,
      validatorVersion: adaptation.validatorVersion,
      validationReport: adaptation.validationReport,
      errorCode: adaptation.errorCode,
    };
    if (adaptation.status !== "READY_FOR_REVIEW" || adaptation.mechanicsValidation !== "PASSED") {
      throw new Error(`Adaptation was not accepted: ${JSON.stringify(summary.adaptation)}`);
    }
    candidateHtml = await assetContent(
      teacher.tokens.accessToken,
      material.id,
      adaptation.adaptedAssetId,
    );
    await apiRequest(
      teacher.tokens.accessToken,
      "POST",
      `/materials/${material.id}/assets/${originalAsset.id}/game-adaptations/${adaptation.id}/apply`,
      200,
    );
  } else if (candidateMode === "fixed") {
    candidateHtml = sdkRacingGameHtml();
    const candidateAsset = await uploadHtmlGame(
      teacher.tokens.accessToken,
      material.id,
      candidateHtml,
    );
    materialRequest = materialWithGame(candidateAsset.id);
    await apiRequest(
      teacher.tokens.accessToken,
      "PUT",
      `/materials/${material.id}`,
      200,
      materialRequest,
    );
    summary.adaptation = {
      status: "DETERMINISTIC_FIXTURE",
      compatibility: "SDK_V1",
      mechanicsValidation: "NOT_APPLICABLE",
      validatorVersion: null,
    };
  } else {
    throw new Error(`Unsupported PLAY_SAY_GAME_COMPARE_CANDIDATE=${candidateMode}`);
  }
  summary.appearance = await compareStandaloneAppearance(
    browser,
    racingGameHtml(),
    candidateHtml,
  );

  const adaptedLesson = await createLesson(
    teacher.tokens.accessToken,
    material.id,
    studentProfile.subject,
  );
  summary.adaptedLessonId = adaptedLesson.id;
  createdLessonIds.push(adaptedLesson.id);
  summary.adapted = await measureLesson(
    teacher.page,
    student.page,
    student.tokens.accessToken,
    adaptedLesson.id,
    "adapted",
  );
  await deleteLesson(teacher.tokens.accessToken, adaptedLesson.id);

  summary.appearance.liveDomEquivalent =
    JSON.stringify(summary.original.domFingerprint) === JSON.stringify(summary.adapted.domFingerprint);
  summary.appearance.liveScreenshotByteEqual =
    summary.original.screenshotSha256 === summary.adapted.screenshotSha256;
  summary.latency = {
    originalMedianMs: percentile(summary.original.teacherToStudent.latenciesMs, 0.5),
    originalP95Ms: percentile(summary.original.teacherToStudent.latenciesMs, 0.95),
    originalP99Ms: percentile(summary.original.teacherToStudent.latenciesMs, 0.99),
    adaptedMedianMs: percentile(summary.adapted.teacherToStudent.latenciesMs, 0.5),
    adaptedP95Ms: percentile(summary.adapted.teacherToStudent.latenciesMs, 0.95),
    adaptedP99Ms: percentile(summary.adapted.teacherToStudent.latenciesMs, 0.99),
    originalLoadedP95Ms: percentile(summary.original.loadedTeacherToStudent.latenciesMs, 0.95),
    adaptedLoadedP95Ms: percentile(summary.adapted.loadedTeacherToStudent.latenciesMs, 0.95),
    originalLoadedKeyboardP95Ms: summary.original.loadedKeyboardTeacherToStudent.p95Ms,
    adaptedLoadedKeyboardP95Ms: summary.adapted.loadedKeyboardTeacherToStudent.p95Ms,
    originalLoadedRangeP95Ms: summary.original.loadedRangeTeacherToStudent.p95Ms,
    adaptedLoadedRangeP95Ms: summary.adapted.loadedRangeTeacherToStudent.p95Ms,
  };
  summary.latency.p95DeltaMs = summary.latency.adaptedP95Ms - summary.latency.originalP95Ms;
  summary.latency.p95Ratio = Number(
    (summary.latency.adaptedP95Ms / Math.max(1, summary.latency.originalP95Ms)).toFixed(2),
  );
  summary.latency.loadedP95Ratio = Number(
    (
      summary.latency.adaptedLoadedP95Ms
      / Math.max(1, summary.latency.originalLoadedP95Ms)
    ).toFixed(2),
  );
  const idleRatios = [
    ratio(summary.adapted.teacherToStudent.p95Ms, summary.original.teacherToStudent.p95Ms),
    ratio(summary.adapted.studentToTeacher.p95Ms, summary.original.studentToTeacher.p95Ms),
    ratio(summary.adapted.keyboardTeacherToStudent.p95Ms, summary.original.keyboardTeacherToStudent.p95Ms),
    ratio(summary.adapted.keyboardStudentToTeacher.p95Ms, summary.original.keyboardStudentToTeacher.p95Ms),
    ratio(summary.adapted.rangeTeacherToStudent.p95Ms, summary.original.rangeTeacherToStudent.p95Ms),
    ratio(summary.adapted.rangeStudentToTeacher.p95Ms, summary.original.rangeStudentToTeacher.p95Ms),
  ];
  const loadedRatios = [
    ratio(summary.adapted.loadedTeacherToStudent.p95Ms, summary.original.loadedTeacherToStudent.p95Ms),
    ratio(summary.adapted.loadedStudentToTeacher.p95Ms, summary.original.loadedStudentToTeacher.p95Ms),
    ratio(summary.adapted.loadedKeyboardTeacherToStudent.p95Ms, summary.original.loadedKeyboardTeacherToStudent.p95Ms),
    ratio(summary.adapted.loadedKeyboardStudentToTeacher.p95Ms, summary.original.loadedKeyboardStudentToTeacher.p95Ms),
    ratio(summary.adapted.loadedRangeTeacherToStudent.p95Ms, summary.original.loadedRangeTeacherToStudent.p95Ms),
    ratio(summary.adapted.loadedRangeStudentToTeacher.p95Ms, summary.original.loadedRangeStudentToTeacher.p95Ms),
  ];
  const adaptedTrace = summary.adapted.diagnostics.summary;
  const adaptedMissingActions = [
    summary.adapted.teacherToStudent,
    summary.adapted.studentToTeacher,
    summary.adapted.keyboardTeacherToStudent,
    summary.adapted.keyboardStudentToTeacher,
    summary.adapted.rangeTeacherToStudent,
    summary.adapted.rangeStudentToTeacher,
    summary.adapted.loadedTeacherToStudent,
    summary.adapted.loadedStudentToTeacher,
    summary.adapted.loadedKeyboardTeacherToStudent,
    summary.adapted.loadedKeyboardStudentToTeacher,
    summary.adapted.loadedRangeTeacherToStudent,
    summary.adapted.loadedRangeStudentToTeacher,
  ].reduce((total, measurement) => total + measurement.missedActions, 0);
  summary.gates = {
    idleWorstRatio: Math.max(...idleRatios),
    loadedWorstRatio: Math.max(...loadedRatios),
    localOptimisticP95Ms: adaptedTrace.localOptimisticP95Ms,
    noIntegrityFailures:
      adaptedTrace.duplicateReducerApplies === 0
      && adaptedTrace.missingReducerApplies === 0
      && adaptedTrace.revisionConflicts === 0
      && adaptedMissingActions === 0,
    missingActions: adaptedMissingActions,
    visualEquivalent:
      summary.appearance.liveDomEquivalent
      && summary.appearance.standaloneDomEquivalent
      && summary.appearance.standaloneScreenshotByteEqual,
  };
  summary.gates.primaryAccepted = candidateMode === "fixed"
    && summary.gates.idleWorstRatio <= 1.05
    && summary.gates.loadedWorstRatio <= 0.8
    && summary.gates.localOptimisticP95Ms <= 32
    && summary.gates.noIntegrityFailures
    && summary.gates.visualEquivalent;
} catch (error) {
  summary.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (teacherToken) {
    for (const lessonId of createdLessonIds) {
      await deleteLesson(teacherToken, lessonId).catch(() => null);
    }
    if (summary.materialId && materialRequest) {
      await apiRequest(teacherToken, "PUT", `/materials/${summary.materialId}`, 200, {
        ...materialRequest,
        status: "ARCHIVED",
        title: `${materialRequest.title} archived`,
      }).catch(() => null);
    }
  }
  await Promise.allSettled([teacherContext?.close(), studentContext?.close()]);
  await browser?.close();
  writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

async function createSession(nextBrowser, role, account) {
  const context = await nextBrowser.newContext({
    ignoreHTTPSErrors: true,
    viewport: role === "teacher" ? { width: 1440, height: 920 } : { width: 1180, height: 860 },
  });
  const page = await context.newPage();
  const tokens = await loginWithKeycloakUi(page, account);
  await context.addInitScript(({ storageKey, tokenSet }) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify(tokenSet));
  }, { storageKey: tokenStorageKey, tokenSet: tokens });
  return { context, page, tokens };
}

async function loginWithKeycloakUi(page, account) {
  const redirectUri = `${webBaseUrl}/auth/callback`;
  const codeVerifier = base64Url(randomBytes(32));
  const state = base64Url(randomBytes(24));
  const authorizeUrl = new URL(`${authIssuer}/protocol/openid-connect/auth`);
  authorizeUrl.searchParams.set("client_id", "playsay-web");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set(
    "code_challenge",
    base64Url(createHash("sha256").update(codeVerifier).digest()),
  );
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  await page.goto(authorizeUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });

  const form = await page.locator("#kc-form-login").evaluate((element) => ({
    action: element.action,
    inputs: [...element.querySelectorAll("input")].map((input) => ({
      name: input.name,
      value: input.value,
    })),
  }));
  const body = new URLSearchParams();
  for (const input of form.inputs) {
    if (!input.name) continue;
    body.set(
      input.name,
      input.name === "username"
        ? account.username
        : input.name === "password"
          ? account.password
          : input.value,
    );
  }
  const formUrl = new URL(form.action);
  const cookies = (await contextCookiesFor(page, formUrl))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const response = await page.context().request.post(form.action, {
    data: body.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
    maxRedirects: 0,
    timeout: timeoutMs,
  });
  const callbackUrl = new URL(response.headers().location, webBaseUrl);
  if (callbackUrl.searchParams.get("state") !== state) throw new Error("Keycloak state mismatch");
  const code = callbackUrl.searchParams.get("code");
  if (!code) throw new Error(`Keycloak login failed with HTTP ${response.status()}`);

  const tokenResponse = await fetch(`${authIssuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "playsay-web",
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`Keycloak token exchange failed: ${tokenResponse.status}`);
  const token = await tokenResponse.json();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    idToken: token.id_token,
    expiresAt: Date.now() + Number(token.expires_in) * 1000,
  };
}

async function contextCookiesFor(page, formUrl) {
  return (await page.context().cookies()).filter((cookie) => {
    const domain = cookie.domain.replace(/^\./, "");
    return formUrl.hostname.endsWith(domain) && formUrl.pathname.startsWith(cookie.path);
  });
}

async function createMaterial(token) {
  const request = {
    cefrLevel: "A2",
    description: "Temporary original/adapted game latency comparison.",
    document: { schemaVersion: 1, pages: [{ id: "placeholder", title: "Preparing", layout: "FLOW", blocks: [] }] },
    language: "en",
    scoringRubric: { maxScore: 10 },
    sourceMeta: { kind: "SMOKE", runId },
    status: "PUBLISHED",
    title: `Game adaptation compare ${runId}`,
    visibility: "PRIVATE",
  };
  return apiRequest(token, "POST", "/materials", 201, request);
}

function materialWithGame(assetId) {
  return {
    cefrLevel: "A2",
    description: "Temporary original/adapted game latency comparison.",
    document: {
      schemaVersion: 1,
      pages: [{
        id: "game-page",
        title: gameTitle,
        layout: "HTML_GAME",
        blocks: [{
          id: blockId,
          type: "htmlGame",
          title: gameTitle,
          gameTitleSource: "USER",
          url: `material-asset:${assetId}`,
          height: 640,
        }],
      }],
    },
    language: "en",
    scoringRubric: { maxScore: 10 },
    sourceMeta: { kind: "SMOKE", runId },
    status: "PUBLISHED",
    title: `Game adaptation compare ${runId}`,
    visibility: "PRIVATE",
  };
}

async function uploadHtmlGame(token, materialId, html) {
  const form = new FormData();
  form.append("file", new Blob([html], { type: "text/html" }), "english-racing.html");
  const response = await fetch(`${apiBaseUrl}/materials/${materialId}/assets/html-games`, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  if (response.status !== 201) throw new Error(`HTML game upload failed ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function createLesson(token, materialId, studentSubject) {
  const now = Date.now();
  const lesson = await apiRequest(token, "POST", "/schedule/lessons", 201, {
    materialId,
    participantSubjects: [studentSubject],
    scheduledEnd: new Date(now + 45 * 60_000).toISOString(),
    scheduledStart: new Date(now - 60_000).toISOString(),
    status: "SCHEDULED",
    type: "INDIVIDUAL",
    workMode: "SHARED",
  });
  const started = await apiRequest(token, "POST", `/schedule/lessons/${lesson.id}/start`, 200);
  return started;
}

async function measureLesson(teacherPage, studentPage, studentToken, lessonId, label) {
  const collaborationDocument = await apiRequest(
    studentToken,
    "POST",
    `/schedule/lessons/${lessonId}/collaboration-documents/current`,
    200,
    {
    documentKind: "MATERIAL_WORK",
    materialId: summary.materialId,
    scope: "GROUP",
    },
  );
  await Promise.all([
    openClassroom(teacherPage, lessonId, true),
    openClassroom(studentPage, lessonId, false),
  ]);

  const teacherLaunch = teacherPage.locator(`[data-testid="html-game-launch-${blockId}"]`);
  const studentLaunch = studentPage.locator(`[data-testid="html-game-launch-${blockId}"]`);
  await Promise.all([
    teacherLaunch.waitFor({ timeout: timeoutMs }),
    studentLaunch.waitFor({ timeout: timeoutMs }),
  ]);
  // Establish the authority run before starting the replica. The presentation
  // state and authority run use separate shared updates; opening both frames in
  // the same task can otherwise boot the replica with its temporary fallback ID.
  await teacherLaunch.click();
  await teacherPage.locator(".playsay-html-game[data-paused='false'] iframe").waitFor({
    timeout: timeoutMs,
  });
  await teacherPage.waitForTimeout(750);
  const activeStudentIframe = studentPage.locator(".playsay-html-game[data-paused='false'] iframe");
  if (!await activeStudentIframe.isVisible() && await studentLaunch.isVisible()) {
    await studentLaunch.click();
  }
  await Promise.all([
    teacherPage.locator(".playsay-html-game[data-paused='false'] iframe").waitFor({ timeout: timeoutMs }),
    studentPage.locator(".playsay-html-game[data-paused='false'] iframe").waitFor({ timeout: timeoutMs }),
  ]);

  const teacherFrame = teacherPage.frameLocator(".playsay-html-game[data-paused='false'] iframe");
  const studentFrame = studentPage.frameLocator(".playsay-html-game[data-paused='false'] iframe");
  await Promise.all([
    teacherFrame.locator("#move").waitFor({ timeout: timeoutMs }),
    studentFrame.locator("#move").waitFor({ timeout: timeoutMs }),
  ]);
  await studentFrame.locator("#position").waitFor({ timeout: timeoutMs });
  const runtime = await Promise.all([
    teacherPage.locator(".playsay-html-game").getAttribute("data-runtime"),
    studentPage.locator(".playsay-html-game").getAttribute("data-runtime"),
  ]);

  const domFingerprint = await teacherFrame.locator("body").evaluate((body) => {
    const selectors = [
      "#game",
      "#track",
      "#car",
      "#move",
      "#reset",
      "#speed-wrap",
      "#speed",
      "#speed-value",
      "#position",
    ];
    return {
      text: body.innerText.replace(/\s+/g, " ").trim(),
      elements: selectors.map((selector) => {
        const element = body.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          selector,
          tag: element.tagName,
          className: element.className,
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          height: style.height,
          width: style.width,
        };
      }),
    };
  });

  const screenshotPath = path.join(outputDir, `${label}.png`);
  const activeTeacherIframe = teacherPage.locator(".playsay-html-game[data-paused='false'] iframe");
  await activeTeacherIframe.screenshot({ path: screenshotPath });
  const screenshot = await activeTeacherIframe.screenshot();
  const teacherToStudent = await measureDirection(teacherFrame, studentFrame, sampleCount);
  await teacherFrame.locator("#reset").click();
  await Promise.all([
    waitForFrameText(teacherFrame, "#position", "0", timeoutMs),
    waitForFrameText(studentFrame, "#position", "0", timeoutMs),
  ]);
  const studentToTeacher = await measureDirection(studentFrame, teacherFrame, sampleCount);
  await studentFrame.locator("#reset").click();
  await Promise.all([
    waitForFrameText(teacherFrame, "#position", "0", timeoutMs),
    waitForFrameText(studentFrame, "#position", "0", timeoutMs),
  ]);
  const keyboardTeacherToStudent = await measureKeyboardDirection(
    teacherFrame,
    studentFrame,
    sampleCount,
  );
  await teacherFrame.locator("#reset").click();
  await Promise.all([
    waitForFrameText(teacherFrame, "#position", "0", timeoutMs),
    waitForFrameText(studentFrame, "#position", "0", timeoutMs),
  ]);
  const keyboardStudentToTeacher = await measureKeyboardDirection(
    studentFrame,
    teacherFrame,
    sampleCount,
  );
  await studentFrame.locator("#reset").click();
  await Promise.all([
    waitForFrameText(teacherFrame, "#position", "0", timeoutMs),
    waitForFrameText(studentFrame, "#position", "0", timeoutMs),
  ]);
  const rangeTeacherToStudent = await measureRangeDirection(
    teacherFrame,
    studentFrame,
    sampleCount,
  );
  const rangeStudentToTeacher = await measureRangeDirection(
    studentFrame,
    teacherFrame,
    sampleCount,
  );
  const loadToken = await apiRequest(
    studentToken,
    "POST",
    `/schedule/lessons/${lessonId}/collaboration-documents/${collaborationDocument.id}/token`,
    200,
  );
  await startCollaborationLoad(studentPage, loadToken);
  const loadedTeacherToStudent = await measureDirection(
    teacherFrame,
    studentFrame,
    sampleCount,
  );
  await teacherFrame.locator("#reset").click();
  await Promise.all([
    waitForFrameText(teacherFrame, "#position", "0", timeoutMs),
    waitForFrameText(studentFrame, "#position", "0", timeoutMs),
  ]);
  const loadedStudentToTeacher = await measureDirection(
    studentFrame,
    teacherFrame,
    sampleCount,
  );
  await studentFrame.locator("#reset").click();
  await Promise.all([
    waitForFrameText(teacherFrame, "#position", "0", timeoutMs),
    waitForFrameText(studentFrame, "#position", "0", timeoutMs),
  ]);
  const loadedKeyboardTeacherToStudent = await measureKeyboardDirection(
    teacherFrame,
    studentFrame,
    sampleCount,
  );
  await teacherFrame.locator("#reset").click();
  await Promise.all([
    waitForFrameText(teacherFrame, "#position", "0", timeoutMs),
    waitForFrameText(studentFrame, "#position", "0", timeoutMs),
  ]);
  const loadedKeyboardStudentToTeacher = await measureKeyboardDirection(
    studentFrame,
    teacherFrame,
    sampleCount,
  );
  const loadedRangeTeacherToStudent = await measureRangeDirection(
    teacherFrame,
    studentFrame,
    sampleCount,
  );
  const loadedRangeStudentToTeacher = await measureRangeDirection(
    studentFrame,
    teacherFrame,
    sampleCount,
  );
  await stopCollaborationLoad(studentPage);
  const teacherDiagnostics = await teacherPage.evaluate(
    () => window.__PLAY_SAY_GAME_SYNC_DIAGNOSTICS__ ?? [],
  );
  const studentDiagnostics = await studentPage.evaluate(
    () => window.__PLAY_SAY_GAME_SYNC_DIAGNOSTICS__ ?? [],
  );
  return {
    runtime,
    diagnostics: {
      summary: summarizeDiagnostics([...teacherDiagnostics, ...studentDiagnostics]),
      teacher: teacherDiagnostics,
      student: studentDiagnostics,
    },
    gameRealtime: {
      teacher: await teacherPage.evaluate(() => window.__PLAY_SAY_GAME_REALTIME__ ?? null),
      student: await studentPage.evaluate(() => window.__PLAY_SAY_GAME_REALTIME__ ?? null),
    },
    domFingerprint,
    screenshotPath,
    screenshotSha256: createHash("sha256").update(screenshot).digest("hex"),
    loadedStudentToTeacher,
    loadedTeacherToStudent,
    loadedKeyboardStudentToTeacher,
    loadedKeyboardTeacherToStudent,
    loadedRangeStudentToTeacher,
    loadedRangeTeacherToStudent,
    keyboardStudentToTeacher,
    keyboardTeacherToStudent,
    rangeStudentToTeacher,
    rangeTeacherToStudent,
    studentToTeacher,
    teacherToStudent,
  };
}

function summarizeDiagnostics(entries) {
  const byEvent = new Map();
  const stageCounts = {};
  for (const entry of entries) {
    stageCounts[entry.stage] = (stageCounts[entry.stage] ?? 0) + 1;
    if (!entry.eventId) continue;
    const event = byEvent.get(entry.eventId) ?? {
      stages: {},
      stageTimes: {},
      revisions: new Set(),
    };
    event.stages[entry.stage] = (event.stages[entry.stage] ?? 0) + 1;
    const stageTimes = event.stageTimes[entry.stage] ?? [];
    stageTimes.push(Number(entry.at));
    event.stageTimes[entry.stage] = stageTimes;
    if (Number.isSafeInteger(entry.revision)) event.revisions.add(entry.revision);
    byEvent.set(entry.eventId, event);
  }
  let duplicateReducerApplies = 0;
  let missingReducerApplies = 0;
  let revisionConflicts = 0;
  const localOptimisticMs = [];
  const remoteRenderMs = [];
  for (const event of byEvent.values()) {
    const applied = event.stages["ordered-applied"] ?? 0;
    if (applied === 0) missingReducerApplies += 1;
    if (applied > 2) duplicateReducerApplies += applied - 2;
    if (event.revisions.size > 1) revisionConflicts += 1;
    const createdAt = Math.min(...(event.stageTimes["action-created"] ?? []));
    const paintedAt = (event.stageTimes.painted ?? [])
      .filter((at) => Number.isFinite(createdAt) && at >= createdAt)
      .sort((left, right) => left - right);
    if (paintedAt.length > 0) {
      localOptimisticMs.push(paintedAt[0] - createdAt);
      remoteRenderMs.push(paintedAt.at(-1) - createdAt);
    }
  }
  return {
    duplicateReducerApplies,
    events: byEvent.size,
    missingReducerApplies,
    localOptimisticP95Ms: percentile(localOptimisticMs, 0.95) ?? 0,
    remoteRenderP95Ms: percentile(remoteRenderMs, 0.95) ?? 0,
    revisionConflicts,
    stageCounts,
  };
}

async function startCollaborationLoad(page, tokenResponse) {
  await page.evaluate(({ response }) => {
    const base = response.websocketUrl.startsWith("ws")
      ? new URL(response.websocketUrl)
      : new URL(response.websocketUrl, window.location.origin.replace(/^http/, "ws"));
    base.searchParams.set("room", response.yjsDocumentId);
    base.searchParams.set("token", response.token);
    const socket = new WebSocket(base.toString());
    socket.binaryType = "arraybuffer";
    const writeVarUint = (value, output) => {
      let remaining = value;
      while (remaining > 127) {
        output.push((remaining & 127) | 128);
        remaining >>>= 7;
      }
      output.push(remaining);
    };
    const payload = new TextEncoder().encode(JSON.stringify({
      kind: "game-sync-load-test",
      payload: { id: crypto.randomUUID(), padding: "x".repeat(16 * 1024) },
    }));
    const frame = [];
    writeVarUint(2, frame);
    writeVarUint(payload.byteLength, frame);
    frame.push(...payload);
    const encoded = new Uint8Array(frame);
    window.__PLAY_SAY_LOAD_SOCKET__ = socket;
    window.__PLAY_SAY_LOAD_TIMER__ = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 256 * 1024) {
        socket.send(encoded);
      }
    }, 50);
  }, { response: tokenResponse });
  await page.waitForFunction(() => window.__PLAY_SAY_LOAD_SOCKET__?.readyState === WebSocket.OPEN, null, {
    timeout: timeoutMs,
  });
}

async function stopCollaborationLoad(page) {
  await page.evaluate(() => {
    window.clearInterval(window.__PLAY_SAY_LOAD_TIMER__);
    window.__PLAY_SAY_LOAD_SOCKET__?.close();
    delete window.__PLAY_SAY_LOAD_TIMER__;
    delete window.__PLAY_SAY_LOAD_SOCKET__;
  });
}

async function openClassroom(page, lessonId, teacher) {
  await page.goto(`${webBaseUrl}/lessons/${lessonId}/classroom?gameSyncTrace=1`, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  const noAudio = page.locator("[data-testid='classroom-prejoin-join-without-audio']");
  const checked = page.locator("[data-testid='classroom-prejoin-join']");
  await checked.waitFor({ timeout: timeoutMs });
  await page.waitForFunction(() => {
    const checkedJoin = document.querySelector("[data-testid='classroom-prejoin-join']");
    const fallbackJoin = document.querySelector("[data-testid='classroom-prejoin-join-without-audio']");
    return (checkedJoin instanceof HTMLButtonElement && !checkedJoin.disabled)
      || (fallbackJoin instanceof HTMLButtonElement && !fallbackJoin.disabled);
  }, null, { timeout: timeoutMs });
  if (await noAudio.isVisible() && await noAudio.isEnabled()) await noAudio.click();
  else await checked.click();
  if (teacher) {
    const reveal = page.locator("button").filter({ hasText: /Показать задание|Show task|Aufgabe anzeigen|Afficher la tâche/i });
    await reveal.waitFor({ timeout: timeoutMs });
    await reveal.click();
  }
  await page.locator("[data-testid='lesson-material-surface']").waitFor({ timeout: timeoutMs });
}

async function measureDirection(sourceFrame, targetFrame, count) {
  const latenciesMs = [];
  let missedActions = 0;
  let position = 0;
  for (let index = 0; index < count; index += 1) {
    if (position === 10) {
      await resetGame(sourceFrame, targetFrame);
      position = 0;
    }
    const startedAt = performance.now();
    await sourceFrame.locator("#move").click();
    position += 1;
    if (!await waitForFrameText(targetFrame, "#position", String(position), actionTimeoutMs, false)) {
      missedActions += 1;
      await resetGame(sourceFrame, targetFrame);
      position = 0;
      continue;
    }
    latenciesMs.push(Number((performance.now() - startedAt).toFixed(2)));
  }
  return latencySummary(latenciesMs, missedActions);
}

async function measureKeyboardDirection(sourceFrame, targetFrame, count) {
  const latenciesMs = [];
  let missedActions = 0;
  let position = Number((await targetFrame.locator("#position").textContent())?.trim() ?? 0);
  for (let index = 0; index < count; index += 1) {
    if (position === 10) {
      await resetGame(sourceFrame, targetFrame);
      position = 0;
    }
    const startedAt = performance.now();
    await sourceFrame.locator("body").press("ArrowRight");
    position += 1;
    if (!await waitForFrameText(targetFrame, "#position", String(position), actionTimeoutMs, false)) {
      missedActions += 1;
      await resetGame(sourceFrame, targetFrame);
      position = 0;
      continue;
    }
    latenciesMs.push(Number((performance.now() - startedAt).toFixed(2)));
  }
  return latencySummary(latenciesMs, missedActions);
}

async function measureRangeDirection(sourceFrame, targetFrame, count) {
  const latenciesMs = [];
  let missedActions = 0;
  for (let index = 0; index < count; index += 1) {
    const value = String(((index + 1) % 5) + 1);
    const startedAt = performance.now();
    await sourceFrame.locator("#speed").evaluate((slider, nextValue) => {
      slider.value = nextValue;
      slider.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }, value);
    if (!await waitForFrameText(targetFrame, "#speed-value", value, actionTimeoutMs, false)) {
      missedActions += 1;
      continue;
    }
    latenciesMs.push(Number((performance.now() - startedAt).toFixed(2)));
  }
  return latencySummary(latenciesMs, missedActions);
}

function latencySummary(latenciesMs, missedActions = 0) {
  return {
    latenciesMs,
    attemptedActions: latenciesMs.length + missedActions,
    missedActions,
    p50Ms: percentile(latenciesMs, 0.5),
    p95Ms: percentile(latenciesMs, 0.95),
    p99Ms: percentile(latenciesMs, 0.99),
  };
}

async function resetGame(sourceFrame, targetFrame) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sourceFrame.locator("#reset").click();
    if (await waitForFrameText(targetFrame, "#position", "0", actionTimeoutMs, false)) return;
  }
  throw new Error("Game state could not be reset after a missed action");
}

async function waitForFrameText(frame, selector, expected, timeout, throwOnTimeout = true) {
  const started = Date.now();
  const locator = frame.locator(selector);
  while (Date.now() - started < timeout) {
    if ((await locator.textContent())?.trim() === expected) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (throwOnTimeout) throw new Error(`Timed out waiting for ${selector}=${expected}`);
  return false;
}

async function requestAndWaitForAdaptation(token, materialId, assetId) {
  let job = await apiRequest(
    token,
    "POST",
    `/materials/${materialId}/assets/${assetId}/game-adaptations`,
    202,
    { blockId },
  );
  const terminal = new Set(["READY_FOR_REVIEW", "FAILED"]);
  const started = Date.now();
  while (!terminal.has(job.status) && Date.now() - started < 8 * 60_000) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    job = await apiRequest(
      token,
      "GET",
      `/materials/${materialId}/assets/${assetId}/game-adaptations/${job.id}`,
      200,
    );
  }
  return job;
}

async function assetContent(token, materialId, assetId) {
  const response = await fetch(`${apiBaseUrl}/materials/${materialId}/assets/${assetId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Asset content failed with HTTP ${response.status}`);
  return response.text();
}

async function compareStandaloneAppearance(nextBrowser, originalHtml, candidateHtml) {
  const page = await nextBrowser.newPage({ viewport: { width: 960, height: 640 } });
  const result = {};
  for (const [label, html] of [["standalone-original", originalHtml], ["standalone-adapted", candidateHtml]]) {
    await page.setContent(html, { waitUntil: "load" });
    const screenshotPath = path.join(outputDir, `${label}.png`);
    const screenshot = await page.screenshot({ path: screenshotPath });
    result[label] = {
      screenshotPath,
      screenshotSha256: createHash("sha256").update(screenshot).digest("hex"),
      bodyFingerprint: await page.locator("body").evaluate((body) => ({
        text: body.innerText.replace(/\s+/g, " ").trim(),
        childTags: [...body.children]
          .filter((element) => !["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName))
          .map((element) => `${element.tagName}#${element.id}.${element.className}`),
      })),
    };
  }
  await page.close();
  result.standaloneDomEquivalent =
    JSON.stringify(result["standalone-original"].bodyFingerprint)
    === JSON.stringify(result["standalone-adapted"].bodyFingerprint);
  result.standaloneScreenshotByteEqual =
    result["standalone-original"].screenshotSha256 === result["standalone-adapted"].screenshotSha256;
  return result;
}

async function deleteLesson(token, lessonId) {
  await apiRequest(token, "DELETE", `/schedule/lessons/${lessonId}`, 204);
  const index = createdLessonIds.indexOf(lessonId);
  if (index >= 0) createdLessonIds.splice(index, 1);
}

async function apiRequest(token, method, pathname, expectedStatus, body) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
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
    throw new Error(`${method} ${pathname} expected ${expectedStatus}, got ${response.status}: ${text.slice(0, 300)}`);
  }
  return text && expectedStatus !== 204 ? JSON.parse(text) : null;
}

function percentile(values, quantile) {
  if (values.length === 0) return undefined;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)];
}

function ratio(candidate, baseline) {
  return Number((candidate / Math.max(1, baseline)).toFixed(3));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function racingGameHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>English Racing</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#fff7ed;color:#111;font-family:Arial,sans-serif}
    #game{width:760px;max-width:100%;margin:24px auto;padding:24px;background:#fff;border:3px solid #ff5c00;border-radius:20px;box-shadow:0 12px 30px rgba(17,17,17,.12)}
    h1{margin:0 0 8px;font-size:32px}
    p{margin:0 0 20px;color:#62666f}
    #track{position:relative;height:180px;overflow:hidden;border-radius:14px;background:repeating-linear-gradient(90deg,#e8f8ef 0 60px,#d9f2e4 60px 120px);border:2px solid #b8dfc8}
    #lane{position:absolute;left:20px;right:20px;top:88px;border-top:4px dashed #fff}
    #car{position:absolute;left:18px;top:52px;width:76px;height:48px;border-radius:12px 18px 8px 8px;background:#ff5c00;transform:translateX(0);transition:transform .12s ease-out}
    #car:before,#car:after{content:"";position:absolute;bottom:-10px;width:20px;height:20px;border-radius:50%;background:#111}
    #car:before{left:10px}#car:after{right:10px}
    #controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:18px}
    button{border:0;border-radius:10px;padding:12px 20px;font-size:17px;font-weight:700;cursor:pointer}
    #move{background:#ff5c00;color:#fff}#reset{background:#fff0e6;color:#b23c00;border:2px solid #ffb184}
    #speed-wrap{display:flex;align-items:center;gap:8px}#speed{accent-color:#ff5c00}
    #score{margin-left:auto;font-weight:700}.value{color:#df4100}
  </style>
</head>
<body>
  <main id="game">
    <h1>English Racing</h1>
    <p>Move the car one step for every correct answer.</p>
    <div id="track"><div id="lane"></div><div id="car" aria-label="Orange racing car"></div></div>
    <div id="controls">
      <button id="move" type="button">Correct answer</button>
      <button id="reset" type="button">Restart</button>
      <label id="speed-wrap">Speed <input id="speed" type="range" min="1" max="5" step="1" value="1"><output id="speed-value">1</output></label>
      <output id="score">Position: <span class="value" id="position">0</span></output>
    </div>
  </main>
  <script>
    let position = 0;
    const positionOutput = document.querySelector("#position");
    const car = document.querySelector("#car");
    const speed = document.querySelector("#speed");
    const speedOutput = document.querySelector("#speed-value");
    function render() {
      positionOutput.textContent = String(position);
      car.style.transform = "translateX(" + (position * 42) + "px)";
      speedOutput.textContent = speed.value;
    }
    function move() {
      position = Math.min(12, position + 1);
      render();
    }
    function reset() {
      position = 0;
      render();
    }
    document.querySelector("#move").addEventListener("click", move);
    document.querySelector("#reset").addEventListener("click", reset);
    speed.addEventListener("input", render);
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") move();
      if (event.key.toLowerCase() === "r") reset();
    });
    render();
  </script>
</body>
</html>`;
}

function sdkRacingGameHtml() {
  const manifest = {
    buildHash: "deterministic-racing-v1",
    capabilities: ["actions", "score", "completion"],
    gameId: "playsay-deterministic-racing",
    protocol: "playsay-game-sync/v1",
    reducerVersion: "1",
    stateVersion: "1",
  };
  const sdkPath = new URL("../../frontend/game-sync-sdk/dist/game-sync.iife.js", import.meta.url);
  const sdk = readFileSync(sdkPath, "utf8").replaceAll("</script", "<\\/script");
  const source = racingGameHtml();
  const runtime = `<script data-playsay-game-sync-sdk>${sdk}</script>
  <script>
    const manifest = ${JSON.stringify(manifest)};
    const positionOutput = document.querySelector("#position");
    const car = document.querySelector("#car");
    const speed = document.querySelector("#speed");
    const speedOutput = document.querySelector("#speed-value");
    const controller = PlaySayGameSync.defineGame({
      manifest,
      initialState: { position: 0, speed: "1" },
      reduce(state, action) {
        if (action.type === "MOVE") return { ...state, position: Math.min(12, state.position + 1) };
        if (action.type === "RESET") return { ...state, position: 0 };
        if (action.type === "SET_SPEED") return { ...state, speed: String(action.payload.value) };
        return state;
      },
      onState(state) {
        positionOutput.textContent = String(state.position);
        car.style.transform = "translateX(" + (state.position * 42) + "px)";
        speed.value = state.speed;
        speedOutput.textContent = state.speed;
      }
    });
    document.querySelector("#move").addEventListener("click", () => controller.dispatch("MOVE", {}));
    document.querySelector("#reset").addEventListener("click", () => controller.dispatch("RESET", {}));
    speed.addEventListener("input", () => controller.dispatch("SET_SPEED", { value: speed.value }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") controller.dispatch("MOVE", {});
      if (event.key.toLowerCase() === "r") controller.dispatch("RESET", {});
    });
    controller.ready();
  </script>`;
  return source
    .replace(
      "<head>",
      `<head><script type="application/playsay-game+json">${JSON.stringify(manifest)}</script>`,
    )
    .replace(/  <script>\n    let position = 0;[\s\S]*?  <\/script>/, runtime);
}
