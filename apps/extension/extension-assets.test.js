const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CONTENT_SCRIPT_FILES,
  normalizeAppOrigin,
  parseExtensionEnv,
  isCtrlTeachAppOrigin,
} = require("./extension-assets.js");

test("manual recovery injects the same ordered content bundle as the manifest", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.content_scripts[0].js, [...CONTENT_SCRIPT_FILES]);
});

test("every recovery content-script asset exists", () => {
  for (const asset of CONTENT_SCRIPT_FILES) {
    assert.equal(fs.existsSync(path.join(__dirname, asset)), true, asset);
  }
});

test("extension environment supplies the exact trusted frontend origin", () => {
  const environment = parseExtensionEnv(`
    # Ctrl+Teach extension configuration
    export CTRLTEACH_FRONTEND_URL="http://localhost:4317"
  `);
  assert.equal(environment.CTRLTEACH_FRONTEND_URL, "http://localhost:4317");
  assert.equal(isCtrlTeachAppOrigin("http://localhost:4317/library", environment.CTRLTEACH_FRONTEND_URL), true);
  assert.equal(isCtrlTeachAppOrigin("http://localhost:6553/library", environment.CTRLTEACH_FRONTEND_URL), false);
  assert.equal(isCtrlTeachAppOrigin("https://example.com", environment.CTRLTEACH_FRONTEND_URL), false);
  assert.equal(normalizeAppOrigin("https://learn.example.com/path"), "https://learn.example.com");
});

test("deployed app trust is loaded from the ignored extension env file", () => {
  const workerSource = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.equal(fs.existsSync(path.join(__dirname, ".env.example")), true);
  assert.match(workerSource, /chrome\.runtime\.getURL\("\.env"\)/);
  assert.match(workerSource, /CTRLTEACH_FRONTEND_URL/);
  assert.match(contentSource, /TARS_TRUST_CHECK/);
  assert.doesNotMatch(workerSource, /TARS_SET_APP_ORIGIN/);
  assert.doesNotMatch(workerSource, /localhost:\d+/);
  assert.doesNotMatch(contentSource, /localhost:\d+/);
});
