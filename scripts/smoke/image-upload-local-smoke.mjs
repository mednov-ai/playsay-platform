// Synthetic local image-selection smoke using the external Playwright install.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scriptDir, "../..");
const web = path.join(repo, "frontend/web-app");
const requireProject = createRequire(path.join(repo, "frontend/package.json"));
const requireTools = createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR ?? path.join(os.homedir(), ".codex/tools/playwright"), "package.json"));
const { chromium } = requireTools("playwright");
const fixture = fs.mkdtempSync(path.join(web, ".image-upload-smoke-"));
fs.cpSync(path.join(scriptDir, "fixtures/image-upload"), fixture, { recursive: true });
const { createServer } = await import(pathToFileURL(requireProject.resolve("vite")).href);
process.chdir(web);
const vite = await createServer({ root: web, configFile: path.join(web, "vite.config.ts"), server: { host: "127.0.0.1", port: 0, hmr: false }, optimizeDeps: { entries: [path.join(fixture, "index.html")] }, logLevel: "error" });
const output = process.env.IMAGE_UPLOAD_SMOKE_OUTPUT ?? fs.mkdtempSync(path.join(os.tmpdir(), "honey-image-upload-"));
fs.mkdirSync(output, { recursive: true });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const atLimit = Buffer.alloc(20 * 1024 * 1024);
png.copy(atLimit);
const oversized = Buffer.alloc(atLimit.length + 1);
png.copy(oversized);
const messages = { ru: "Размер изображения — не более 20 МиБ.", en: "Image must be no larger than 20 MiB.", de: "Das Bild darf höchstens 20 MiB groß sein.", fr: "L'image ne doit pas dépasser 20 Mio." };

try {
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/${path.basename(fixture)}/index.html`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [layout, viewport] of [["desktop", { width: 1365, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
      for (const locale of ["ru", "en", "de", "fr"]) {
        const page = await browser.newPage({ viewport, hasTouch: layout === "mobile" });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${url}?locale=${locale}`);
        const worksheet = page.getByTestId("worksheet-import-files");
        await worksheet.setInputFiles([
          { name: "at-limit.png", mimeType: "image/png", buffer: atLimit },
          { name: "too-large.png", mimeType: "image/png", buffer: oversized },
        ]);
        await page.getByText(/at-limit\.png/).waitFor();
        assert.equal(await page.getByText(/too-large\.png/).count(), 0);
        assert.equal(await page.getByRole("alert").count(), 1);
        const draft = page.locator('input[accept="image/jpeg,image/png,image/webp"]');
        await draft.setInputFiles({ name: "too-large.png", mimeType: "image/png", buffer: oversized });
        await page.getByText(messages[locale], { exact: true }).waitFor();
        await draft.setInputFiles({ name: "draft-at-limit.png", mimeType: "image/png", buffer: atLimit });
        await page.getByText("draft-at-limit.png", { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(output, `${layout}-${locale}.png`), fullPage: true });
        console.log(`${layout}/${locale}: image boundary and layout passed`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await vite.close();
  fs.rmSync(fixture, { recursive: true, force: true });
}
