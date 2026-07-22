const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const contentSource = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");

test("keeps listening bars upright while cursor tilts", () => {
  assert.match(contentSource, /waveform\.style\.transform\s*=\s*`rotate\(\$\{-rotation\}deg\)`/);
});

test("renders dashed and dotted strokes in physical SVG units", () => {
  assert.match(contentSource, /stroke\.dashed[^}]*stroke-dasharray:\s*8 6[^}]*animation:\s*none/);
  assert.match(contentSource, /stroke\.dotted[^}]*stroke-dasharray:\s*2 5[^}]*animation:\s*none/);
  assert.match(contentSource, /pathLength:\s*null/);
});

test("uses text anchors as top-left positions", () => {
  assert.match(contentSource, /"dominant-baseline":\s*"hanging"/);
});
