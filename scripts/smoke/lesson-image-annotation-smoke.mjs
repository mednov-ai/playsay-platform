// Local synthetic regression; no account, production access or project Playwright dependency.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { runAssertions } from './fixtures/image-annotation/assertions.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requireFrontend = createRequire(resolve(root, 'frontend/package.json'));
const { createServer } = requireFrontend('vite');
const react = requireFrontend('@vitejs/plugin-react');
process.chdir(resolve(root, 'frontend/web-app'));
const cacheDir = await mkdtemp(resolve(tmpdir(), 'honey-image-vite-'));
const server = await createServer({
  cacheDir,
  configFile: false,
  root: resolve(root, 'scripts/smoke/fixtures/image-annotation'),
  plugins: [react.default()],
  resolve: {
    alias: {
      react: resolve(requireFrontend.resolve('react/package.json'), '..'),
      'react-dom': resolve(requireFrontend.resolve('react-dom/package.json'), '..'),
    },
  },
  css: { postcss: resolve(root, 'frontend/web-app') },
  server: {
    host: '127.0.0.1', port: 0,
    fs: { allow: [root, resolve(requireFrontend.resolve('react/package.json'), '../../..')] },
  },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
console.log(`Fixture: ${base}`);
if (!process.argv.includes('--serve')) {
  let browser;
  try {
    const moduleUrl = process.env.PLAYWRIGHT_MODULE
      ?? pathToFileURL(resolve(homedir(), '.codex/tools/playwright/node_modules/playwright/index.mjs')).href;
    const { chromium } = await import(moduleUrl);
    browser = await chromium.launch();
    const output = await mkdtemp(resolve(tmpdir(), 'honey-image-annotation-'));
    await runAssertions(browser, base, output);
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}
