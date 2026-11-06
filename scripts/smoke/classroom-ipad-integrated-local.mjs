import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Real LiveLessonExperience, ClassroomVideoStage, ClassroomControlBar and CSS.
// Network/LiveKit, lesson workspace, observer and participant tracks are mocks.
// A local canvas stream tests browser video playback only, never LiveKit media.
const scripts = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scripts, "../..");
const web = path.join(repo, "frontend/web-app");
const require = createRequire(path.join(repo, "frontend/package.json"));
const external = createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR ?? path.join(os.homedir(), ".codex/tools/playwright"), "package.json"));
const { chromium, webkit, devices } = external("playwright");
const fixture = fs.mkdtempSync(path.join(web, ".ipad-integrated-smoke-"));
fs.cpSync(path.join(scripts, "fixtures/classroom-ipad-integrated"), fixture, { recursive: true });
const mocked = new Map([
  ["@livekit/components-react", "livekit.tsx"],
  ["./LessonWorkspace", "workspace.tsx"],
  ["./ClassroomConnectionStatus", "noop.tsx"],
  ["./ClassroomMediaTransportProbe", "noop.tsx"],
  ["./ClassroomMediaConnectionObserver", "noop.tsx"],
  ["../hooks/useLessonTranslation", "noop.tsx"],
  ["../hooks/useLessonWhiteboard", "develop-hooks.tsx"],
  ["../../games/hooks/useLessonLibraryGame", "develop-hooks.tsx"],
  ["../../vocabulary/hooks/useLiveVocabularyPractice", "develop-hooks.tsx"],
]);
const mockPlugin = { name: "integrated-ipad-fixture-mocks", enforce: "pre", resolveId(id, importer) {
  if (!importer || !importer.includes("/src/features/classroom/")) return null;
  const entry = mocked.get(id);
  return entry ? path.join(fixture, entry) : null;
} };
process.chdir(web);
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const vite = await createServer({ root: web, configFile: path.join(web, "vite.config.ts"), cacheDir: path.join(fixture, ".vite-cache"), plugins: [mockPlugin], server: { host: "127.0.0.1", port: 0, hmr: false }, optimizeDeps: { entries: [path.join(fixture, "index.html")], exclude: ["@livekit/components-react"] }, logLevel: "error" });
let browser;
const approx = (a, b, name) => assert.ok(Math.abs(a - b) <= 3, `${name}: ${a} vs ${b}`);
async function expectCorner(page, corner) {
  const area = await page.locator(".playsay-tablet-video-area").boundingBox();
  const pip = await page.locator(".classroom-floating-window").boundingBox();
  assert.ok(area && pip);
  const tabs = await page.locator(".playsay-whiteboard-tabs").boundingBox();
  const top = Math.max(area.y, tabs ? tabs.y + tabs.height : area.y);
  approx(corner.endsWith("left") ? pip.x - area.x : area.x + area.width - pip.x - pip.width, 12, "horizontal inset");
  approx(corner.startsWith("top") ? pip.y - top : area.y + area.height - pip.y - pip.height, 12, "vertical inset");
}
async function drag(page, corner) {
  const area = await page.locator(".playsay-tablet-video-area").boundingBox();
  const pip = await page.locator(".classroom-floating-window").boundingBox();
  assert.ok(area && pip);
  await page.mouse.move(pip.x + pip.width / 2, pip.y + pip.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.endsWith("left") ? area.x + 20 : area.x + area.width - 20, corner.startsWith("top") ? area.y + 20 : area.y + area.height - 20, { steps: 7 });
  await page.mouse.up();
  await expectCorner(page, corner);
}

