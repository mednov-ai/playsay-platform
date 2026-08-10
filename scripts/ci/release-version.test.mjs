import assert from "node:assert/strict";
import test from "node:test";
import {
  NEW_RELEASE_BRANCH_PATTERN,
  nextReleaseVersion,
  parseReleaseVersion,
} from "./release-version.mjs";

test("regular release increments the middle counter and resets fixes", () => {
  assert.equal(nextReleaseVersion("release/1.001.09", "release"), "release/01.002.00");
  assert.equal(nextReleaseVersion("release/01.002.07", "release"), "release/01.003.00");
});

test("fix increments only the final counter", () => {
  assert.equal(nextReleaseVersion("release/01.002.00", "fix"), "release/01.002.01");
});

test("major increments the first counter and starts release 001", () => {
  assert.equal(nextReleaseVersion("release/01.042.07", "major"), "release/02.001.00");
});

test("new release branches require fixed-width NN.NNN.NN", () => {
  assert.match("release/01.002.00", NEW_RELEASE_BRANCH_PATTERN);
  assert.doesNotMatch("release/1.002.00", NEW_RELEASE_BRANCH_PATTERN);
  assert.doesNotMatch("release/01.2.00", NEW_RELEASE_BRANCH_PATTERN);
  assert.doesNotMatch("release/01.002.0", NEW_RELEASE_BRANCH_PATTERN);
});

test("historical one-digit major can be read as a baseline", () => {
  assert.deepEqual(parseReleaseVersion("release/1.001.09"), { major: 1, release: 1, fix: 9 });
});

test("counter overflow requires choosing the next release level", () => {
  assert.throws(() => nextReleaseVersion("release/01.999.00", "release"), /major release/);
  assert.throws(() => nextReleaseVersion("release/01.002.99", "fix"), /regular release/);
});
