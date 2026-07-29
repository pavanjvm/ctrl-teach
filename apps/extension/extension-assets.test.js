const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CONTENT_SCRIPT_FILES,
  normalizeAppOrigin,
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

test("development app origins accept loopback hosts without fixed ports", () => {
  assert.equal(isCtrlTeachAppOrigin("http://localhost:4317/library?create=1"), true);
  assert.equal(isCtrlTeachAppOrigin("http://localhost:6553/library?create=1"), true);
  assert.equal(isCtrlTeachAppOrigin("http://127.0.0.1:8123/learn/course"), true);
  assert.equal(isCtrlTeachAppOrigin("http://[::1]:9021/dashboard"), true);
  assert.equal(isCtrlTeachAppOrigin("https://learn.example.com", ["https://learn.example.com/app"]), true);
  assert.equal(isCtrlTeachAppOrigin("https://example.com"), false);
  assert.equal(normalizeAppOrigin("https://learn.example.com/path"), "https://learn.example.com");
});

test("deployed app trust is loaded from extension storage", () => {
  const workerSource = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(workerSource, /TRUSTED_APP_ORIGINS_KEY/);
  assert.match(workerSource, /TARS_SET_APP_ORIGIN/);
  assert.match(contentSource, /TARS_TRUST_CHECK/);
  assert.doesNotMatch(workerSource, /localhost:\d+/);
  assert.doesNotMatch(contentSource, /localhost:\d+/);
});