async function checkBoard(page) {
  await page.locator("#fixture-board").click();
  await page.locator(".playsay-whiteboard-stage").waitFor({ state: "visible" });
  for (const expanded of [false, true]) {
    if (expanded) {
      await page.locator('.playsay-whiteboard-footer button[aria-pressed]').click();
      await page.locator('.playsay-workbench').evaluate(el => { el.scrollTop = 0; });
    }
    assert.equal(await page.locator(".playsay-whiteboard").getAttribute("data-expanded"), String(expanded));
    const columns = await page.locator(".playsay-classroom-shell").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    assert.equal(columns, 1, "expanded board must retain the one-column tablet grid");
    for (let index = 0; index < 4; index += 1) {
      const grip = page.locator(".classroom-floating-window__resize");
      await grip.click();
      await page.locator(".classroom-floating-window__menu button").nth(index).click();
      const geometry = await page.evaluate(() => {
        const pip = document.querySelector(".classroom-floating-window").getBoundingClientRect();
        const stage = document.querySelector(".playsay-whiteboard-stage").getBoundingClientRect();
        const workbench = document.querySelector(".playsay-workbench").getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.playsay-whiteboard-tabs button, .playsay-whiteboard-controls button, .playsay-whiteboard-tools button, .playsay-whiteboard-footer button')];
        const obstructed = buttons.filter(button => {
          const r = button.getBoundingClientRect();
          if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight || r.top < workbench.top || r.bottom > workbench.bottom) return false;
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit && (hit === document.querySelector('.classroom-floating-window') || hit.closest('.classroom-floating-window'));
        }).length;
        return { pip: { left: pip.left, right: pip.right, top: pip.top, bottom: pip.bottom }, stage: { left: stage.left, right: stage.right, top: stage.top, bottom: stage.bottom }, workbench: { top: workbench.top, bottom: workbench.bottom }, obstructed };
      });
      assert.ok(geometry.pip.left >= geometry.stage.left && geometry.pip.right <= geometry.stage.right && geometry.pip.top >= Math.max(geometry.stage.top, geometry.workbench.top) && geometry.pip.bottom <= Math.min(geometry.stage.bottom, geometry.workbench.bottom), `board ${expanded}, corner ${index}: window must fit the visible board stage: ${JSON.stringify(geometry)}`);
      assert.equal(geometry.obstructed, 0, `board ${expanded}, corner ${index}: board control blocked`);
    }
  }
  await page.locator("#fixture-material").click();
}

// The stage renders the actual ClassroomControlBar; LiveKit tracks and its
// TrackToggle hooks are mocked. The app's LiveKit CSS must still load so this
// measures the same control-bar layout rules as the application entry point.
async function expectAlignedControlBar(page, context) {
  const geometry = await page.locator(".playsay-classroom-controls").evaluate(bar => {
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    };
    const leave = bar.querySelector(".playsay-classroom-leave-control");
    const icon = leave?.querySelector("svg");
    if (!leave || !icon) throw new Error("Missing actual leave button or its SVG");
    const visible = [...bar.querySelectorAll("button.lk-button")].filter(button => {
      const r = button.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(button).visibility !== "hidden";
    });
    return { display: getComputedStyle(bar).display, leave: rect(leave), icon: rect(icon), buttons: visible.map(rect) };
  });
  assert.equal(geometry.display, "flex", `${context}: control bar must load its LiveKit flex layout`);
  assert.ok(geometry.buttons.length >= 4, `${context}: expected visible media and leave controls`);
  approx(geometry.icon.cx, geometry.leave.cx, `${context}: leave icon horizontal centre`);
  approx(geometry.icon.cy, geometry.leave.cy, `${context}: leave icon vertical centre`);
  for (const button of geometry.buttons) approx(button.cy, geometry.leave.cy, `${context}: control button vertical centre`);
}

