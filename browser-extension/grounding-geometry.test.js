const test = require("node:test");
const assert = require("node:assert/strict");

const {
  screenshotToViewportPoint,
  shouldCropFocusRegion,
} = require("./grounding-geometry.js");

test("maps native screenshot pixels into CSS viewport pixels", () => {
  assert.deepEqual(screenshotToViewportPoint({
    x: 1440,
    y: 900,
    screenshotWidth: 2880,
    screenshotHeight: 1800,
    viewportWidth: 1440,
    viewportHeight: 900,
  }), { x: 720, y: 450 });
});

test("mapping remains proportional across zoom-sized viewports", () => {
  assert.deepEqual(screenshotToViewportPoint({
    x: 960,
    y: 540,
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 720,
  }), { x: 640, y: 360 });
});

test("keeps edge targets at the edge and clamps invalid overflow", () => {
  assert.deepEqual(screenshotToViewportPoint({
    x: 1920,
    y: 1080,
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 720,
  }), { x: 1280, y: 720 });
  assert.deepEqual(screenshotToViewportPoint({
    x: -4,
    y: 1100,
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 720,
  }), { x: 0, y: 720 });
});

test("rejects unusable screenshot dimensions", () => {
  assert.equal(screenshotToViewportPoint({
    x: 10,
    y: 20,
    screenshotWidth: 0,
    screenshotHeight: 100,
    viewportWidth: 100,
    viewportHeight: 100,
  }), null);
});

test("does not crop static images", () => {
  assert.equal(shouldCropFocusRegion({ kind: "img", rect: { width: 600, height: 400 } }), false);
  assert.equal(shouldCropFocusRegion({ kind: "image", rect: { width: 600, height: 400 } }), false);
  assert.equal(shouldCropFocusRegion({ kind: "canvas", rect: { width: 600, height: 400 } }), true);
  assert.equal(shouldCropFocusRegion(null), false);
});
