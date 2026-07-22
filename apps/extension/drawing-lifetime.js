(function initTarsDrawingLifetime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TarsDrawingLifetime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTarsDrawingLifetimeApi() {
  "use strict";

  function createDrawingLifetimeGate(onExpire, options = {}) {
    const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 6000;
    const schedule = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    let timer = null;
    let active = false;
    let hasDrawing = false;

    function cancelTimer() {
      if (timer !== null) cancel(timer);
      timer = null;
    }

    function scheduleExpiry() {
      cancelTimer();
      if (active || !hasDrawing) return;
      timer = schedule(() => {
        timer = null;
        if (active || !hasDrawing) return;
        hasDrawing = false;
        onExpire();
      }, delayMs);
    }

    return {
      markDrawn() {
        hasDrawing = true;
        scheduleExpiry();
      },
      setActive(nextActive) {
        active = Boolean(nextActive);
        if (active) cancelTimer();
        else scheduleExpiry();
      },
      clear() {
        hasDrawing = false;
        cancelTimer();
      },
      snapshot() {
        return { active, hasDrawing, scheduled: timer !== null };
      },
    };
  }

  return { createDrawingLifetimeGate };
});