// The selected participant label used to be covered by the bottom-edge grip
// when the top-docked window was at its minimum size. Test the real stage and
// CSS: synthetic participant/video data, but no stand-in for the label/grip.
async function checkSelectedLabelAtMinimum(page) {
  const menu = page.locator(".classroom-floating-window__menu");
  const grip = page.locator(".classroom-floating-window__resize");
  const label = page.locator(".playsay-tablet-selected-label");
  assert.equal(await page.locator(".classroom-floating-window__menu-toggle").count(), 0, "separate three-dots button must be absent");
  await grip.click();
  await menu.waitFor({ state: "visible" });
  for (let i = 0; i < 6; i += 1) await menu.locator("button").nth(4).click();
  assert.ok((await page.locator(".classroom-floating-window").boundingBox()).width <= 161, "selected participant case must use the minimum PiP size");
  await menu.locator("button").first().focus();
  await page.keyboard.press("Escape");

  for (const [corner, index] of [["top-left", 0], ["top-right", 1], ["bottom-left", 2], ["bottom-right", 3]]) {
    await grip.click();
    await menu.locator("button").nth(index).click();
    await expectCorner(page, corner);
    assert.equal(await grip.getAttribute("data-edge"), corner.startsWith("top") ? "bottom" : "top");
    assert.equal(await label.textContent(), "Substitute");
    assert.equal(await label.isVisible(), true);
    const geometry = await page.evaluate(() => {
      const label = document.querySelector(".playsay-tablet-selected-label");
      const grip = document.querySelector(".classroom-floating-window__resize");
      const summary = document.querySelector(".playsay-tablet-other-participants summary");
      const pip = document.querySelector(".classroom-floating-window");
      if (!label || !grip || !summary || !pip) throw new Error("Missing selected-label test target");
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const hit = el => { const r = el.getBoundingClientRect(); const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return target === el || el.contains(target); };
      return { label: rect(label), grip: rect(grip), summary: rect(summary), pip: rect(pip), labelHit: hit(label), gripHit: hit(grip), summaryHit: hit(summary) };
    });
    const { label: lr, grip: gr, pip } = geometry;
    const overlap = lr.x < gr.right && lr.right > gr.x && lr.y < gr.bottom && lr.bottom > gr.y;
    assert.ok(lr.width > 20 && lr.height > 10 && lr.x >= pip.x && lr.right <= pip.right && lr.y >= pip.y && lr.bottom <= pip.bottom, `${corner}: selected label must remain readable inside the window: ${JSON.stringify(geometry)}`);
    assert.equal(overlap, false, `${corner}: grip hit target overlaps selected label: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.labelHit && geometry.gripHit && geometry.summaryHit, `${corner}: label or control is hidden/unclickable: ${JSON.stringify(geometry)}`);
    await grip.click();
    await menu.waitFor({ state: "visible" });
    await menu.locator("button").first().focus();
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assert.equal(await grip.evaluate(el => document.activeElement === el), true, "Escape returns focus to the grip");
    await page.locator(".playsay-tablet-other-participants summary").click();
    assert.equal(await page.getByRole("button", { name: "Student Two" }).isVisible(), true);
    await page.locator(".playsay-tablet-other-participants summary").click();
    assert.equal(await label.textContent(), "Substitute");
  }
}
try {
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}/${path.basename(fixture)}/index.html`;
  browser = await webkit.launch({ headless: true });
  const configurations = [
    ["iPad (gen 7)", devices["iPad (gen 7)"], false],
    ["iPad (gen 7) landscape", devices["iPad (gen 7) landscape"], false],
    ["iPad Pro 11", devices["iPad Pro 11"], false],
    ["iPadOS desktop UA", { ...devices["iPad (gen 7)"], userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" }, true],
  ];
  for (const [name, descriptor, macTablet] of configurations) {
    const context = await browser.newContext({ ...descriptor });
    if (macTablet) await context.addInitScript(() => { Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" }); Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 }); });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base);
    await page.locator(".classroom-floating-window").waitFor({ state: "visible", timeout: 15000 });
    const info = await page.evaluate(() => ({ ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia("(pointer: coarse)").matches, width: innerWidth, height: innerHeight }));
    assert.equal(info.coarse, true, `${name}: requires coarse pointer`);
    assert.equal(await page.locator(".playsay-classroom-shell").getAttribute("data-viewport-mode"), "tablet");
    assert.equal(await page.locator(".playsay-tablet-teacher-video .lk-participant-tile").getAttribute("data-subject"), "teacher-1");
    assert.equal(await page.locator(".playsay-tablet-local-video .lk-participant-tile").getAttribute("data-subject"), "student-1");
    await expectCorner(page, "bottom-right");
    await expectAlignedControlBar(page, name);
    await checkBoard(page);
    const video = page.locator('.playsay-tablet-teacher-video video');
    await video.waitFor();
    await video.evaluate(el => { window.fixtureOriginalVideo = el; });
    await page.waitForFunction(() => document.querySelector(".playsay-tablet-teacher-video video")?.currentTime > 0, null, { timeout: 4000 }).catch(() => undefined);
    const playback = await video.evaluate(el => ({ supported: Boolean(el.srcObject), time: el.currentTime, state: el.srcObject?.getVideoTracks()[0]?.readyState, ready: el.readyState }));
    await drag(page, "top-left");
    const resize = await page.locator(".classroom-floating-window__resize").boundingBox();
    assert.ok(resize);
    assert.equal(await page.locator(".classroom-floating-window__resize").getAttribute("data-edge"), "bottom");
    const widthBeforeResize = (await page.locator(".classroom-floating-window").boundingBox()).width;
    await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
    await page.mouse.down();
    await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    const widthAfterResize = (await page.locator(".classroom-floating-window").boundingBox()).width;
    assert.ok(widthAfterResize > widthBeforeResize + 20, "pulling the lower stripe down enlarges the top-docked window");
    await expectCorner(page, "top-left");
    assert.equal(await video.evaluate(el => el === window.fixtureOriginalVideo), true, "video node must persist during drag and resize");
    await page.waitForTimeout(300);
    const afterMove = await video.evaluate(el => ({ supported: Boolean(el.srcObject), time: el.currentTime, state: el.srcObject?.getVideoTracks()[0]?.readyState, ready: el.readyState }));
    if (playback.supported) { assert.equal(afterMove.state, "live"); assert.ok(afterMove.time > playback.time, `synthetic video playback did not advance: ${playback.time} → ${afterMove.time}`); }
    await page.locator(".playsay-tablet-other-participants summary").click();
    await page.getByRole("button", { name: "Substitute" }).click();
    assert.equal(await page.locator(".playsay-tablet-teacher-video .lk-participant-tile").getAttribute("data-subject"), "teacher-2");
    await checkSelectedLabelAtMinimum(page);
    await page.evaluate(() => window.integratedFixture.teacherPresent(false));
    assert.equal(await page.locator(".playsay-tablet-teacher-video .lk-participant-tile").getAttribute("data-subject"), "teacher-2");
    await page.locator(".playsay-tablet-other-participants summary").click();
    await page.locator(".playsay-tablet-other-reset").click();
    assert.equal(await page.locator(".playsay-tablet-teacher-video .playsay-video-presence").count(), 1);
    await page.evaluate(() => window.integratedFixture.teacherPresent(true));
    assert.equal(await page.locator(".playsay-tablet-teacher-video .lk-participant-tile").getAttribute("data-subject"), "teacher-1");
    await page.locator("#material-content").click();
    await page.evaluate(() => window.integratedFixture.share(true));
    await page.waitForFunction(() => document.querySelector(".playsay-classroom-shell")?.getAttribute("data-screen-share-active") === "true");
    assert.equal(await page.locator(".classroom-floating-window").count(), 0);
    await page.evaluate(() => window.integratedFixture.share(false));
    await page.locator(".classroom-floating-window").waitFor({ state: "visible" });
    if (playback.supported) assert.equal(await page.evaluate(() => window.integratedFixture.streamState().video), "live", "synthetic track must remain live after presentation transitions");
    await page.evaluate(() => window.integratedFixture.setMaterial(false));
    await page.waitForFunction(() => document.querySelector(".playsay-classroom-shell")?.getAttribute("data-video-only") === "true");
    assert.equal(await page.locator(".classroom-floating-window").count(), 0);
    await page.evaluate(() => window.integratedFixture.setMaterial(true));
    await page.locator(".classroom-floating-window").waitFor({ state: "visible" });
    const beforeExternal = await page.evaluate(() => ({ ...window.integratedFixture.counts }));
    await page.locator("#material-toolbar").click();
    await page.waitForFunction(() => document.querySelector(".playsay-classroom-shell")?.getAttribute("data-presentation-mode") === "external-activity-focus");
    assert.equal(await page.locator(".classroom-floating-window").count(), 0);
    await page.locator("#external-stop").click();
    await page.locator(".classroom-floating-window").waitFor({ state: "visible" });
    const afterExternal = await page.evaluate(() => ({ ...window.integratedFixture.counts }));
    assert.deepEqual(afterExternal, beforeExternal, "room and audio renderer must remain mounted across external activity transitions");
    await page.evaluate(() => window.integratedFixture.setTeacher(true));
    await page.waitForFunction(() => document.querySelector(".playsay-classroom-shell")?.getAttribute("data-tablet-floating") === "false");
    assert.equal(await page.locator(".classroom-floating-window").count(), 0);
    await page.evaluate(() => window.integratedFixture.setTeacher(false));
    await page.locator(".classroom-floating-window").waitFor({ state: "visible" });
    const provider = await page.evaluate(() => window.integratedFixture.counts);
    assert.equal(provider.roomMounts, 1); assert.equal(provider.roomUnmounts, 0);
    assert.equal(provider.audioMounts, 1); assert.equal(provider.audioUnmounts, 0);
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await page.locator(".classroom-floating-window").waitFor({ state: "visible" });
    const header = await page.locator(".playsay-video-header").boundingBox();
    const control = await page.locator(".playsay-classroom-controls").boundingBox();
    const workspace = await page.locator(".playsay-workbench").boundingBox();
    assert.ok(header && control && workspace && header.y + header.height <= workspace.y + 2 && workspace.y + workspace.height <= control.y + 2, "header, workspace and controls must be separate rows");
    await expectAlignedControlBar(page, `${name} after rotation`);
    assert.deepEqual(errors, []);
    if (process.env.OUTPUT_DIR) {
      await page.waitForFunction(() => document.querySelector(".playsay-tablet-teacher-video video")?.currentTime > 0, null, { timeout: 4000 });
      fs.mkdirSync(process.env.OUTPUT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.OUTPUT_DIR, `${name.replaceAll(/[^a-z0-9]+/gi, "-")}.png`) });
    }
    console.log(`PASS ${name}: ${JSON.stringify(info)} syntheticPlayback=${JSON.stringify({ before: playback, after: afterMove })}`);
    await context.close();
  }
  await browser.close(); browser = undefined;
  browser = await chromium.launch({ headless: true });
  const chromiumIpadContext = await browser.newContext({ ...devices["iPad (gen 7)"] });
  const chromiumIpad = await chromiumIpadContext.newPage();
  await chromiumIpad.goto(base);
  await chromiumIpad.locator(".classroom-floating-window").waitFor({ state: "visible", timeout: 15000 });
  await expectAlignedControlBar(chromiumIpad, "Chromium iPad");
  await chromiumIpad.locator(".playsay-tablet-other-participants summary").click();
  await chromiumIpad.getByRole("button", { name: "Substitute" }).click();
  await checkSelectedLabelAtMinimum(chromiumIpad);
  console.log("PASS Chromium iPad (gen 7): selected participant label and controls in four corners at minimum size");
  await chromiumIpadContext.close();
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto(base);
  await page.locator(".playsay-classroom-shell").waitFor({ state: "visible" });
  assert.equal(await page.locator(".playsay-classroom-shell").getAttribute("data-viewport-mode"), "desktop");
  assert.equal(await page.locator(".classroom-floating-window").count(), 0);
  await expectAlignedControlBar(page, "desktop Chromium");
  const desktopBeforeExternal = await page.evaluate(() => ({ ...window.integratedFixture.counts }));
  await page.locator("#material-toolbar").click();
  await page.waitForFunction(() => document.querySelector(".playsay-classroom-shell")?.getAttribute("data-presentation-mode") === "external-activity-focus");
  await page.locator("#external-stop").click();
  await page.waitForFunction(() => document.querySelector(".playsay-classroom-shell")?.getAttribute("data-presentation-mode") === "default");
  console.log(`AUDIO desktop Chromium: ${JSON.stringify({ before: desktopBeforeExternal, after: await page.evaluate(() => ({ ...window.integratedFixture.counts })) })}`);
  console.log("PASS desktop Chromium: normal layout");
  await browser.close(); browser = undefined;
} finally {
  await browser?.close();
  await vite.close();
  fs.rmSync(fixture, { recursive: true, force: true });
}
