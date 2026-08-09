const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDeferredActionGate,
  createPlaybackCompletionGate,
} = require("./playback-gate.js");

test("waits for scheduled audio sources to finish", () => {
  let drained = 0;
  const gate = createPlaybackCompletionGate(() => { drained += 1; });
  gate.beginScheduling();
  gate.sourceScheduled();
  gate.markTurnComplete();
  assert.equal(drained, 0);
  gate.sourceEnded();
  assert.equal(drained, 1);
});

test("waits while asynchronous PCM scheduling is still pending", () => {
  let drained = 0;
  const gate = createPlaybackCompletionGate(() => { drained += 1; });
  gate.beginScheduling();
  gate.markTurnComplete();
  assert.equal(drained, 0);
  gate.sourceScheduled();
  assert.equal(drained, 0);
  gate.sourceEnded();
  assert.equal(drained, 1);
});

test("completes silent and failed-audio turns", () => {
  let drained = 0;
  const gate = createPlaybackCompletionGate(() => { drained += 1; });
  gate.markTurnComplete();
  assert.equal(drained, 1);

  gate.beginScheduling();
  gate.markTurnComplete();
  gate.schedulingFailed();
  assert.equal(drained, 2);
});

test("reset prevents interrupted playback from completing an old turn", () => {
  let drained = 0;
  const gate = createPlaybackCompletionGate(() => { drained += 1; });
  gate.beginScheduling();
  gate.sourceScheduled();
  gate.markTurnComplete();
  gate.reset();
  gate.sourceEnded();
  assert.equal(drained, 0);
  assert.deepEqual(gate.snapshot(), { scheduling: 0, active: 0, turnComplete: false });
});

test("dispatches a deferred action only after its spoken turn drains", () => {
  const dispatched = [];
  const gate = createDeferredActionGate((action) => dispatched.push(action));
  gate.markAudioStarted();
  gate.queue({ action: "github_make_private" });
  assert.deepEqual(dispatched, []);
  assert.equal(gate.drain(), true);
  assert.deepEqual(dispatched, [{ action: "github_make_private" }]);
});

test("never dispatches a deferred action for silent or interrupted approval", () => {
  const dispatched = [];
  const gate = createDeferredActionGate((action) => dispatched.push(action));
  gate.queue({ action: "github_make_private" });
  assert.equal(gate.drain(), false);
  gate.markAudioStarted();
  gate.queue({ action: "github_make_private" });
  gate.reset();
  assert.equal(gate.drain(), false);
  assert.deepEqual(dispatched, []);
});
