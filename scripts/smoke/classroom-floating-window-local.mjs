import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Real floating-window component and classroom CSS with synthetic lesson/video
// children. This is not an actual lesson, LiveKit or physical iPad test.
const scripts = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scripts, "../..");
const web = path.join(repo, "frontend/web-app");
const require = createRequire(path.join(repo, "frontend/package.json"));
const external = createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR ?? path.join(os.homedir(), ".codex/tools/playwright"), "package.json"));
const { chromium, devices, webkit } = external("playwright");
const fixture = fs.mkdtempSync(path.join(web, ".floating-window-smoke-"));
fs.cpSync(path.join(scripts, "fixtures/classroom-floating-window"), fixture, { recursive: true });
process.chdir(web);
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const vite = await createServer({ root: web, configFile: path.join(web, "vite.config.ts"), cacheDir: path.join(fixture, ".vite-cache"), server: { host: "127.0.0.1", port: 0, hmr: false }, optimizeDeps: { entries: [path.join(fixture, "index.html")] }, logLevel: "error" });
let browser;

function approximately(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 3, `${message}: expected ${expected}, got ${actual}`);
}

async function bounds(page) {
  const area = await page.locator("#workspace").boundingBox();
  const floating = await page.locator(".classroom-floating-window").boundingBox();
  assert.ok(area && floating, "workspace and floating window must be visible");
  return { area, floating };
}

async function checkCorner(page, corner) {
  // ResizeObserver and visualViewport updates can arrive after viewport change.
  await page.waitForFunction((selectedCorner) => {
    const area = document.querySelector("#workspace")?.getBoundingClientRect();
    const floating = document.querySelector(".classroom-floating-window")?.getBoundingClientRect();
    if (!area || !floating) return false;
    const horizontal = selectedCorner.endsWith("left") ? floating.left - area.left : area.right - floating.right;
    const vertical = selectedCorner.startsWith("top") ? floating.top - area.top : area.bottom - floating.bottom;
    return Math.abs(horizontal - 12) <= 3 && Math.abs(vertical - 12) <= 3;
  }, corner, { timeout: 3000 });
  const { area, floating } = await bounds(page);
  approximately(corner.endsWith("left") ? floating.x - area.x : area.x + area.width - floating.x - floating.width, 12, `${corner} horizontal inset`);
  approximately(corner.startsWith("top") ? floating.y - area.y : area.y + area.height - floating.y - floating.height, 12, `${corner} vertical inset`);
  assert.ok(floating.width >= 144 && floating.width <= 360, "video size is clamped");
  const grip = page.locator(".classroom-floating-window__resize");
  const handle = await grip.boundingBox();
  assert.equal(await grip.getAttribute("data-edge"), corner.startsWith("top") ? "bottom" : "top", `${corner}: grip must face the workspace centre`);
  assert.ok(handle && handle.width >= 44 && handle.height >= 44 && handle.x >= area.x && handle.y >= area.y && handle.x + handle.width <= area.x + area.width && handle.y + handle.height <= area.y + area.height, "resize grip and its touch target remain reachable");
  approximately(corner.startsWith("top") ? floating.y + floating.height - handle.y - handle.height : handle.y - floating.y, 1, `${corner}: grip is physically on inward-facing edge`);
  approximately(handle.x + handle.width / 2, floating.x + floating.width / 2, `${corner}: grip is centred`);
  assert.equal(await grip.locator(".classroom-floating-window__grip > span").count(), 3, "grip exposes three visible stripes");
  assert.equal(await grip.locator(".classroom-floating-window__grip").isVisible(), true, "grip remains visible without hover");
}

async function dragTo(page, corner) {
  const { area, floating } = await bounds(page);
  const x = floating.x + Math.min(28, floating.width / 3);
  const y = floating.y + floating.height / 2;
  const targetX = corner.endsWith("left") ? area.x + 25 : area.x + area.width - 25;
  const targetY = corner.startsWith("top") ? area.y + 25 : area.y + area.height - 25;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 8 });
  await page.mouse.up();
  await checkCorner(page, corner);
}

