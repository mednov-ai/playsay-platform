import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOldPasswordRejected,
  assertPasswordResetAccepted,
  assertPasswordSignInAccepted,
  extractPasswordResetCode,
  pollForPasswordResetCode,
  runRequiredCleanup,
} from "./registration-smoke-helpers.mjs";

test("extracts only a six-digit reset code", () => {
  assert.equal(extractPasswordResetCode("Reset code: 654321"), "654321");
  assert.equal(extractPasswordResetCode("Reset code: 65432"), null);
  assert.equal(extractPasswordResetCode("Reset code: 7654321"), null);
});

test("reset polling fails after its bounded deadline", async () => {
  let clock = 0;
  await assert.rejects(() => pollForPasswordResetCode({
    deadlineAt: 2,
    loadMessage: async () => ({}),
    loadMessages: async () => [],
    now: () => clock,
    pause: async () => { clock += 1; },
    requestedAfter: 0,
  }), /did not arrive/u);
});

test("old-password verification fails if the credential still signs in", () => {
  assert.throws(() => assertOldPasswordRejected(200), /old credential was accepted/u);
  assert.doesNotThrow(() => assertOldPasswordRejected(400));
});

test("invalid reset code and new-password sign-in failure fail acceptance", () => {
  assert.throws(() => assertPasswordResetAccepted(400), /PASSWORD_RESET_CONFIRM/u);
  assert.throws(() => assertPasswordSignInAccepted(401), /PASSWORD_RESET_SIGN_IN/u);
});

test("required cleanup reports failure after attempting every operation", async () => {
  const calls = [];
  await assert.rejects(() => runRequiredCleanup([
    async () => { calls.push("identity"); throw new Error("failed"); },
    async () => { calls.push("mailbox"); },
  ]), /cleanup operations failed/iu);
  assert.deepEqual(calls, ["identity", "mailbox"]);
});
