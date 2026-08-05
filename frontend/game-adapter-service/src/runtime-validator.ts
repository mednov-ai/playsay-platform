import { chromium, type Browser, type Page } from "playwright-core";
import {
  readGameManifest,
  validateGameManifest,
  type GameManifest,
} from "@playsay/game-sync";

const VALIDATION_URL = "http://validation.local/game";
const SOURCE_VALIDATION_URL = "http://validation.local/source";
const VALIDATION_TIMEOUT_MS = 12_000;
const STEP_TIMEOUT_MS = 2_500;
export const MECHANICS_VALIDATOR_VERSION = "mechanics-v2";

export type RuntimeValidationOperation =
  | { kind: "click"; selector: string }
  | { kind: "pointerdown"; selector: string }
  | { key: string; kind: "keydown" };

export type RuntimeValidationStep = {
  expectActionType: string;
  expectDomChange: boolean;
  name: string;
  operation: RuntimeValidationOperation;
};

export type RuntimeValidationPlan = {
  readySelector: string;
  steps: RuntimeValidationStep[];
};

export type RuntimeValidationSummary = {
  actionCount: number;
  checks: string[];
  durationMs: number;
  mechanicsEquivalent: boolean;
  maximumActionsPerSecond: number;
  validatorVersion: typeof MECHANICS_VALIDATOR_VERSION;
};

let browserPromise: Promise<Browser> | null = null;

export function validateRuntimePlan(value: unknown): RuntimeValidationPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("VALIDATION_PLAN_INVALID", "validationPlan must be an object");
  }
  const plan = value as Partial<RuntimeValidationPlan>;
  if (typeof plan.readySelector !== "string" || !validSelectorText(plan.readySelector)) {
    throw validationError("VALIDATION_PLAN_INVALID", "readySelector must be a non-empty bounded selector");
  }
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 12) {
    throw validationError("VALIDATION_PLAN_INVALID", "validationPlan must contain between one and twelve steps");
  }
  const steps = plan.steps.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw validationError("VALIDATION_PLAN_INVALID", `step ${index + 1} must be an object`);
    }
    const step = candidate as Partial<RuntimeValidationStep>;
    if (
      typeof step.name !== "string" ||
      !step.name.trim() ||
      typeof step.expectActionType !== "string" ||
      !step.expectActionType.trim() ||
      step.expectActionType.length > 120 ||
      typeof step.expectDomChange !== "boolean"
    ) {
      throw validationError("VALIDATION_PLAN_INVALID", `step ${index + 1} has invalid expectations`);
    }
    const operation = validateOperation(step.operation, index);
    return {
      expectActionType: step.expectActionType.trim(),
      expectDomChange: step.expectDomChange,
      name: step.name.trim().slice(0, 120),
      operation,
    };
  });
  if (!steps.some((step) => step.expectDomChange)) {
    throw validationError("VALIDATION_PLAN_INVALID", "at least one step must verify a DOM state change");
  }
  return { readySelector: plan.readySelector.trim(), steps };
}