async function mouseResize(page, corner) {
  const grip = page.locator(".classroom-floating-window__resize");
  const original = (await bounds(page)).floating;
  const handle = await grip.boundingBox();
  assert.ok(handle);
  const grow = corner.startsWith("top") ? 20 : -20;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + grow, { steps: 5 });
  await page.mouse.up();
  const grown = (await bounds(page)).floating;
  assert.ok(grown.width > original.width + 20, `${corner}: vertical grip drag should enlarge: ${original.width} → ${grown.width}`);
  await checkCorner(page, corner);
  const newHandle = await grip.boundingBox();
  assert.ok(newHandle);
  await page.mouse.move(newHandle.x + newHandle.width / 2, newHandle.y + newHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(newHandle.x + newHandle.width / 2, newHandle.y + newHandle.height / 2 - grow, { steps: 5 });
  await page.mouse.up();
  const restored = (await bounds(page)).floating;
  approximately(restored.width, original.width, `${corner}: reverse vertical drag shrinks`);
  await checkCorner(page, corner);
  assert.equal(await page.locator(".classroom-floating-window__menu").count(), 0, "resize gesture must not open the options menu");
}

async function cancelResize(page, corner) {
  const grip = page.locator(".classroom-floating-window__resize");
  const initial = (await bounds(page)).floating;
  const handle = await grip.boundingBox();
  assert.ok(handle);
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const grow = corner.startsWith("top") ? 20 : -20;
  // Untrusted PointerEvent cannot acquire browser pointer capture; stub only
  // that method and deliver move/cancel directly to the same real grip.
  await grip.evaluate(el => { window.__smokeCancelCapture = el.setPointerCapture; el.setPointerCapture = () => {}; });
  const pointer = (type, y, buttons) => grip.dispatchEvent(type, { pointerId: 62, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true, clientX: start.x, clientY: y, button: 0, buttons });
  await pointer("pointerdown", start.y, 1);
  await pointer("pointermove", start.y + grow, 1);
  assert.ok((await bounds(page)).floating.width > initial.width + 20, `${corner}: resize must visibly occur before cancellation`);
  await pointer("pointercancel", start.y + grow, 0);
  approximately((await bounds(page)).floating.width, initial.width, `${corner}: cancelling resize restores size`);
  await grip.evaluate(el => { el.setPointerCapture = window.__smokeCancelCapture; delete window.__smokeCancelCapture; });
  await checkCorner(page, corner);
}

// Playwright's WebKit driver exposes native tap only. WebKit drag here sends
// untrusted pointer events directly to the component with a test-only pointer
// capture stub. Chromium CDP sends trusted touch input through the browser.
async function touchGesture(page, cdp, source, target, start, end) {
  if (cdp) {
    const point = ({ x, y }) => [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(start) });
    for (let i = 1; i <= 8; i += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point({ x: start.x + (end.x - start.x) * i / 8, y: start.y + (end.y - start.y) * i / 8 }) });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.evaluate(({ sourceSelector, targetSelector }) => {
      const sourceElement = document.querySelector(sourceSelector);
      const targetElement = document.querySelector(targetSelector);
      if (!(sourceElement instanceof HTMLElement) || !(targetElement instanceof HTMLElement)) throw new Error("Missing touch gesture target");
      // Synthetic events cannot acquire native pointer capture; route subsequent
      // events to the same target instead, retaining the production handlers.
      window.__smokePointerCaptureOriginal = sourceElement.setPointerCapture;
      sourceElement.setPointerCapture = () => {};
    }, { sourceSelector: source, targetSelector: target });
    const dispatch = async (selector, type, point) => page.locator(selector).dispatchEvent(type, {
      pointerId: 57, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true,
      clientX: point.x, clientY: point.y, button: 0, buttons: type === "pointerup" ? 0 : 1,
    });
    await dispatch(target, "pointerdown", start);
    for (let i = 1; i <= 8; i += 1) await dispatch(source, "pointermove", { x: start.x + (end.x - start.x) * i / 8, y: start.y + (end.y - start.y) * i / 8 });
    await dispatch(source, "pointerup", end);
    await page.evaluate((sourceSelector) => {
      const sourceElement = document.querySelector(sourceSelector);
      if (sourceElement instanceof HTMLElement && window.__smokePointerCaptureOriginal) sourceElement.setPointerCapture = window.__smokePointerCaptureOriginal;
      delete window.__smokePointerCaptureOriginal;
    }, source);
  }
}

