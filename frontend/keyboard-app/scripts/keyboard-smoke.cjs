const playwrightModule = process.env.PLAYWRIGHT_MODULE || "playwright";
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(playwrightModule);

const baseUrl = process.env.PLAY_SAY_KEYBOARD_SMOKE_URL || "https://key.play-and-say.ru";
const screenshotDir = process.env.PLAY_SAY_KEYBOARD_SCREENSHOT_DIR;

const jsonHeaders = { "Content-Type": "application/json" };

function responseJson(value) {
  return {
    status: 200,
    headers: jsonHeaders,
    body: JSON.stringify(value),
  };
}

function submitResponseJson(value) {
  return {
    status: 201,
    headers: jsonHeaders,
    body: JSON.stringify(value),
  };
}

function gamificationProfile(sessionCount) {
  const calibrated = sessionCount >= 3;
  const masteryCpm = calibrated ? 236 : sessionCount === 2 ? 188 : 142;
  const leagueLevel = calibrated ? 2 : sessionCount === 2 ? 1 : undefined;
  return {
    calibrated,
    calibrationSessions: Math.min(sessionCount, 3),
    calibrationTarget: 3,
    masteryCpm,
    baselineMasteryCpm: calibrated ? 142 : undefined,
    leagueLevel,
    leagueProgress: calibrated ? 64 : sessionCount === 2 ? 28 : 0,
    currentStreak: sessionCount,
    bestStreak: sessionCount,
    streakFreezes: 0,
    trend: [142, 188, 236].slice(0, Math.max(1, sessionCount)),
    achievements: sessionCount >= 3 ? ["METRONOME"] : [],
    layoutMastery: {
      EN: {
        layout: "EN",
        calibrated,
        calibrationSessions: Math.min(sessionCount, 3),
        calibrationTarget: 3,
        masteryCpm,
        baselineMasteryCpm: calibrated ? 142 : undefined,
        leagueLevel,
        leagueProgress: calibrated ? 64 : sessionCount === 2 ? 28 : 0,
        trend: [142, 188, 236].slice(0, Math.max(1, sessionCount)),
      },
    },
  };
}

function submitTrainingResult(body, sessionCount) {
  const trainingResult = {
    id: sessionCount,
    clientResultId: body.clientResultId,
    chordSetId: body.chordSetId,
    layout: "EN",
    lessonKind: body.lessonKind || "STANDARD",
    speedCpm: body.speedCpm,
    averageCpm: body.averageCpm,
    cadence: body.cadence,
    masteryCpm: gamificationProfile(sessionCount).masteryCpm,
    masteryDelta: sessionCount === 1 ? 0 : 48,
    accuracy: body.accuracy,
    errors: body.errors,
    characterCount: body.characterCount,
    correctCount: body.correctCount,
    durationMs: body.durationMs,
    perFinger: body.perFinger || {},
    perChar: body.perChar || {},
    perChord: body.perChord || {},
    focusProblemKeys: body.focusProblemKeys || [],
    clientTimezone: body.clientTimezone || "UTC",
    localTrainingDate: body.localTrainingDate || "2026-06-14",
    createdAt: new Date(Date.UTC(2026, 5, 14, 12, sessionCount, 0)).toISOString(),
  };
  const gamification = gamificationProfile(sessionCount);
  return {
    trainingResult,
    progress: {
      sessions: sessionCount,
      bestSpeedCpm: Math.max(180, Math.round(body.speedCpm || 180)),
      avgSpeedCpm: Math.round(body.averageCpm || 180),
      avgAccuracy: 0.99,
      weakFingers: [],
      recent: [trainingResult],
      gamification,
    },
    gamification,
    events: sessionCount === 3
      ? [
          {
            id: 101,
            type: "ACHIEVEMENT_UNLOCKED",
            payload: { code: "METRONOME" },
            createdAt: "2026-06-14T12:03:00Z",
          },
          {
            id: 102,
            type: "CALIBRATION_COMPLETE",
            payload: {},
            createdAt: "2026-06-14T12:03:01Z",
          },
          {
            id: 103,
            type: "LEAGUE_PROGRESS",
            payload: { leagueLevel: "2" },
            createdAt: "2026-06-14T12:03:02Z",
          },
        ]
      : [],
    techniqueAdvice: {
      primaryAdvice: "Keep the same rhythm and relax the wrists.",
      drillSuggestion: "Repeat the current chord group once.",
      tone: "STEADY",
      source: "RULES",
    },
  };
}

