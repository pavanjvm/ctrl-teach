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

  return { createPlaybackCompletionGate };
});
