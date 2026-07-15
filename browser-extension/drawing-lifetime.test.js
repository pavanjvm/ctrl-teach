const test = require("node:test");
const assert = require("node:assert/strict");

const { createDrawingLifetimeGate } = require("./drawing-lifetime.js");

function fakeTimers() {
  const callbacks = new Map();
  let nextId = 1;
  return {
    setTimeout(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      callbacks.delete(id);
    },
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback());
    },
    count() {
      return callbacks.size;
    },
  };
}

test("does not expire drawings while Tars is thinking or speaking", () => {
  const timers = fakeTimers();
  let expired = 0;
  const gate = createDrawingLifetimeGate(() => { expired += 1; }, {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  gate.setActive(true);
  gate.markDrawn();
  assert.equal(timers.count(), 0);
  timers.flush();
  assert.equal(expired, 0);
});

test("starts expiry only after playback becomes idle", () => {
  const timers = fakeTimers();
  let expired = 0;
  const gate = createDrawingLifetimeGate(() => { expired += 1; }, {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  gate.setActive(true);
  gate.markDrawn();
  gate.setActive(false);
  assert.equal(timers.count(), 1);
  timers.flush();
  assert.equal(expired, 1);
});

test("a later stroke resets the idle expiry", () => {
  const timers = fakeTimers();
  let expired = 0;
  const gate = createDrawingLifetimeGate(() => { expired += 1; }, {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  gate.markDrawn();
  gate.markDrawn();
  assert.equal(timers.count(), 1);
  timers.flush();
  assert.equal(expired, 1);
});
