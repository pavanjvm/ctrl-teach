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

test("renders a triangle polygon from DOM and raw bounding boxes", () => {
  assert.match(contentSource, /\["rectangle",\s*"triangle",\s*"highlight",\s*"circle",\s*"underline"\]/);
  assert.match(contentSource, /points:\s*`\$\{rect\.left \+ rect\.width \/ 2\},\$\{rect\.top\} \$\{rect\.right\},\$\{rect\.bottom\} \$\{rect\.left\},\$\{rect\.bottom\}`/);
  assert.match(contentSource, /points:\s*`\$\{left \+ width \/ 2\},\$\{top\} \$\{left \+ width\},\$\{top \+ height\} \$\{left\},\$\{top \+ height\}`/);
});

test("renders a leader-line label at the grounded endpoint", () => {
  assert.match(contentSource, /leaderLabelAnchor\s*=\s*end/);
  assert.match(contentSource, /x:\s*leaderLabelAnchor\.x \+ 8/);
  assert.match(contentSource, /text\.textContent\s*=\s*leaderLabel/);
});

test("shows a bottom-right notice when Sol misses batch coordinates", () => {
  assert.match(contentSource, /coordinate_source === "sol_missing"/);
  assert.match(contentSource, /Sol missed \$\{named\}; annotation skipped/);
  assert.match(contentSource, /setStatus\([^\n]+true, 5000\)/);
});

test("removes a provisional annotation without rendering a replacement", () => {
  const stableIdRemoval = contentSource.indexOf('child.getAttribute("data-annotation-id") === annotationId');
  const removalResponse = contentSource.indexOf("if (response.remove === true) return;", stableIdRemoval);
  const annotationCreation = contentSource.indexOf('const annotationGroup = svgElement("g"', stableIdRemoval);

  assert.ok(stableIdRemoval >= 0);
  assert.ok(removalResponse > stableIdRemoval);
  assert.ok(annotationCreation > removalResponse);
});
