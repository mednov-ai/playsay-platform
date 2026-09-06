#!/usr/bin/env node
// Synthetic API regression; never deletes a real identity.
import { createRequire } from "node:module";
import path from "node:path";
const requireTools = createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR ?? "/Users/evgeniymednov/.codex/tools/playwright", "package.json"));
const { chromium } = requireTools("playwright");
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const locale of ["ru", "en", "de", "fr"]) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, locale });
      await context.addInitScript((language) => {
        localStorage.setItem("playsay.language", language);
        sessionStorage.setItem("playsay.auth.tokens", JSON.stringify({ accessToken: "synthetic-admin", expiresAt: Date.now() + 3600000 }));
        window.confirm = () => { throw new Error("Native confirmation unavailable"); };
      }, locale);
      const page = await context.newPage();
      let deletes = 0;
      page.on("dialog", () => { throw new Error("Unexpected native dialog"); });
      await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        let body = [];
        let status = 200;
        const profile = { subject: "admin", username: "admin", name: "Synthetic Admin", displayName: "Synthetic Admin", roles: ["ADMIN", "TEACHER"], locale, updatedAt: new Date().toISOString() };
        if (pathname === "/api/me" || pathname === "/api/users/me/profile") body = profile;
        else if (pathname.startsWith("/api/admin/user-management/users") && route.request().method() === "DELETE") {
          deletes++;
          status = 409;
          body = { errorCode: "USER_DELETE_IN_PROGRESS_LESSON", message: "RAW_MUST_NOT_RENDER" };
        } else if (pathname === "/api/admin/user-management/users") {
          body = Array.from({ length: 30 }, (_, i) => ({ id: `id-${i}`, subject: `synthetic-${i}`, username: `synthetic-${i}`, displayName: `Synthetic Learner ${i + 1}`, roles: ["STUDENT"], status: "ACTIVE", activeDelegates: [], primaryTeacher: null, lessonTranslationAllowed: false }));
        }
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto(process.env.USER_DELETION_UI_BASE_URL ?? "http://127.0.0.1:4192", { waitUntil: "domcontentloaded" });
      await page.getByTestId("workspace-switcher-trigger").click();
      await page.locator('[data-tab-id="users"]').click();
      const card = page.getByRole("heading", { name: "Synthetic Learner 30", exact: true }).locator("xpath=ancestor::article");
      const trigger = card.getByRole("button").last();
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      if (deletes !== 0) throw new Error("DELETE occurred before confirmation");
      if (!await dialog.getByRole("button").first().evaluate((el) => el === document.activeElement)) throw new Error("Unsafe initial focus");
      await page.keyboard.press("Escape");
      if (!await trigger.evaluate((el) => el === document.activeElement)) throw new Error("Focus not restored");
      await trigger.click();
      await dialog.getByRole("button").last().click();
      const toast = page.getByRole("alert");
      await toast.waitFor();
      if (deletes !== 1) throw new Error("Duplicate DELETE");
      const box = await toast.boundingBox();
      if (!box || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) throw new Error("Toast outside viewport");
      const text = await page.locator("body").innerText();
      if (text.includes("RAW_MUST_NOT_RENDER") || text.includes("userManagement.deletion.")) throw new Error("Unsafe or untranslated text");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 1) throw new Error(`Horizontal overflow: ${overflow}`);
      checks.push(`${locale}-${viewport.width}: long-list, confirm, cancel, focus, synthetic-409, toast`);
      if (process.env.USER_DELETION_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.USER_DELETION_SCREENSHOTS, `${locale}-${viewport.width}.png`) });
      await context.close();
    }
  }
  process.stdout.write(JSON.stringify({ synthetic: true, checks }, null, 2) + "\n");
} finally { await browser.close(); }
