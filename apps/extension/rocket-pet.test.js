const test = require("node:test");
const assert = require("node:assert/strict");

const pet = require("./rocket-pet.js");

test("chooses and docks the hand on the target-facing side", () => {
  const perch = { x: 400, y: 300 };
  assert.equal(pet.chooseLaunchSide(perch, { x: 120, y: 100 }), "left");
  assert.equal(pet.chooseLaunchSide(perch, { x: 700, y: 100 }), "right");
  assert.deepEqual(pet.shoulderPoint(perch, "left"), { x: 382, y: 305 });
  assert.deepEqual(pet.shoulderPoint(perch, "right"), { x: 418, y: 305 });
});

test("rocket flight begins and ends at exact coordinates", () => {
  const from = { x: 100, y: 200 };
  const to = { x: 700, y: 500 };
  assert.deepEqual(pet.bezierFrame(from, to, 0), { x: 100, y: 200, rotation: pet.bezierFrame(from, to, 0).rotation });
  const landed = pet.bezierFrame(from, to, 1);
  assert.equal(landed.x, to.x);
  assert.equal(landed.y, to.y);
  assert.ok(Number.isFinite(landed.rotation));
});

test("flight timing stays within the rocket and return budgets", () => {
  assert.equal(pet.flightDuration({ x: 0, y: 0 }, { x: 10, y: 0 }), 600);
  assert.equal(pet.flightDuration({ x: 0, y: 0 }, { x: 2000, y: 0 }), 1250);
  assert.equal(pet.flightDuration({ x: 0, y: 0 }, { x: 10, y: 0 }, true), 500);
  assert.equal(pet.flightDuration({ x: 0, y: 0 }, { x: 2000, y: 0 }, true), 1000);
});

test("perches stay inside the viewport and skip unsafe candidates", () => {
  assert.deepEqual(
    pet.clampPerch({ x: -20, y: 900 }, { width: 800, height: 600 }),
    { x: 50, y: 552 },
  );
  let attempts = 0;
  const next = pet.chooseNearbyPerch(
    { x: 400, y: 300 },
    { x: 400, y: 300 },
    { width: 800, height: 600 },
    () => ++attempts > 1,
    () => 0,
  );
  assert.ok(next);
  assert.equal(attempts, 2);
});
