const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { CONTENT_SCRIPT_FILES } = require("./extension-assets.js");

test("manual recovery injects the same ordered content bundle as the manifest", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.content_scripts[0].js, [...CONTENT_SCRIPT_FILES]);
});

test("every recovery content-script asset exists", () => {
  for (const asset of CONTENT_SCRIPT_FILES) {
    assert.equal(fs.existsSync(path.join(__dirname, asset)), true, asset);
  }
});
