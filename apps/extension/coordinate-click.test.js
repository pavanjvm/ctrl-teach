const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
const workerSource = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const contentSource = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");

test("grants the browser-level input permission required for non-DOM clicks", () => {
  assert.ok(manifest.permissions.includes("debugger"));
});

test("dispatches one real coordinate click and immediately detaches", () => {
  assert.match(workerSource, /chrome\.debugger\.attach\(debuggee, "1\.3"\)/);
  assert.match(workerSource, /type: "mousePressed"[\s\S]*?type: "mouseReleased"/);
  assert.match(workerSource, /chrome\.debugger\.detach\(debuggee\)/);
});

test("rejects stale or moved visual contexts before clicking", () => {
  assert.match(workerSource, /COORDINATE_CLICK_MAX_AGE_MS = 30_000/);
  assert.match(workerSource, /message\.contextId !== context\.contextId/);
  assert.match(contentSource, /function validCoordinateClickContext\(context\)/);
  assert.match(contentSource, /viewport\.scrollX[\s\S]*?scrollX/);
  assert.match(contentSource, /viewport\.scrollY[\s\S]*?scrollY/);
});

test("routes only explicit grounded coordinate clicks through the executor", () => {
  assert.match(contentSource, /response\.action === "click"[\s\S]*?requestCoordinateClick/);
  assert.match(contentSource, /const reason = sensitiveReason\(target, label\)/);
  assert.match(contentSource, /type: "TARS_COORDINATE_CLICK"/);
});
