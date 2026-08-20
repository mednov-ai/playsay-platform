const path = require("node:path");
const { createRequire } = require("node:module");
const playwrightPackageDir = process.env.PLAYWRIGHT_PACKAGE_DIR || "/Users/evgeniymednov/.codex/tools/playwright";
const requirePlaywright = process.env.PLAYWRIGHT_MODULE
  ? require
  : createRequire(path.join(playwrightPackageDir, "package.json"));
const { chromium } = requirePlaywright(process.env.PLAYWRIGHT_MODULE || "playwright");

const baseUrl = process.env.HONEY_KEY_VOCABULARY_SMOKE_URL || "http://127.0.0.1:4173";
const sessionId = "11111111-1111-4111-a111-111111111111";
const localeCopy = {
  en: "Vocabulary homework",
  ru: "Тренировка слов на уроке",
  de: "Persönliches Wortschatztraining",
  fr: "Devoir de vocabulaire",
};

function profile() {
  return { calibrated: false, calibrationSessions: 0, calibrationTarget: 3, masteryCpm: 0, leagueProgress: 0, currentStreak: 0, bestStreak: 0, streakFreezes: 0, trend: [], layoutMastery: {} };
}

function progress() {
  return { sessions: 0, bestSpeedCpm: 0, avgSpeedCpm: 0, avgAccuracy: 0, weakFingers: [], recent: [], gamification: profile() };
}

async function installApi(page, delivery, mode) {
  let resultCalls = 0;
  let acknowledgement = 0;
  await page.route("**/api/me", (route) => route.fulfill({ json: { subject: "student-1", username: "student", roles: ["STUDENT"] } }));
  await page.route("**/api/training/claim-anonymous", (route) => route.fulfill({ json: { claimedResults: 0, progress: progress() } }));
  await page.route("**/api/training/progress", (route) => route.fulfill({ json: progress() }));
  await page.route("**/api/chord-sets**", (route) => route.fulfill({ json: [{ id: 1, layout: "EN", title: "Anchor", difficulty: 1, tier: "beginner", chords: ["as"] }] }));
  await page.route("**/api/vocabulary/practice-sessions/*/key-set", (route) => route.fulfill({ json: {
    sessionId,
    title: "Unit 4 · Weather",
    entries: [],
    items: [{ itemId: "21111111-1111-4111-a111-111111111111", entryId: "31111111-1111-4111-a111-111111111111", sourceText: "rain" }],
    mode,
    layout: "EN",
    materializerVersion: "vocabulary-key-v1",
    materializerSeed: 42,
    ngramSettings: { minLength: 2, maxLength: 5, targetLimit: 8, maxRepetitions: 1 },
    targets: mode === "WHOLE_WORDS"
      ? [{ targetId: "41111111-1111-4111-a111-111111111111", position: 0, type: "WHOLE_WORD", text: "rain", sourceEntryIds: ["31111111-1111-4111-a111-111111111111"], sourceItemIds: ["21111111-1111-4111-a111-111111111111"], offsets: [] }]
      : mode === "CHARACTER_NGRAMS"
        ? [{ targetId: "51111111-1111-4111-a111-111111111111", position: 0, type: "CHARACTER_NGRAM", text: "rai", sourceEntryIds: ["31111111-1111-4111-a111-111111111111"], sourceItemIds: ["21111111-1111-4111-a111-111111111111"], offsets: [] }]
        : [
            { targetId: "41111111-1111-4111-a111-111111111111", position: 0, type: "WHOLE_WORD", text: "rain", sourceEntryIds: ["31111111-1111-4111-a111-111111111111"], sourceItemIds: ["21111111-1111-4111-a111-111111111111"], offsets: [] },
            { targetId: "51111111-1111-4111-a111-111111111111", position: 1, type: "CHARACTER_NGRAM", text: "rai", sourceEntryIds: ["31111111-1111-4111-a111-111111111111"], sourceItemIds: ["21111111-1111-4111-a111-111111111111"], offsets: [] },
          ],
    completionContext: { delivery, completionPolicy: delivery === "HOMEWORK" ? "MEANINGFUL_ACTIVITY" : "COMPLETE_SESSION", completionPolicyVersion: "v1", assignmentId: delivery === "HOMEWORK" ? "61111111-1111-4111-a111-111111111111" : undefined, lessonId: delivery === "LIVE" ? "71111111-1111-4111-a111-111111111111" : undefined, lastAcknowledgedPosition: acknowledgement },
    returnContext: { target: delivery === "HOMEWORK" ? "HONEY_SCHOOL_HOMEWORK" : delivery === "LIVE" ? "HONEY_SCHOOL_LESSON" : "HONEY_SCHOOL_VOCABULARY", path: "/" },
  } }));
  await page.route("**/api/vocabulary/practice-sessions/*/key-acknowledgement", async (route) => {
    acknowledgement = Math.max(acknowledgement, route.request().postDataJSON().position);
    await route.fulfill({ json: { sessionId, lastAcknowledgedPosition: acknowledgement, revision: acknowledgement } });
  });
  await page.route("**/api/training/results", async (route) => {
    resultCalls += 1;
    const body = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: {
      trainingResult: { id: 1, ...body, layout: "EN", masteryDelta: 0, createdAt: new Date().toISOString() },
      progress: progress(), gamification: profile(), events: [],
      techniqueAdvice: { primaryAdvice: "", drillSuggestion: "", tone: "STEADY", source: "RULES" },
    } });
  });
  return { resultCalls: () => resultCalls, acknowledgement: () => acknowledgement };
}

