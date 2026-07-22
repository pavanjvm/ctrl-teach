const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyCtrlGesture,
  scaleCtrlGesture,
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

test("scales Ctrl gesture and nearest DOM geometry into screenshot pixels", () => {
  assert.deepEqual(scaleCtrlGesture({
    type: "circle",
    x: 10,
    y: 20,
    end_x: 50,
    end_y: 80,
    nearestElement: {
      text: "target",
      rect: { x: 8, y: 16, width: 30, height: 12 },
    },
  }, 2, 1.5), {
    type: "circle",
    x: 20,
    y: 30,
    end_x: 100,
    end_y: 120,
    nearestElement: {
      text: "target",
      rect: { x: 16, y: 24, width: 60, height: 18 },
    },
  });
});

test("classifies a short Ctrl trail as a point", () => {
  assert.deepEqual(classifyCtrlGesture([{ x: 12, y: 18 }]), {
    gesture: { type: "point", x: 12, y: 18, label: "pointed region" },
    referencePoint: { x: 12, y: 18 },
  });
});

test("classifies a wide Ctrl trail as an underline", () => {
  const result = classifyCtrlGesture([
    { x: 10, y: 52 },
    { x: 55, y: 50 },
    { x: 120, y: 53 },
  ]);

  assert.equal(result.gesture.type, "underline");
  assert.deepEqual(result.gesture, {
    type: "underline",
    x: 10,
    y: 52,
    end_x: 120,
    end_y: 53,
    label: "underlined region",
  });
});

test("classifies a closed Ctrl trail as a circle", () => {
  const points = Array.from({ length: 17 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return { x: 80 + Math.cos(angle) * 30, y: 90 + Math.sin(angle) * 30 };
  });
  const result = classifyCtrlGesture(points);

  assert.equal(result.gesture.type, "circle");
  assert.deepEqual(result.referencePoint, { x: 80, y: 90 });
});

test("classifies an open two-dimensional Ctrl trail as a region", () => {
  const result = classifyCtrlGesture([
    { x: 10, y: 10 },
    { x: 10, y: 55 },
    { x: 40, y: 55 },
  ]);

  assert.equal(result.gesture.type, "region");
  assert.deepEqual(result.referencePoint, { x: 25, y: 32.5 });
});
