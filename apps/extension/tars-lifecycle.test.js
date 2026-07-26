const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const offscreenSource = fs.readFileSync(path.join(__dirname, "offscreen.js"), "utf8");
const workerSource = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");

test("suspension resets worker PTT and stale response context", () => {
  assert.match(
    workerSource,
    /if \(shouldSuspend\) \{\s*await cancelPushToTalk\("tars_suspended"\);\s*activeContext = null;/,
  );
});

test("suspension clears offscreen playback and microphone turn state", () => {
  assert.match(
    offscreenSource,
    /changedIdentity \|\| !message\.config\?\.enabled \|\| message\.config\?\.suspended\) \{\s*clearPlayback\(\);\s*cancelPtt\(\);/,
  );
});

test("point localization keeps the loading ring visible until coordinates arrive", () => {
  assert.match(offscreenSource, /event\.type === "tars_point_pending"/);
  assert.match(offscreenSource, /mode:\s*"thinking"/);
  assert.match(offscreenSource, /Tars locating/);
});
