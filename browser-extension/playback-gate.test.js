const test = require("node:test");
const assert = require("node:assert/strict");

const { createPlaybackCompletionGate } = require("./playback-gate.js");

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