async function typeAll(page) {
  for (let index = 0; index < 80; index += 1) {
    if (await page.locator(".practice-overlay--finished").isVisible().catch(() => false)) return;
    const current = page.locator(".typing-char.is-current").first();
    if (!(await current.count())) break;
    const classes = await current.getAttribute("class") || "";
    if (classes.includes("is-space")) await page.keyboard.press("Space");
    else {
      const char = (await current.textContent() || "").trim().toUpperCase();
      await page.keyboard.press(`Key${char}`);
    }
  }
  await page.locator(".practice-overlay--finished").waitFor({ state: "visible" });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const cases = [
    ["en", "HOMEWORK", "MIXED"], ["ru", "LIVE", "WHOLE_WORDS"],
    ["de", "SELF", "CHARACTER_NGRAMS"], ["fr", "HOMEWORK", "MIXED"],
  ];
  for (const [locale, delivery, mode] of cases) {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(({ locale }) => {
        localStorage.setItem("playsay.language", locale);
        sessionStorage.setItem("playsay.keyboard.auth.tokens", JSON.stringify({ accessToken: "smoke-token", expiresAt: Date.now() + 3_600_000 }));
      }, { locale });
      const page = await context.newPage();
      const api = await installApi(page, delivery, mode);
      await page.emulateMedia({ reducedMotion: viewport.width < 500 ? "reduce" : "no-preference", colorScheme: locale === "de" ? "dark" : "light" });
      await page.goto(`${baseUrl}/?vocabularySessionId=${sessionId}&returnTo=${encodeURIComponent("https://online.honey.school/")}`, { waitUntil: "domcontentloaded" });
      await page.locator(".intro-play-button").click();
      await page.locator(".vocabulary-context").waitFor({ state: "visible" });
      await page.getByText(localeCopy[locale], { exact: false }).waitFor({ state: "visible" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (overflow) throw new Error(`${locale} ${viewport.width}px vocabulary view overflows`);
      if (locale === "en" && viewport.width === 1440) {
        await page.keyboard.press("Space");
        await typeAll(page);
        await page.getByText("does not by itself mean", { exact: false }).first().waitFor({ state: "visible" });
        await page.waitForTimeout(800);
        if (api.acknowledgement() !== 2 || api.resultCalls() !== 1) throw new Error(`Vocabulary acknowledgement/result callback was not exactly once: ack=${api.acknowledgement()} result=${api.resultCalls()}`);
        const returnHref = await page.locator('.practice-overlay--finished a[href="https://online.honey.school/"]').getAttribute("href");
        if (!returnHref) throw new Error("Authorized return control is missing");
      }
      await context.close();
    }
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