async function installMockApi(page) {
  let submitCount = 0;
  await page.route("**/api/anonymous/profile/resolve", async (route) => {
    await route.fulfill(responseJson({ id: 1, deviceId: "smoke-device", displayName: "Smoke Guest", sessions: 0 }));
  });
  await page.route("**/api/anonymous/profile", async (route) => {
    await route.fulfill(responseJson({ id: 1, deviceId: "smoke-device", displayName: "Smoke Guest", sessions: submitCount }));
  });
  await page.route("**/api/anonymous/training/results", async (route) => {
    const body = route.request().postDataJSON();
    submitCount += 1;
    await route.fulfill(submitResponseJson(submitTrainingResult(body, submitCount)));
  });
}

async function pressCurrentCharacter(page) {
  const current = page.locator(".typing-char.is-current").first();
  await current.waitFor({ state: "visible", timeout: 10_000 });
  const className = (await current.getAttribute("class")) || "";
  if (className.includes("is-space")) {
    await page.keyboard.press("Space");
    return;
  }

  const text = ((await current.textContent()) || "").trim().toLowerCase();
  if (!/^[a-z]$/.test(text)) {
    throw new Error(`Unexpected smoke character: ${JSON.stringify(text)}`);
  }
  await page.keyboard.press(`Key${text.toUpperCase()}`);
}

async function skipCountdown(page) {
  await page.locator(".countdown-number").waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("Space");
  await page.locator(".typing-char.is-current").first().waitFor({ state: "visible", timeout: 10_000 });
}

async function completeLesson(page) {
  for (let index = 0; index < 500; index += 1) {
    if (await page.locator(".practice-overlay--finished").isVisible()) {
      return;
    }
    if ((await page.locator(".typing-char.is-current").count()) === 0) {
      await page.locator(".practice-overlay--finished").waitFor({ state: "visible", timeout: 10_000 });
      return;
    }
    await pressCurrentCharacter(page);
  }
  throw new Error("Typing smoke did not finish within 500 key presses.");
}

async function startNextLesson(page) {
  await page.locator(".practice-overlay--finished .play-button").click();
  await skipCountdown(page);
}

async function expectVisibleText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function dismissCelebration(page) {
  await page.locator(".achievement-celebration .icon-button").click();
}

async function assertNoDocumentHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (metrics.scrollWidth > metrics.clientWidth + 1) {
    throw new Error(`Document overflows horizontally: ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
  }
}

async function capture(page, name) {
  if (!screenshotDir) {
    return;
  }
  await fs.mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: false });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => {
    window.localStorage.setItem("playsay.language", "en");
    window.localStorage.setItem("playsay.key.guestDisplayName", "Smoke Guest");
    window.localStorage.setItem("playsay.key.anonymousDeviceId", "smoke-device");
  });
  const page = await context.newPage();
  await installMockApi(page);

  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!response || response.status() >= 500) {
    throw new Error(`Keyboard app returned HTTP ${response ? response.status() : "no response"}`);
  }

  await expectVisibleText(page, "Play&Say");
  await capture(page, "01-intro");
  await page.locator(".intro-play-button").click();
  await skipCountdown(page);
  await completeLesson(page);
  await startNextLesson(page);
  await completeLesson(page);
  await startNextLesson(page);
  await completeLesson(page);

  await page.locator(".achievement-celebration__confetti").waitFor({ state: "visible", timeout: 10_000 });
  await expectVisibleText(page, "Metronome unlocked");
  await page.waitForTimeout(450);
  await capture(page, "02-achievement-confetti");
  await dismissCelebration(page);
  await expectVisibleText(page, "Calibration complete");
  await dismissCelebration(page);
  await expectVisibleText(page, "Moved to Rhythm");
  await dismissCelebration(page);

  await page.keyboard.press("Escape");
  await page.locator(".practice-overlay--finished").waitFor({ state: "hidden", timeout: 10_000 });
  await page.locator(".progress-profile-button").click();
  await expectVisibleText(page, "Rhythm");
  await page.locator(".profile-modal .registration-modal__close").click();

  await page.locator(".side-panel .field select").first().selectOption("RU");
  await page.locator(".progress-profile-button").click();
  await expectVisibleText(page, "Finish calibration");
  await capture(page, "03-ru-profile");
  const profileText = await page.locator(".profile-modal").innerText();
  if (profileText.includes("Rhythm") || profileText.includes("236 cpm")) {
    throw new Error("RU profile copied EN mastery or league.");
  }
  await page.locator(".profile-modal .registration-modal__close").click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".virtual-keyboard").waitFor({ state: "visible", timeout: 10_000 });
  await assertNoDocumentHorizontalOverflow(page);
  await capture(page, "04-mobile");

  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
