import assert from "node:assert/strict";
import test from "node:test";
import { setTemporaryProfile } from "./temporary-profile.mjs";

function fixture() {
  let profile = { displayName: "Demo", learningGoal: "Practice", locale: "ru", countryCode: "DE",
    timezone: "Europe/Berlin", birthDate: "2010-01-01", connectionRoutePreference: "RF" };
  const restores = [];
  const requests = [];
  async function apiRequest(_token, method, _path, _status, body) {
    requests.push({ method, body });
    if (method === "PUT") profile = { ...body };
    return { ...profile };
  }
  return { apiRequest, restores, requests, profile: () => ({ ...profile }), change: (fields) => { profile = { ...profile, ...fields }; } };
}

test("locale override retains all fields and restores it without overwriting unrelated edits", async () => {
  const state = fixture();
  await setTemporaryProfile({ ...state, token: "demo", overrides: { locale: "en" }, registerRestore: (fn) => state.restores.push(fn) });
  assert.equal(state.profile().birthDate, "2010-01-01");
  assert.equal(state.profile().countryCode, "DE");
  state.change({ learningGoal: "Updated independently" });
  await state.restores[0]();
  assert.equal(state.profile().locale, "ru");
  assert.equal(state.profile().learningGoal, "Updated independently");
  assert.equal(state.profile().connectionRoutePreference, "RF");
});

test("failed write can be inspected and undone", async () => {
  const state = fixture();
  let first = true;
  const apiRequest = async (...args) => {
    const result = await state.apiRequest(...args);
    if (args[1] === "PUT" && first) { first = false; throw new Error("response lost"); }
    return result;
  };
  await assert.rejects(setTemporaryProfile({ apiRequest, token: "demo", overrides: { birthDate: "2000-01-01" }, registerRestore: (fn) => state.restores.push(fn) }), /response lost/);
  await state.restores[0]();
  assert.equal(state.profile().birthDate, "2010-01-01");
});

test("independent edit of a temporary field is preserved and reported", async () => {
  const state = fixture();
  await setTemporaryProfile({ ...state, token: "demo", overrides: { locale: "en" }, registerRestore: (fn) => state.restores.push(fn) });
  state.change({ locale: "fr" });
  await assert.rejects(state.restores[0](), /changed independently/);
  assert.equal(state.profile().locale, "fr");
});

test("an already suitable profile is not written", async () => {
  const state = fixture();
  await setTemporaryProfile({ ...state, token: "demo", overrides: { locale: "ru" }, registerRestore: (fn) => state.restores.push(fn) });
  assert.equal(state.restores.length, 0);
  assert.deepEqual(state.requests.map(({ method }) => method), ["GET"]);
});
