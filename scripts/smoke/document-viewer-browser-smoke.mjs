import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const webRoot = resolve(root, "frontend/web-app");
const packageDir = process.env.PLAYWRIGHT_PACKAGE_DIR ?? "/Users/evgeniymednov/.codex/tools/playwright";
const require = createRequire(`${packageDir}/package.json`);
const { chromium, webkit } = require("playwright");
const port = Number(process.env.DOCUMENT_VIEWER_SMOKE_PORT ?? 4187);
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDir = resolve(root, "tmp/document-viewer-browser-smoke");

const generated = spawnSync("python3", ["scripts/generate-document-viewer-fixtures.py"], { cwd: webRoot, encoding: "utf8" });
if (generated.status !== 0) throw new Error(generated.stderr || "fixture generation failed");
await mkdir(evidenceDir, { recursive: true });

const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: webRoot,
  detached: true,
  env: { ...process.env, VITE_DOCUMENT_MATERIALS_ENABLED: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (value) => { serverOutput += value; });
server.stderr.on("data", (value) => { serverOutput += value; });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/viewer-harness.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`viewer harness did not start\n${serverOutput}`);
}

async function verifyBrowser(name, browserType, viewport) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  const externalRequests = [];
  let retryFixtureRequests = 0;
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/viewer-fixtures/retry.pdf") {
      retryFixtureRequests += 1;
      if (retryFixtureRequests === 1) await route.fulfill({ status: 503, body: "temporary fixture failure" });
      else await route.fulfill({ path: resolve(webRoot, "public/viewer-fixtures/fixture.pdf"), contentType: "application/pdf" });
      return;
    }
    if (url.hostname !== "127.0.0.1") {
      externalRequests.push(url.href);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto(`${baseUrl}/viewer-harness.html`, { waitUntil: "networkidle" });
  try {
    await page.locator('[data-testid="pdf-fixture"] canvas').first().waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-testid="pptx-fixture"] .playsay-pptx-static-viewer').waitFor({ state: "visible", timeout: 60_000 });
  } catch (error) {
    await page.screenshot({ fullPage: true, path: resolve(evidenceDir, `${name}-failure.png`) });
    throw new Error(`${name}: viewer did not become ready; browser errors: ${errors.join(" | ") || "none"}; body: ${(await page.locator("body").innerText()).slice(0, 2000)}`, { cause: error });
  }
  const pdf = page.locator('[data-testid="pdf-fixture"]');
  await pdf.getByRole("button", { name: /two-page|spread/i }).click();
  if (await pdf.locator("canvas").count() !== 1) throw new Error(`${name}: separate cover did not remain a single page`);
  await pdf.locator('.playsay-document-cover-option input').uncheck();
  await pdf.locator("canvas").nth(1).waitFor({ state: "visible", timeout: 30_000 });
  await pdf.locator('.playsay-document-cover-option input').check();
  await pdf.locator("canvas").nth(1).waitFor({ state: "detached", timeout: 30_000 });
  await pdf.locator(".playsay-document-navigation button").last().click();
  await pdf.locator("canvas").nth(1).waitFor({ state: "visible", timeout: 30_000 });
  if (await pdf.locator("canvas").count() !== 2) throw new Error(`${name}: PDF spread did not render two pages`);
  await pdf.getByRole("button", { name: /zoom in/i }).click();
  if (!(await pdf.locator(".playsay-document-zoom").textContent())?.includes("110%")) throw new Error(`${name}: local zoom did not change`);
  await pdf.getByRole("button", { name: /expand/i }).click();
  if (await pdf.locator('.playsay-document-viewer[data-expanded="true"]').count() !== 1) throw new Error(`${name}: expand failed`);
  await pdf.getByRole("button", { name: /side panel|restore/i }).click();

  const pptx = page.locator('[data-testid="pptx-fixture"]');
  if (await pptx.locator('.playsay-document-stage[data-playsay-annotation-anchor="true"]').count() !== 1) throw new Error(`${name}: PPTX host annotation anchor is missing`);
  if (await pptx.locator('.playsay-pptx-static-viewer [role="toolbar"]:visible').count()) throw new Error(`${name}: PPTX library toolbar is visible`);
  const slideRegion = pptx.locator('[role="region"]').last();
  const slideBox = await slideRegion.boundingBox();
  if (!slideBox || slideBox.width < 1 || slideBox.height < 1) {
    await page.screenshot({ fullPage: true, path: resolve(evidenceDir, `${name}-pptx-layout-failure.png`) });
    await writeFile(resolve(evidenceDir, `${name}-pptx-layout-failure.json`), JSON.stringify(await pptx.locator('.playsay-pptx-static-viewer').evaluate((root) => {
      const shell = root.firstElementChild?.firstElementChild;
      return Array.from(shell?.children ?? []).map((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, className: node.className, display: style.display, height: rect.height, width: rect.width, text: node.textContent?.slice(0, 120) };
      });
    }), null, 2));
    throw new Error(`${name}: PPTX slide has no layout box`);
  }
  if (!/Slide One/i.test(await slideRegion.innerText())) throw new Error(`${name}: PPTX did not start on slide one`);
  await pptx.locator(".playsay-document-navigation button").last().click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pptx-fixture"] [role="region"]')).some((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && /Slide Two/i.test(node.textContent ?? "");
  }));
  if (!/2\s+of\s+2/i.test(await pptx.locator(".playsay-document-navigation").innerText())) throw new Error(`${name}: PPTX navigation state diverged from the rendered slide`);
  const forbidden = ["Share", "Export", "Record", "Animations", "Transitions", "Copilot", "AI"];
  for (const label of forbidden) {
    if (await pptx.getByText(label, { exact: true }).count()) throw new Error(`${name}: forbidden PPTX control visible: ${label}`);
  }
  if (viewport.width <= 640) {
    const stageBox = await pdf.locator(".playsay-document-stage").boundingBox();
    const toolbarBox = await pdf.locator(".playsay-document-toolbar").boundingBox();
    const canvases = await pdf.locator("canvas").all();
    const canvasBoxes = await Promise.all(canvases.map((canvas) => canvas.boundingBox()));
    if (!stageBox || stageBox.x < -2 || stageBox.x + stageBox.width > viewport.width + 2) throw new Error(`${name}: PDF stage overflows viewport (${JSON.stringify(stageBox)})`);
    if (!toolbarBox || toolbarBox.x < -2 || toolbarBox.x + toolbarBox.width > viewport.width + 2) throw new Error(`${name}: PDF toolbar overflows viewport (${JSON.stringify(toolbarBox)})`);
    if (!canvasBoxes[0] || !canvasBoxes[1] || canvasBoxes[1].y <= canvasBoxes[0].y + canvasBoxes[0].height) throw new Error(`${name}: PDF spread is not vertically stacked`);
  }
  const retryPdf = page.locator('[data-testid="pdf-retry-fixture"]');
  const retryButton = retryPdf.getByRole("button", { name: /try again|retry/i });
  await retryButton.waitFor({ state: "visible", timeout: 30_000 });
  await retryButton.click();
  await retryPdf.locator("canvas").waitFor({ state: "visible", timeout: 30_000 });
  if (retryFixtureRequests < 2) throw new Error(`${name}: PDF retry did not request the document again`);
  if (externalRequests.length) throw new Error(`${name}: external requests: ${externalRequests.join(", ")}`);
  const unexpectedErrors = errors.filter((message) => !message.includes("status of 503"));
  if (unexpectedErrors.length) throw new Error(`${name}: browser errors: ${unexpectedErrors.join(" | ")}`);
  await page.screenshot({ fullPage: true, path: resolve(evidenceDir, `${name}.png`) });
  await browser.close();
  return { name, viewport, pdfSpreadCanvases: 2, pdfRetryRequests: retryFixtureRequests, pptxSlide: 2, externalRequests: 0, unexpectedConsoleErrors: 0 };
}

try {
  await waitForServer();
  const results = [];
  results.push(await verifyBrowser("chromium-desktop", chromium, { width: 1440, height: 1000 }));
  results.push(await verifyBrowser("webkit-desktop", webkit, { width: 1440, height: 1000 }));
  results.push(await verifyBrowser("webkit-mobile-390x844", webkit, { width: 390, height: 844 }));
  await writeFile(resolve(evidenceDir, "results.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(JSON.stringify(results));
} finally {
  if (server.pid) process.kill(-server.pid, "SIGTERM");
}
