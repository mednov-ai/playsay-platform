#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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
const sampleCount = Number(process.env.PLAY_SAY_GAME_COMPARE_SAMPLES ?? 40);
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

  const candidateHtml = await assetContent(
    teacher.tokens.accessToken,
    material.id,
    adaptation.adaptedAssetId,
  );
  summary.appearance = await compareStandaloneAppearance(
    browser,
    racingGameHtml(),
    candidateHtml,
  );

  await apiRequest(
    teacher.tokens.accessToken,
    "POST",
    `/materials/${material.id}/assets/${originalAsset.id}/game-adaptations/${adaptation.id}/apply`,
    200,
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
  await teacherLaunch.waitFor({ timeout: timeoutMs });
  await teacherLaunch.click();
  await Promise.all([
    teacherPage.locator(".playsay-html-game iframe").waitFor({ timeout: timeoutMs }),
    studentPage.locator(".playsay-html-game iframe").waitFor({ timeout: timeoutMs }),
  ]);

  const teacherFrame = teacherPage.frameLocator(".playsay-html-game iframe");
  const studentFrame = studentPage.frameLocator(".playsay-html-game iframe");
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
    const selectors = ["#game", "#track", "#car", "#move", "#reset", "#position"];
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
  await teacherPage.locator(".playsay-html-game iframe").screenshot({ path: screenshotPath });
  const screenshot = await teacherPage.locator(".playsay-html-game iframe").screenshot();
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
  await stopCollaborationLoad(studentPage);
  return {
    runtime,
    diagnostics: {
      teacher: await teacherPage.evaluate(() => window.__PLAY_SAY_GAME_SYNC_DIAGNOSTICS__ ?? []),
      student: await studentPage.evaluate(() => window.__PLAY_SAY_GAME_SYNC_DIAGNOSTICS__ ?? []),
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
    studentToTeacher,
    teacherToStudent,
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
  let position = 0;
  for (let index = 0; index < count; index += 1) {
    if (position === 10) {
      await sourceFrame.locator("#reset").click();
      await waitForFrameText(targetFrame, "#position", "0", timeoutMs);
      position = 0;
    }
    const startedAt = performance.now();
    await sourceFrame.locator("#move").click();
    position += 1;
    await waitForFrameText(targetFrame, "#position", String(position), timeoutMs);
    latenciesMs.push(Number((performance.now() - startedAt).toFixed(2)));
  }
  return {
    latenciesMs,
    p50Ms: percentile(latenciesMs, 0.5),
    p95Ms: percentile(latenciesMs, 0.95),
    p99Ms: percentile(latenciesMs, 0.99),
  };
}

async function waitForFrameText(frame, selector, expected, timeout) {
  const started = Date.now();
  const locator = frame.locator(selector);
  while (Date.now() - started < timeout) {
    if ((await locator.textContent())?.trim() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${selector}=${expected}`);
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
        childTags: [...body.children].map((element) => `${element.tagName}#${element.id}.${element.className}`),
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
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)];
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
    #controls{display:flex;gap:12px;align-items:center;margin-top:18px}
    button{border:0;border-radius:10px;padding:12px 20px;font-size:17px;font-weight:700;cursor:pointer}
    #move{background:#ff5c00;color:#fff}#reset{background:#fff0e6;color:#b23c00;border:2px solid #ffb184}
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
      <output id="score">Position: <span class="value" id="position">0</span></output>
    </div>
  </main>
  <script>
    let position = 0;
    const positionOutput = document.querySelector("#position");
    const car = document.querySelector("#car");
    function render() {
      positionOutput.textContent = String(position);
      car.style.transform = "translateX(" + (position * 42) + "px)";
    }
    document.querySelector("#move").addEventListener("click", () => {
      position = Math.min(12, position + 1);
      render();
    });
    document.querySelector("#reset").addEventListener("click", () => {
      position = 0;
      render();
    });
    render();
  </script>
</body>
</html>`;
}