export async function validateGameRuntime(
  html: string,
  planValue: unknown,
  sourceHtml?: string,
): Promise<RuntimeValidationSummary> {
  const startedAt = performance.now();
  const plan = validateRuntimePlan(planValue);
  const embeddedManifest = readGameManifest(html);
  if (!embeddedManifest) {
    throw validationError("GAME_MANIFEST_INVALID", "embedded manifest is missing or invalid");
  }
  const browser = await runtimeBrowser();
  const context = await browser.newContext({
    javaScriptEnabled: true,
    serviceWorkers: "block",
    viewport: { height: 720, width: 1280 },
  }).catch(async (error) => {
    browserPromise = null;
    await browser.close().catch(() => undefined);
    throw validationError(
      "RUNTIME_VALIDATOR_UNAVAILABLE",
      error instanceof Error ? error.message : String(error),
    );
  });
  const page = await context.newPage().catch(async (error) => {
    await context.close().catch(() => undefined);
    if (!browser.isConnected()) browserPromise = null;
    throw validationError(
      "RUNTIME_VALIDATOR_UNAVAILABLE",
      error instanceof Error ? error.message : String(error),
    );
  });
  const sourcePage = sourceHtml ? await context.newPage() : null;
  const runtimeErrors: string[] = [];
  const networkAttempts: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message.slice(0, 500)));
  sourcePage?.on("pageerror", (error) => runtimeErrors.push(`source: ${error.message.slice(0, 500)}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text().slice(0, 500));
  });
  sourcePage?.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`source: ${message.text().slice(0, 500)}`);
  });
  await page.addInitScript(deterministicRuntimeSource());
  await page.addInitScript(validationTransportSource());
  await sourcePage?.addInitScript(deterministicRuntimeSource());
  await page.route("**/*", async (route) => {
    if (route.request().url() === VALIDATION_URL) {
      await route.fulfill({
        body: withValidationCsp(html),
        contentType: "text/html; charset=utf-8",
        status: 200,
      });
      return;
    }
    networkAttempts.push(route.request().url().slice(0, 300));
    await route.abort("blockedbyclient");
  });
  await sourcePage?.route("**/*", async (route) => {
    if (route.request().url() === SOURCE_VALIDATION_URL && sourceHtml) {
      await route.fulfill({
        body: withValidationCsp(sourceHtml),
        contentType: "text/html; charset=utf-8",
        status: 200,
      });
      return;
    }
    networkAttempts.push(`source: ${route.request().url().slice(0, 300)}`);
    await route.abort("blockedbyclient");
  });

  try {
    return await withTimeout(async () => {
      await page.goto(VALIDATION_URL, { waitUntil: "domcontentloaded" });
      if (sourcePage) {
        await sourcePage.goto(SOURCE_VALIDATION_URL, { waitUntil: "domcontentloaded" });
        await sourcePage.locator(plan.readySelector).first().waitFor({
          state: "visible",
          timeout: STEP_TIMEOUT_MS,
        });
      }
      await page.locator(plan.readySelector).first().waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
      await page.waitForFunction(
        () => {
          const trace = (window as unknown as {
            __PLAYSAY_RUNTIME_VALIDATION__?: { hello?: unknown; lifecycles?: string[] };
          }).__PLAYSAY_RUNTIME_VALIDATION__;
          return Boolean(trace?.hello && trace.lifecycles?.includes("ready"));
        },
        undefined,
        { timeout: STEP_TIMEOUT_MS },
      );
      const hello = await page.evaluate(() => (
        (window as unknown as {
          __PLAYSAY_RUNTIME_VALIDATION__: { hello: { manifest?: unknown } };
        }).__PLAYSAY_RUNTIME_VALIDATION__.hello
      ));
      const runtimeManifest = validateGameManifest(hello.manifest);
      if (!sameManifest(runtimeManifest, embeddedManifest)) {
        throw validationError("GAME_MANIFEST_MISMATCH", "runtime manifest differs from embedded manifest");
      }
      assertRuntimeClean(runtimeErrors, networkAttempts);
      if (sourcePage) {
        assertMechanicsEquivalent(
          await semanticFingerprint(sourcePage),
          await semanticFingerprint(page),
          "initial state",
        );
      }

      for (const step of plan.steps) {
        const before = await domFingerprint(page);
        const actionCountBefore = await actionCount(page);
        await Promise.all([
          performOperation(page, step.operation),
          sourcePage ? performOperation(sourcePage, step.operation) : Promise.resolve(),
        ]);
        await page.waitForFunction(
          ({ expectedType, previousCount }) => {
            const trace = (window as unknown as {
              __PLAYSAY_RUNTIME_VALIDATION__: {
                actions: Array<{ action?: { type?: unknown } }>;
              };
            }).__PLAYSAY_RUNTIME_VALIDATION__;
            return trace.actions.length > previousCount &&
              trace.actions.slice(previousCount).some((item) => item.action?.type === expectedType);
          },
          { expectedType: step.expectActionType, previousCount: actionCountBefore },
          { timeout: STEP_TIMEOUT_MS },
        );
        await page.waitForTimeout(100);
        const emittedActions = await actionsSince(page, actionCountBefore);
        if (
          emittedActions.length !== 1 ||
          emittedActions[0]?.action?.type !== step.expectActionType
        ) {
          throw validationError(
            "ACTION_CARDINALITY_INVALID",
            `${step.name} emitted ${emittedActions.length} actions instead of one ${step.expectActionType}`,
          );
        }
        if (step.expectDomChange) {
          await page.waitForFunction(
            (previous) => {
              const controls = [...document.querySelectorAll("input,select,textarea")]
                .map((element) => {
                  const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                  const checked = control instanceof HTMLInputElement ? control.checked : false;
                  const selectedIndex = control instanceof HTMLSelectElement ? control.selectedIndex : -1;
                  return `${control.value}:${checked}:${selectedIndex}`;
                })
                .join("|");
              const current = `${document.body.innerText}|${document.body.className}|${controls}|${document.body.innerHTML}`;
              return current !== previous;
            },
            before,
            { timeout: STEP_TIMEOUT_MS },
          );
        }
        if (sourcePage) {
          assertMechanicsEquivalent(
            await semanticFingerprint(sourcePage),
            await semanticFingerprint(page),
            step.name,
          );
        }
        assertRuntimeClean(runtimeErrors, networkAttempts);
      }

      await page.waitForTimeout(750);
      assertRuntimeClean(runtimeErrors, networkAttempts);
      const actions = await page.evaluate(() => (
        (window as unknown as {
          __PLAYSAY_RUNTIME_VALIDATION__: {
            actions: Array<{ at: number; action?: Record<string, unknown> }>;
          };
        }).__PLAYSAY_RUNTIME_VALIDATION__.actions
      ));
      const invalidAction = actions.find((entry) => !validAction(entry.action, embeddedManifest));
      if (invalidAction) {
        throw validationError("ACTION_CONTRACT_INVALID", "runtime emitted a non-string or empty action type");
      }
      const maximumActionsPerSecond = maximumRate(actions.map((entry) => entry.at));
      if (maximumActionsPerSecond > 30 || maximumThreeSecondRate(actions.map((entry) => entry.at)) > 20) {
        throw validationError(
          "ACTION_RATE_EXCEEDED",
          `runtime emitted ${maximumActionsPerSecond} actions in a one-second window`,
        );
      }
      return {
        actionCount: actions.length,
        checks: [
          "manifest",
          "hello",
          "lifecycle-ready",
          "interactive-actions",
          "one-action-per-intent",
          "dom-state-change",
          ...(sourcePage ? ["source-differential"] : []),
          "offline-runtime",
          "action-rate",
        ],
        durationMs: Math.round(performance.now() - startedAt),
        mechanicsEquivalent: true,
        maximumActionsPerSecond,
        validatorVersion: MECHANICS_VALIDATOR_VERSION,
      };
    }, VALIDATION_TIMEOUT_MS);
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function closeRuntimeValidator(): Promise<void> {
  const browser = await browserPromise?.catch(() => null);
  browserPromise = null;
  await browser?.close();
}

async function runtimeBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim() || "/usr/bin/chromium";
    browserPromise = chromium.launch({
      args: [
        "--disable-background-networking",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-sync",
        "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost",
        "--no-first-run",
        "--no-sandbox",
      ],
      executablePath,
      headless: true,
    }).catch((error) => {
      browserPromise = null;
      throw validationError(
        "RUNTIME_VALIDATOR_UNAVAILABLE",
        error instanceof Error ? error.message : String(error),
      );
    });
  }
  return browserPromise;
}

function validateOperation(
  operation: RuntimeValidationOperation | undefined,
  index: number,
): RuntimeValidationOperation {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw validationError("VALIDATION_PLAN_INVALID", `step ${index + 1} operation is missing`);
  }
  if (operation.kind === "keydown") {
    if (typeof operation.key !== "string" || !operation.key.trim() || operation.key.length > 40) {
      throw validationError("VALIDATION_PLAN_INVALID", `step ${index + 1} key is invalid`);
    }
    return { key: operation.key.trim(), kind: "keydown" };
  }
  if (
    (operation.kind === "click" || operation.kind === "pointerdown") &&
    typeof operation.selector === "string" &&
    validSelectorText(operation.selector)
  ) {
    return { kind: operation.kind, selector: operation.selector.trim() };
  }
  throw validationError("VALIDATION_PLAN_INVALID", `step ${index + 1} operation is invalid`);
}

function validSelectorText(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 200 && !/[{};]/.test(value);
}

async function performOperation(page: Page, operation: RuntimeValidationOperation): Promise<void> {
  if (operation.kind === "keydown") {
    await page.keyboard.press(operation.key);
    return;
  }
  const target = page.locator(operation.selector).first();
  await target.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  if (operation.kind === "click") {
    await target.click();
  } else {
    await target.dispatchEvent("pointerdown", {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    });
  }
}

async function actionCount(page: Page): Promise<number> {
  return page.evaluate(() => (
    (window as unknown as {
      __PLAYSAY_RUNTIME_VALIDATION__: { actions: unknown[] };
    }).__PLAYSAY_RUNTIME_VALIDATION__.actions.length
  ));
}

async function actionsSince(
  page: Page,
  start: number,
): Promise<Array<{ action?: { type?: unknown } }>> {
  return page.evaluate((from) => (
    (window as unknown as {
      __PLAYSAY_RUNTIME_VALIDATION__: {
        actions: Array<{ action?: { type?: unknown } }>;
      };
    }).__PLAYSAY_RUNTIME_VALIDATION__.actions.slice(from)
  ), start);
}

async function domFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll("input,select,textarea")]
      .map((element) => {
        const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const checked = control instanceof HTMLInputElement ? control.checked : false;
        const selectedIndex = control instanceof HTMLSelectElement ? control.selectedIndex : -1;
        return `${control.value}:${checked}:${selectedIndex}`;
      })
      .join("|");
    return `${document.body.innerText}|${document.body.className}|${controls}|${document.body.innerHTML}`;
  });
}

async function semanticFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const normalized = [...document.body.querySelectorAll("*")]
      .filter((element) => !["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName))
      .map((element) => {
        const html = element as HTMLElement;
        const attributes = [...element.attributes]
          .filter((attribute) => (
            !attribute.name.startsWith("data-playsay-") &&
            !attribute.name.startsWith("on") &&
            attribute.name !== "style"
          ))
          .map((attribute) => [attribute.name, attribute.value] as const)
          .sort(([left], [right]) => left.localeCompare(right));
        const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        return {
          attributes,
          checked: element instanceof HTMLInputElement ? element.checked : undefined,
          className: html.className,
          directText: [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent?.replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join(" "),
          selectedIndex: element instanceof HTMLSelectElement ? element.selectedIndex : undefined,
          tag: element.tagName.toLowerCase(),
          value: element.matches("input,select,textarea") ? control.value : undefined,
        };
      });
    return JSON.stringify({
      bodyClass: document.body.className,
      bodyText: document.body.innerText.replace(/\s+/g, " ").trim(),
      elements: normalized,
    });
  });
}

function assertMechanicsEquivalent(source: string, candidate: string, step: string): void {
  if (source !== candidate) {
    throw validationError(
      "GAME_MECHANICS_CHANGED",
      `candidate differs from the source after ${step}`,
    );
  }
}

function maximumRate(timestamps: number[]): number {
  let maximum = 0;
  let start = 0;
  for (let end = 0; end < timestamps.length; end += 1) {
    while ((timestamps[end] ?? 0) - (timestamps[start] ?? 0) >= 1_000) start += 1;
    maximum = Math.max(maximum, end - start + 1);
  }
  return maximum;
}

function validAction(action: Record<string, unknown> | undefined, manifest: GameManifest): boolean {
  return Boolean(
    action &&
    typeof action.eventId === "string" &&
    action.eventId &&
    typeof action.actorId === "string" &&
    action.actorId &&
    typeof action.runId === "string" &&
    action.runId &&
    Number.isSafeInteger(action.actorSequence) &&
    Number(action.actorSequence) > 0 &&
    typeof action.type === "string" &&
    action.type.trim() &&
    action.type.length <= 120 &&
    action.gameId === manifest.gameId &&
    action.stateVersion === manifest.stateVersion
  );
}

function sameManifest(left: GameManifest, right: GameManifest): boolean {
  return (
    left.protocol === right.protocol &&
    left.gameId === right.gameId &&
    left.stateVersion === right.stateVersion &&
    left.reducerVersion === right.reducerVersion &&
    left.buildHash === right.buildHash &&
    JSON.stringify(left.capabilities ?? []) === JSON.stringify(right.capabilities ?? [])
  );
}

function maximumThreeSecondRate(timestamps: number[]): number {
  let maximum = 0;
  let start = 0;
  for (let end = 0; end < timestamps.length; end += 1) {
    while ((timestamps[end] ?? 0) - (timestamps[start] ?? 0) >= 3_000) start += 1;
    maximum = Math.max(maximum, (end - start + 1) / 3);
  }
  return maximum;
}

function assertRuntimeClean(runtimeErrors: string[], networkAttempts: string[]): void {
  if (networkAttempts.length > 0) {
    throw validationError("NETWORK_ACCESS_ATTEMPTED", networkAttempts[0] ?? "network request");
  }
  if (runtimeErrors.length > 0) {
    throw validationError("RUNTIME_ERROR", runtimeErrors[0] ?? "unknown runtime error");
  }
}

function withValidationCsp(html: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`;
  return /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (head) => `${head}${csp}`)
    : html.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${csp}</head>`);
}

function validationTransportSource(): () => void {
  return () => {
    const listeners = new Set<(message: unknown) => void>();
    const trace = {
      actions: [] as Array<{ action: unknown; at: number }>,
      hello: null as unknown,
      lifecycles: [] as string[],
    };
    let revision = 0;
    let logicalTime = 0;
    Object.defineProperty(window, "__PLAYSAY_RUNTIME_VALIDATION__", {
      configurable: false,
      value: trace,
    });
    Object.defineProperty(window, "__PLAY_SAY_GAME_SYNC_TRANSPORT__", {
      configurable: false,
      value: {
        send(message: {
          action?: Record<string, unknown>;
          event?: string;
          kind?: string;
          manifest?: unknown;
        }) {
          if (message.kind === "hello") {
            trace.hello = message;
            queueMicrotask(() => listeners.forEach((listener) => listener({
              actorId: "runtime-validator",
              isAuthority: true,
              kind: "context",
              runId: "runtime-validation",
              seed: 7,
            })));
          } else if (message.kind === "lifecycle" && message.event) {
            trace.lifecycles.push(message.event);
          } else if (message.kind === "action-request" && message.action) {
            trace.actions.push({ action: message.action, at: performance.now() });
            const action = {
              ...message.action,
              authorityRevision: ++revision,
              logicalTime: ++logicalTime,
            };
            queueMicrotask(() => listeners.forEach((listener) => listener({
              action,
              kind: "ordered-action",
            })));
          }
        },
        subscribe(listener: (message: unknown) => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    });
  };
}

function deterministicRuntimeSource(): () => void {
  return () => {
    let state = 0x6d2b79f5;
    const random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    Object.defineProperty(Math, "random", {
      configurable: false,
      value: random,
    });
  };
}

function validationError(code: string, message: string): Error {
  return new Error(`${code}: ${message.slice(0, 500)}`);
}

async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(validationError("RUNTIME_VALIDATION_TIMEOUT", `exceeded ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
