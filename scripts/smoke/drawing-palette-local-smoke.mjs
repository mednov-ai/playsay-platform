import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scriptDir, '../..');
const webApp = path.join(repo, 'frontend/web-app');
const require = createRequire(path.join(repo, 'frontend/package.json'));
const requireTools = createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR ?? path.join(os.homedir(), '.codex/tools/playwright'), 'package.json'));
const { chromium, webkit } = requireTools('playwright');
const { WebSocketServer } = require('ws');
const Y = require('yjs');
const sync = require('y-protocols/sync');
const enc = require('lib0/encoding');
const dec = require('lib0/decoding');
const rooms = new Map();
const sockets = new Set();
const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
server.on('connection', (ws, req) => {
  const room = new URL(req.url, 'http://localhost').searchParams.get('room');
  if (!rooms.has(room)) {
    const doc = new Y.Doc();
    rooms.set(room, doc);
    doc.on('update', (update, origin) => {
      const e = enc.createEncoder(); enc.writeVarUint(e, 0); sync.writeUpdate(e, update);
      for (const peer of sockets) if (peer.room === room && peer !== origin && peer.readyState === 1) peer.send(enc.toUint8Array(e));
    });
  }
  ws.room = room; sockets.add(ws);
  const greeting = enc.createEncoder(); enc.writeVarUint(greeting, 0); sync.writeSyncStep1(greeting, rooms.get(room));
  ws.send(enc.toUint8Array(greeting));
  ws.on('close', () => sockets.delete(ws));
  ws.on('message', (data) => {
    const d = dec.createDecoder(new Uint8Array(data));
    if (dec.readVarUint(d) !== 0) return;
    const e = enc.createEncoder(); enc.writeVarUint(e, 0); sync.readSyncMessage(d, e, rooms.get(room), ws);
    if (enc.length(e) > 1) ws.send(enc.toUint8Array(e));
  });
});
await once(server, 'listening');
const socketUrl = `ws://127.0.0.1:${server.address().port}`;
const fixtureDir = fs.mkdtempSync(path.join(webApp, '.palette-smoke-'));
fs.cpSync(path.join(scriptDir, 'fixtures/drawing-palette'), fixtureDir, { recursive: true });
process.chdir(webApp);
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const vite = await createServer({ root: webApp, configFile: path.join(webApp, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false }, optimizeDeps: { entries: [path.join(fixtureDir, 'index.html')] }, logLevel: 'error' });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}/${path.basename(fixtureDir)}/index.html`;
const output = process.env.OUTPUT_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'honey-palette-evidence-'));
fs.mkdirSync(output, { recursive: true });
const results = [];
const colors = ['#ff5c00', '#00a878', '#2574ff', '#ef4444', '#eab308', '#8b5cf6', '#ec4899', '#111827', '#6b7280', '#ffffff'];
const localizedWhite = { ru: 'Белый', en: 'White', de: 'Weiß', fr: 'Blanc' };
async function elements(page, controlled) {
  return page.evaluate((isControlled) => isControlled ? JSON.parse(document.querySelector('#content').textContent) : window.smoke.elements, controlled);
}
async function choose(page, index) {
  await page.getByTestId('annotation-color-select').click();
  assert.equal(await page.getByRole('option').count(), 10);
  await page.getByRole('option').nth(index).click();
  assert.equal(await page.getByRole('listbox').count(), 0);
}
async function draw(page) {
  await page.getByTestId('annotation-tool-pen').click();
  const box = await page.locator('svg[data-anchor-id="jpeg-1"]').boundingBox();
  assert.ok(box?.width > 50);
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
}
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true, executablePath: name === 'chromium' ? process.env.CHROMIUM_EXECUTABLE : process.env.WEBKIT_EXECUTABLE });
    try {
      for (const controlled of [false, true]) for (const mobile of [false, true]) for (const dark of [false, true]) {
        const locale = ['ru', 'en', 'de', 'fr'][(mobile ? 2 : 0) + (dark ? 1 : 0)];
        const id = `${name}-${controlled ? 'controlled' : 'lesson'}-${mobile ? 'mobile' : 'desktop'}-${dark ? 'dark' : 'light'}-${locale}`;
        const context = await browser.newContext({ viewport: mobile ? { width: 375, height: 812 } : { width: 1365, height: 900 }, hasTouch: mobile });
        await context.route((url) => url.pathname.startsWith('/api/'), async (route) => {
          const room = new URL(route.request().frame().url()).searchParams.get('room');
          await route.fulfill({ json: route.request().url().endsWith('/token') ? { documentId: room, websocketUrl: socketUrl, yjsDocumentId: room, token: 'synthetic' } : [] });
        });
        const page = await context.newPage();
        const errors = []; page.on('pageerror', (error) => { errors.push(error.message); console.log('PAGE ERROR', error.message); });
        page.on('console', msg => { if(msg.type()==='error') console.log('BROWSER',msg.text()); });
        const url = `${base}?room=${id}&locale=${locale}${controlled ? '&controlled=1' : ''}${dark ? '&dark=1' : ''}`;
        await page.goto(url);
        if (!controlled) await page.waitForFunction(() => window.smoke?.status).catch(async error => { console.log(await page.evaluate(()=>({body:document.body.innerText.slice(0,300), smoke:window.smoke}))); throw error; });
        const trigger = page.getByTestId('annotation-color-select');
        await trigger.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${id}-closed.png`) });
        if (mobile) await trigger.tap(); else await trigger.click();
        assert.equal(await page.getByRole('option').count(), 10);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        assert.equal(await page.getByRole('option').last().textContent(), localizedWhite[locale]);
        const bounds = await page.getByRole('listbox').boundingBox();
        const viewport = page.viewportSize();
        assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
        await page.screenshot({ path: path.join(output, `${id}-open.png`) });
        const before = await elements(page, controlled);
        await page.keyboard.press('End');
        await page.keyboard.press('Escape');
        assert.deepEqual(await elements(page, controlled), before);
        assert.equal(await trigger.evaluate((el) => document.activeElement === el), true);
        await trigger.press('Space');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        assert.ok((await trigger.getAttribute('aria-label')).includes(localizedWhite[locale]));
        await trigger.click(); await page.keyboard.press('Tab');
        assert.equal(await page.getByRole('listbox').count(), 0);
        assert.equal(await trigger.evaluate((el) => document.activeElement === el), false);
        await trigger.click(); await page.locator('#outside').click();
        assert.equal(await page.getByRole('listbox').count(), 0);
        for (let index = 0; index < colors.length; index++) {
          await choose(page, index);
          const swatch = await trigger.locator('.playsay-color-sample').evaluate((el) => el.style.backgroundColor);
          assert.ok(swatch);
        }
        await choose(page, 3);
        await draw(page);
        assert.equal((await elements(page, controlled)).at(-1).color, colors[3]);
        // Existing Yjs undo coalesces operations within 500 ms; use separate user gestures.
        await new Promise(resolve => setTimeout(resolve, 550));
        // Recolor the drawn stroke through the actual selected-element path.
        await page.getByTestId('annotation-tool-pointer').click();
        await page.locator('.playsay-annotation-element').first().focus();
        await page.keyboard.press('Enter');
        await choose(page, 5);
        assert.equal((await elements(page, controlled))[0].color, colors[5]);
        await page.getByTestId('annotation-tool-undo').click();
        if (!controlled) await page.waitForFunction(() => window.smoke.elements[0]?.color === '#ef4444');
        assert.equal((await elements(page, controlled))[0].color, colors[3]);
        await page.getByTestId('annotation-tool-redo').click();
        if (!controlled) await page.waitForFunction(() => window.smoke.elements[0]?.color === '#8b5cf6');
        assert.equal((await elements(page, controlled))[0].color, colors[5]);
        // Expanded image uses the same dropdown without clipping.
        await page.getByTestId('material-image-focus-jpeg-1').click();
        await choose(page, 6);
        await draw(page);
        await page.getByTestId('material-focus-close').click();
        if (!controlled) {
          const peer = await context.newPage();
          await peer.goto(url + '&actor=Student');
          await peer.waitForFunction(() => window.smoke?.status && window.smoke.elements.some(element => element.color === '#ec4899'));
          const isolated = await context.newPage();
          await isolated.goto(url.replace(`room=${id}`, `room=${id}-other-learner`));
          await isolated.waitForFunction(() => window.smoke?.status);
          assert.equal((await elements(isolated, false)).length, 0);
          await isolated.close(); await peer.close();
        }
        await page.reload();
        if (!controlled) await page.waitForFunction(() => window.smoke?.status && window.smoke.elements.length > 0);
        assert.equal((await elements(page, controlled)).at(-1).color, colors[6]);
        // Force toolbar scrolling and a list shorter than its content.
        await page.setViewportSize({ width: viewport.width, height: 420 });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await page.keyboard.press('End');
        const constrained = await page.getByRole('listbox').boundingBox();
        assert.ok(constrained.y >= 0 && constrained.y + constrained.height <= 420);
        assert.equal(await page.getByRole('listbox').evaluate(el => el.scrollTop > 0), true);
        await page.screenshot({ path: path.join(output, `${id}-constrained.png`) });
        await page.keyboard.press('Enter');
        await page.setViewportSize(viewport);
        assert.deepEqual(errors, []);
        results.push({ id, passed: true, browser: browser.version(), controlled, mobile, dark, locale, colors: 10, drawing: true, recolor: true, undoRedo: true, reload: true, constrainedViewport: true, sharedAndIsolatedRooms: !controlled });
        console.log('PASS', id);
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ boundary: 'Local synthetic canvases and Yjs rooms; no deployed auth or authorization acceptance', results }, null, 2));
  await vite.close();
  for (const ws of sockets) ws.terminate();
  await new Promise((resolve) => server.close(resolve));
  for (const doc of rooms.values()) doc.destroy();
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
console.log(`${results.length} cases passed; evidence: ${output}`);
