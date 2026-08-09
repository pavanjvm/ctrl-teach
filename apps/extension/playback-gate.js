(function initTarsPlaybackGate(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TarsPlaybackGate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTarsPlaybackGateApi() {
  "use strict";

  function createPlaybackCompletionGate(onDrained) {
    let scheduling = 0;
    let active = 0;
    let turnComplete = false;

    function maybeDrain() {
      if (!turnComplete || scheduling > 0 || active > 0) return;
      turnComplete = false;
      onDrained();
    }

    return {
      beginScheduling() {
        scheduling += 1;
      },
      sourceScheduled() {
        scheduling = Math.max(0, scheduling - 1);
        active += 1;
        maybeDrain();
      },
      schedulingFailed() {
        scheduling = Math.max(0, scheduling - 1);
        maybeDrain();
      },
      sourceEnded() {
        active = Math.max(0, active - 1);
        maybeDrain();
      },
      markTurnComplete() {
        turnComplete = true;
        maybeDrain();
      },
      reset() {
        scheduling = 0;
        active = 0;
        turnComplete = false;
      },
      snapshot() {
        return { scheduling, active, turnComplete };
      },
    };
  }

  function createDeferredActionGate(onDispatch) {
    let pending = null;
    let audioStarted = false;

    return {
      queue(action) {
        pending = action && typeof action === "object" ? { ...action } : null;
      },
      markAudioStarted() {
        audioStarted = true;
      },
      drain() {
        const action = pending;
        const shouldDispatch = Boolean(action && audioStarted);
        pending = null;
        audioStarted = false;
        if (shouldDispatch) onDispatch(action);
        return shouldDispatch;
      },
      reset() {
        pending = null;
        audioStarted = false;
      },
      snapshot() {
        return { pending: pending ? { ...pending } : null, audioStarted };
      },
    };
  }

  return { createDeferredActionGate, createPlaybackCompletionGate };
});
