const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const contentSource = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
const offscreenSource = fs.readFileSync(path.join(__dirname, "offscreen.js"), "utf8");

test("shows one large front-layer ear while listening and a hand-on-chin thinking pose", () => {
  const bodyIndex = contentSource.indexOf('id="pet-body-shape"');
  const earIndex = contentSource.indexOf('id="pet-ear"');
  assert.match(contentSource, /id="pet-ear"/);
  assert.ok(bodyIndex >= 0 && earIndex > bodyIndex);
  assert.match(contentSource, /#cursor\[data-mode="listening"\] #pet-ear \{ opacity: 1;/);
  assert.doesNotMatch(contentSource, /id="pet-ears"|id="ear-ripple"/);
  assert.match(contentSource, /#cursor\[data-mode="speaking"\] #pet-speaking-mouth \{ opacity: 1;/);
  assert.match(contentSource, /#cursor\[data-mode="thinking"\] #thought \{ opacity: 1;/);
  assert.match(contentSource, /id="thinking-hand"/);
  assert.match(contentSource, /#cursor\[data-mode="thinking"\]\[data-gesture="perched"\] #thinking-hand/);
  assert.doesNotMatch(contentSource, /id="ring"/);
  assert.doesNotMatch(contentSource, /id="waveform"/);
});

test("drives lip sync only from physical audio playback", () => {
  assert.match(offscreenSource, /mode: "speaking", playbackActive: true/);
  assert.match(offscreenSource, /mode: "idle",\s*playbackActive: false/);
  assert.match(offscreenSource, /transcriptOnly: true/);
  assert.match(contentSource, /message\.mode !== "speaking" \|\| message\.playbackActive === true/);
  assert.match(contentSource, /setMode\("thinking"\);[\s\S]*?function showLabCoach|function showLabCoach[\s\S]*?setMode\("thinking"\);/);
});

test("launches a detached hand and fires clicks only after landing", () => {
  assert.match(contentSource, /id="rocket-hand"/);
  assert.match(contentSource, /setRocketGesture\("point", rocketSide\);/);
  assert.match(contentSource, /options\.onLand\?\.\(\);/);
  assert.doesNotMatch(contentSource, /setTimeout\(\(\) => maybeClick\([^\n]+750\)/);
});

test("keeps the body perched while the rocket hand receives flight transforms", () => {
  assert.match(contentSource, /rocketHand\.style\.transform\s*=\s*`translate3d/);
  assert.match(contentSource, /const from = rocketPose[\s\S]+rocketPet\.shoulderPoint\(position, rocketSide\)/);
  assert.doesNotMatch(contentSource, /transformCursor\(frame\.x,\s*frame\.y/);
});

test("makes only the pet body draggable and clamps its viewport perch", () => {
  assert.match(contentSource, /#cursor \{[^}]*pointer-events: auto;[^}]*cursor: grab;[^}]*touch-action: none;/);
  assert.match(contentSource, /cursor\.addEventListener\("pointerdown", beginPetDrag\);/);
  assert.match(contentSource, /cursor\.setPointerCapture\(event\.pointerId\);/);
  assert.match(contentSource, /rocketPet\.clampPerch\([\s\S]+event\.clientX - petDragOffset\.x/);
  assert.match(contentSource, /activePoint \|\| petDragging \|\| reducedMotionQuery\.matches/);
  assert.match(contentSource, /if \(event\.composedPath\(\)\.includes\(host\)\) return;/);
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
