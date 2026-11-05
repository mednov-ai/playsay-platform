import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scripts, "../..");
const web = path.join(repo, "frontend/web-app");
const require = createRequire(path.join(repo, "frontend/package.json"));
const external = createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR ?? path.join(os.homedir(), ".codex/tools/playwright"), "package.json"));
const { chromium, webkit } = external("playwright");
const fixture = fs.mkdtempSync(path.join(web, ".extension-smoke-"));
fs.cpSync(path.join(scripts, "fixtures/lesson-extension-offer"), fixture, { recursive: true });
process.chdir(web);
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const vite = await createServer({ root: web, configFile: path.join(web, "vite.config.ts"), server: { host: "127.0.0.1", port: 0, hmr: false }, logLevel: "error" });
let browser;
try {
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}/${path.basename(fixture)}/index.html`;
  const engines = [["chromium", chromium, process.env.CHROMIUM_EXECUTABLE], ["webkit", webkit, process.env.WEBKIT_EXECUTABLE]];
  for (const [browserName, engine, executablePath] of engines) {
    browser = await engine.launch({ headless: true, executablePath });
    for (const size of [{ width: 1365, height: 900 }, { width: 375, height: 812 }]) {
      for (const mode of ["admin", "teacher", "student"]) {
        const page = await browser.newPage({ viewport: size });
        await page.goto(`${base}?mode=${mode}`);
        const offer = page.locator(".lesson-extension-offer");
        if (mode === "student") {
          assert.equal(await offer.count(), 0);
        } else {
          await offer.waitFor({ state: "visible" });
          await page.locator("#fullscreen").click();
          await page.waitForFunction(() => document.fullscreenElement !== null);
          assert.equal(await page.evaluate(() => document.fullscreenElement?.contains(document.querySelector(".lesson-extension-offer"))), true);
          assert.equal(await offer.isVisible(), true);
          await offer.getByRole("button").first().click();
          assert.equal(await page.locator("#revision").textContent(), "1");
          assert.equal(await offer.count(), 0);
          assert.equal(await page.locator("#lesson-control").isVisible(), true);
        }
        await page.close();
        console.log(`PASS ${browserName} ${mode} ${size.width}x${size.height}`);
      }
      for (const view of ["expanded", "focus"]) {
        const page = await browser.newPage({ viewport: size });
        await page.goto(`${base}?mode=teacher&${view}`);
        await page.locator(".lesson-extension-offer").waitFor({ state: "visible" });
        const bottomControl = page.locator("#lesson-control");
        const rect = await bottomControl.boundingBox();
        assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= size.height, `${view} lesson control is outside ${size.width}x${size.height}: ${JSON.stringify(rect)}`);
        await bottomControl.click({ timeout: 3000 });
        await page.close();
        console.log(`PASS ${browserName} ${view} lesson controls ${size.width}x${size.height}`);
      }
      const page = await browser.newPage({ viewport: size });
      await page.goto(`${base}?mode=teacher&before`);
      assert.equal(await page.locator(".lesson-extension-offer").count(), 0);
      await page.evaluate(() => window.advanceLessonTime(Date.parse("2026-11-05T07:53:00Z")));
      const offer = page.locator(".lesson-extension-offer");
      await offer.waitFor({ state: "visible" });
      await offer.getByRole("button").first().focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#revision").textContent(), "1");
      await page.evaluate(() => window.advanceLessonTime(Date.parse("2026-11-05T08:03:00Z")));
      await offer.waitFor({ state: "visible" });
      await offer.getByRole("button").last().focus();
      await page.keyboard.press("Enter");
      assert.equal(await offer.count(), 0);
      await page.close();
      console.log(`PASS ${browserName} repeated offer ${size.width}x${size.height}`);
      const translations = {
        ru: "Не удалось получить данные о продлении урока.",
        en: "Lesson extension details are unavailable.",
        de: "Angaben zur Verlängerung sind nicht verfügbar.",
        fr: "Les informations de prolongation sont indisponibles.",
      };
      for (const [locale, expected] of Object.entries(translations)) {
        const localized = await browser.newPage({ viewport: size });
        await localized.goto(`${base}?mode=teacher&missing&locale=${locale}`);
        await localized.waitForFunction(text => document.querySelector('[role="status"]')?.textContent === text, expected);
        assert.equal(await localized.locator(".lesson-extension-offer button").count(), 0);
        await localized.evaluate(() => window.recoverLessonPolicy());
        await localized.locator(".lesson-extension-offer button").first().waitFor({ state: "visible" });
        await localized.close();
        console.log(`PASS ${browserName} policy recovery ${locale} ${size.width}x${size.height}`);
      }
    }
    await browser.close();
    browser = undefined;
  }
} finally {
  await browser?.close();
  await vite.close();
  fs.rmSync(fixture, { recursive: true, force: true });
}
