const test = require("node:test");
const assert = require("node:assert/strict");

const {
  absoluteScrollTop,
  chooseScrollCandidate,
  createActionGate,
} = require("./page-action-gate.js");

test("serializes page actions and rejects repeats from one observation", () => {
  let clock = 1000;
  const gate = createActionGate({ now: () => clock });
  const first = gate.begin({
    owner: "realtime",
    observationId: "context-1",
    actionKey: "click:settings",
    stateKey: "/repo|0",
  });
  assert.equal(first.ok, true);
  assert.equal(gate.begin({ actionKey: "scroll:down" }).reason, "busy");
  assert.equal(gate.finish(first.token, { stateKey: "/repo/settings|0" }), true);
  assert.equal(gate.begin({
    observationId: "context-1",
    actionKey: "click:settings",
    stateKey: "/repo/settings|0",
  }).reason, "duplicate_observation");
});

test("requires a quiet period before retrying the same action on unchanged state", () => {
  let clock = 1000;
  const gate = createActionGate({ now: () => clock, repeatQuietMs: 2500 });
  const first = gate.begin({ observationId: "context-1", actionKey: "click:settings", stateKey: "same" });
  gate.finish(first.token, { stateKey: "same" });
  clock += 1000;
  assert.equal(gate.begin({ observationId: "context-2", actionKey: "click:settings", stateKey: "same" }).reason, "unchanged_page");
  clock += 2000;
  assert.equal(gate.begin({ observationId: "context-2", actionKey: "click:settings", stateKey: "same" }).ok, true);
});

test("an aborted flight does not consume the observation", () => {
  const gate = createActionGate();
  const first = gate.begin({ observationId: "context-1", actionKey: "click:create" });
  assert.equal(gate.abort(first.token), true);
  assert.equal(gate.begin({ observationId: "context-1", actionKey: "click:create" }).ok, true);
});

test("chooses a label-matched semantic scroll target", () => {
  const target = chooseScrollCandidate([
    { top: 900, bottom: 940, text: "Billing", actionable: true },
    { top: 1500, bottom: 1540, text: "Developer settings", actionable: true },
    { top: 1050, bottom: 1090, text: "Danger Zone", actionable: false },
  ], { direction: "down", label: "Developer settings", viewportHeight: 800 });
  assert.equal(target.text, "Developer settings");
  assert.equal(chooseScrollCandidate([
    { top: 900, bottom: 940, text: "Billing" },
  ], { direction: "down", label: "Developer settings", viewportHeight: 800 }), null);
});

test("absolute fallback scrolling is clamped and deterministic", () => {
  assert.equal(absoluteScrollTop({ currentTop: 400, viewportHeight: 1000, scrollHeight: 3000 }), 1120);
  assert.equal(absoluteScrollTop({ currentTop: 100, viewportHeight: 1000, scrollHeight: 3000, direction: "up" }), 0);
  assert.equal(absoluteScrollTop({ currentTop: 1900, viewportHeight: 1000, scrollHeight: 2400 }), 1400);
});
