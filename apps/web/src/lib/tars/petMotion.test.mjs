import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseLaunchSide,
  chooseNearbyPerch,
  clampPerch,
  rocketBezierFrame,
  rocketFlightDuration,
  shoulderPoint,
} from "./petMotion.ts";

test("selects the target-facing hand and preserves fixed shoulder geometry", () => {
  const perch = { x: 320, y: 240 };
  assert.equal(chooseLaunchSide(perch, { x: 100, y: 200 }), "left");
  assert.equal(chooseLaunchSide(perch, { x: 600, y: 200 }), "right");
  assert.deepEqual(shoulderPoint(perch, "left"), { x: 302, y: 245 });
  assert.deepEqual(shoulderPoint(perch, "right"), { x: 338, y: 245 });
});

test("lands the fingertip at the exact target after a shallow arc", () => {
  const from = { x: 120, y: 420 };
  const to = { x: 760, y: 160 };
  const middle = rocketBezierFrame(from, to, 0.5);
  const landed = rocketBezierFrame(from, to, 1);
  assert.ok(middle.y < (from.y + to.y) / 2);
  assert.equal(landed.x, to.x);
  assert.equal(landed.y, to.y);
  assert.ok(Number.isFinite(landed.rotation));
});

test("clamps motion budgets and viewport perches", () => {
  assert.equal(rocketFlightDuration({ x: 0, y: 0 }, { x: 10, y: 0 }), 600);
  assert.equal(rocketFlightDuration({ x: 0, y: 0 }, { x: 2000, y: 0 }), 1250);
  assert.equal(rocketFlightDuration({ x: 0, y: 0 }, { x: 10, y: 0 }, true), 500);
  assert.equal(rocketFlightDuration({ x: 0, y: 0 }, { x: 2000, y: 0 }, true), 1000);
  assert.deepEqual(clampPerch({ x: 0, y: 900 }, { width: 800, height: 600 }), { x: 50, y: 552 });
});

test("whitespace roaming keeps trying after an unsafe candidate", () => {
  let attempts = 0;
  const next = chooseNearbyPerch(
    { x: 400, y: 300 },
    { x: 400, y: 300 },
    { width: 800, height: 600 },
    () => ++attempts > 1,
    () => 0,
  );
  assert.ok(next);
  assert.equal(attempts, 2);
});