async function ipadTouchDrag(page, cdp, corner) {
  const { area, floating } = await bounds(page);
  const start = { x: floating.x + floating.width / 2, y: floating.y + floating.height / 2 };
  const end = { x: corner.endsWith("left") ? area.x + 20 : area.x + area.width - 20, y: corner.startsWith("top") ? area.y + 20 : area.y + area.height - 20 };
  await touchGesture(page, cdp, ".classroom-floating-window", ".playsay-tablet-teacher-video", start, end);
  await checkCorner(page, corner);
}

try {
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}/${path.basename(fixture)}/index.html`;
  for (const [name, engine, executablePath] of [["chromium", chromium, process.env.CHROMIUM_EXECUTABLE], ["webkit", webkit, process.env.WEBKIT_EXECUTABLE]].filter(([name]) => !process.env.SMOKE_ENGINE || process.env.SMOKE_ENGINE === name)) {
    browser = await engine.launch({ headless: true, executablePath });
    for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 600, height: 900 }, { width: 1365, height: 900 }]) {
      const page = await browser.newPage({ viewport, hasTouch: true });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(base);
      await page.locator(".classroom-floating-window").waitFor({ state: "visible" });
      assert.equal(await page.locator(".classroom-floating-window__menu-toggle").count(), 0, "separate three-dots button must be absent");
      assert.equal(await page.locator("#lesson-controls").evaluate(el => getComputedStyle(el).display), "flex", "fixture must load the app's LiveKit control-bar stylesheet");
      const workspaceBox = await page.locator(".playsay-workbench").boundingBox();
      const controlBox = await page.locator("#lesson-controls").boundingBox();
      assert.ok(workspaceBox && controlBox && workspaceBox.y + workspaceBox.height <= controlBox.y + 1, "lesson controls must occupy their own grid row, not overlay the material");
      await checkCorner(page, "bottom-right");
      for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
        await dragTo(page, corner);
        await mouseResize(page, corner);
        await page.locator("#lesson-controls button").first().click({ timeout: 2500 });
        await page.locator("#workbench-control").click({ timeout: 2500 });
      }
      await page.locator("#material-interaction").click({ timeout: 2500 });
      await cancelResize(page, "bottom-right");

      const tapHandle = await page.locator(".classroom-floating-window__resize").boundingBox();
      assert.ok(tapHandle);
      await page.touchscreen.tap(tapHandle.x + tapHandle.width / 2, tapHandle.y + tapHandle.height / 2);
      const grip = page.locator(".classroom-floating-window__resize");
      const menu = page.locator(".classroom-floating-window__menu");
      await menu.waitFor({ state: "visible", timeout: 2500 });
      assert.equal(await grip.getAttribute("aria-expanded"), "true");
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      assert.equal(await grip.evaluate(el => document.activeElement === el), true, "Escape after tap returns focus to the grip");
      await grip.click();
      await menu.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      assert.equal(await grip.evaluate(el => document.activeElement === el), true, "Escape after click returns focus to the grip");
      await grip.click();
      await menu.waitFor({ state: "visible" });

      // Keyboard accessible non-drag actions: open menu, activate first corner.
      await menu.locator("button").first().focus();
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      assert.equal(await grip.evaluate(el => document.activeElement === el), true, "Escape returns focus to the grip");
      assert.equal(await grip.getAttribute("aria-expanded"), "false");
      await page.keyboard.press("Enter");
      await menu.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      await page.keyboard.press("Space");
      await menu.waitFor({ state: "visible" });
      await menu.locator("button").first().focus();
      await page.keyboard.press("Enter");
      await checkCorner(page, "top-left");

      // At the minimum video size the menu must remain fully inside the area.
      await grip.click();
      for (let i = 0; i < 5; i += 1) await menu.locator("button").nth(4).click();
      assert.ok((await bounds(page)).floating.width <= 161, "video reaches minimum size");
      for (let i = 0; i < 4; i += 1) {
        if (!await menu.isVisible()) await grip.click();
        await menu.locator("button").nth(i).click();
        await grip.click();
        const area = (await bounds(page)).area;
        assert.equal(await menu.locator("button").count(), 6);
        for (const button of await menu.locator("button").all()) {
          const rect = await button.boundingBox();
          assert.ok(rect && rect.width >= 44 && rect.height >= 44, `menu button touch size ${JSON.stringify(rect)}`);
          assert.ok(rect.x >= area.x - 1 && rect.y >= area.y - 1 && rect.x + rect.width <= area.x + area.width + 1 && rect.y + rect.height <= area.y + area.height + 1, `menu button outside allowed area ${JSON.stringify(rect)}`);
        }
        await page.keyboard.press("Escape");
        await page.locator(".playsay-tablet-other-participants summary").click();
        const participantButton = page.locator(".playsay-tablet-other-select").first();
        await participantButton.scrollIntoViewIfNeeded();
        const participantRect = await participantButton.boundingBox();
        const contentRect = await page.locator(".classroom-floating-window__content").boundingBox();
        const listGeometry = await page.locator(".playsay-tablet-other-list").evaluate(element => ({ rect: element.getBoundingClientRect().toJSON(), style: ["position", "top", "bottom", "height", "overflow", "display"].map(key => [key, getComputedStyle(element).getPropertyValue(key)]), html: element.closest(".classroom-floating-window__content")?.outerHTML.slice(0, 350) }));
        assert.ok(participantRect && contentRect && participantRect.y >= contentRect.y && participantRect.y + participantRect.height <= contentRect.y + contentRect.height, `group selection is clipped: ${JSON.stringify({ participantRect, contentRect, listGeometry })}`);
        await participantButton.click({ timeout: 2500 });
        assert.equal(await page.locator(".playsay-tablet-teacher-video").textContent(), "Student A");
        await page.locator(".playsay-tablet-other-participants summary").click();
        const lastParticipant = page.locator(".playsay-tablet-other-select").last();
        await lastParticipant.scrollIntoViewIfNeeded();
        const lastRect = await lastParticipant.boundingBox();
        assert.ok(lastRect);
        await page.touchscreen.tap(lastRect.x + lastRect.width / 2, lastRect.y + lastRect.height / 2);
        assert.equal(await page.locator(".playsay-tablet-teacher-video").textContent(), "Student D", "last group participant must remain selectable after scroll");
      }
      await grip.click();
      await menu.locator("button").first().click();

      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await checkCorner(page, "top-left");
      await page.locator("#lesson-controls button").first().click();
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await grip.click();
      await menu.waitFor({ state: "visible" });
      await menu.locator("button").last().click();
      await page.keyboard.press("Escape");
      await page.locator("#lesson-controls button").first().click();
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
      assert.deepEqual(errors, []);
      if (process.env.OUTPUT_DIR) {
        fs.mkdirSync(process.env.OUTPUT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.OUTPUT_DIR, `${name}-${viewport.width}x${viewport.height}.png`) });
      }
      console.log(`PASS ${name} ${viewport.width}x${viewport.height}: four corners, resize, keyboard, rotation`);
      await page.close();
    }
    for (const deviceName of ["iPad (gen 11)", "iPad Pro 11"]) {
      const { defaultBrowserType: _defaultBrowserType, ...device } = devices[deviceName];
      const context = await browser.newContext(device);
      const page = await context.newPage();
      const cdp = name === "chromium" ? await context.newCDPSession(page) : null;
      await page.goto(base);
      await page.locator(".classroom-floating-window").waitFor({ state: "visible" });
      assert.equal(await page.locator("#lesson-controls").evaluate(el => getComputedStyle(el).display), "flex", "iPad fixture must load the app's LiveKit control-bar stylesheet");
      const platform = await page.evaluate(() => ({ ua: navigator.userAgent, touch: navigator.maxTouchPoints, coarse: matchMedia("(pointer: coarse)").matches, dpr: devicePixelRatio }));
      // Desktop-hosted Playwright WebKit currently reports maxTouchPoints=0,
      // even with hasTouch: true. Test the descriptor and actual dispatched tap
      // rather than treating that host-dependent property as a device fact.
      assert.ok(platform.ua.includes("iPad") && platform.coarse && platform.dpr === device.deviceScaleFactor, `device emulation inactive: ${JSON.stringify(platform)}`);
      await page.evaluate(() => {
        window.__touchPointerLog = [];
        document.addEventListener("pointerdown", e => window.__touchPointerLog.push({ type: e.type, pointerType: e.pointerType, trusted: e.isTrusted }), true);
        document.addEventListener("pointermove", e => window.__touchPointerLog.push({ type: e.type, pointerType: e.pointerType, trusted: e.isTrusted }), true);
        document.addEventListener("pointerup", e => window.__touchPointerLog.push({ type: e.type, pointerType: e.pointerType, trusted: e.isTrusted }), true);
      });
      for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
        await ipadTouchDrag(page, cdp, corner);
        const beforeResize = (await bounds(page)).floating;
        const resize = await page.locator(".classroom-floating-window__resize").boundingBox();
        assert.ok(resize);
        const start = { x: resize.x + resize.width / 2, y: resize.y + resize.height / 2 };
        const delta = corner.startsWith("top") ? 20 : -20;
        await touchGesture(page, cdp, ".classroom-floating-window__resize", ".classroom-floating-window__resize", start, { x: start.x, y: start.y + delta });
        const afterResize = (await bounds(page)).floating;
        assert.ok(afterResize.width > beforeResize.width + 20, `${name} ${deviceName} ${corner}: touch resize did not grow inward`);
        await checkCorner(page, corner);
        const grownGrip = await page.locator(".classroom-floating-window__resize").boundingBox();
        assert.ok(grownGrip);
        const grownStart = { x: grownGrip.x + grownGrip.width / 2, y: grownGrip.y + grownGrip.height / 2 };
        await touchGesture(page, cdp, ".classroom-floating-window__resize", ".classroom-floating-window__resize", grownStart, { x: grownStart.x, y: grownStart.y - delta });
        approximately((await bounds(page)).floating.width, beforeResize.width, `${name} ${deviceName} ${corner}: touch resize shrink`);
        await checkCorner(page, corner);
        assert.equal(await page.locator(".classroom-floating-window__menu").count(), 0);
      }
      const log = await page.evaluate(() => window.__touchPointerLog);
      assert.ok(log.some(e => e.type === "pointermove" && e.pointerType === "touch" && e.trusted === Boolean(cdp)), `${name}: incorrect touch event source: ${JSON.stringify(log.slice(0, 8))}`);
      const handle = await page.locator(".classroom-floating-window__resize").boundingBox();
      assert.ok(handle);
      await page.touchscreen.tap(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.locator(".classroom-floating-window__menu").waitFor({ state: "visible" });
      const tapLog = await page.evaluate(() => window.__touchPointerLog);
      assert.ok(tapLog.some(e => e.type === "pointerdown" && e.pointerType === "touch" && e.trusted), `${name}: native tap did not dispatch a trusted touch pointer`);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".classroom-floating-window__resize").evaluate(el => document.activeElement === el), true, "Escape returns focus to the grip");
      await page.setViewportSize({ width: device.viewport.height, height: device.viewport.width });
      await checkCorner(page, "bottom-right");
      await page.setViewportSize({ width: 600, height: 900 });
      await checkCorner(page, "bottom-right");
      await page.locator("#workbench-control").click();
      await page.locator("#lesson-controls button").first().click();
      console.log(`PASS ${name} ${deviceName}: iPad descriptor; ${cdp ? "trusted CDP touch drag/resize" : "synthetic pointer drag/resize and native touch tap"}; rotation and Split View`);
      await context.close();
    }
    await browser.close();
    browser = undefined;
  }
} finally {
  await browser?.close();
  await vite.close();
  fs.rmSync(fixture, { recursive: true, force: true });
}
