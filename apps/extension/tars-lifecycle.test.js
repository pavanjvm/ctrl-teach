const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const offscreenSource = fs.readFileSync(path.join(__dirname, "offscreen.js"), "utf8");
const workerSource = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");

test("embedded Tars suspension is scoped to its Ctrl+Teach tab", () => {
  assert.match(workerSource, /const suspendedTabIds = new Set\(\)/);
  assert.match(workerSource, /suspended: suspendedTabIds\.has\(tabId\)/);
  assert.match(workerSource, /suspendedTabIds\.has\(currentTurn\.tabId\)/);
  assert.match(workerSource, /suspendedTabIds\.has\(activeContext\.tabId\)/);
  assert.match(workerSource, /!state\.enabled \|\| suspendedTabIds\.has\(tabId\) \|\| !accessToken/);
});

test("browser-wide activation follows the focused Chrome window", () => {
  assert.match(workerSource, /chrome\.windows\.onFocusChanged\.addListener/);
  assert.match(workerSource, /if \(tabId !== activeTabId\) await setActiveTab\(tabId\)/);
  assert.match(workerSource, /!tab\.active \|\| !tabWindow\?\.focused/);
});

test("offscreen document creation is serialized", () => {
  assert.match(workerSource, /let offscreenCreation = null/);
  assert.match(workerSource, /if \(!offscreenCreation\) \{\s*offscreenCreation = chrome\.offscreen\.createDocument/);
  assert.match(workerSource, /await offscreenCreation;\s*\} finally \{\s*offscreenCreation = null/);
});

test("runtime message failures return a structured response", () => {
  assert.match(workerSource, /\[Tars\] runtime message failed/);
  assert.match(workerSource, /error instanceof Error \? error\.message/);
  assert.match(workerSource, /\[Tars\] startup failed/);
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
