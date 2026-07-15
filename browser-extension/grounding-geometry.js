(function initTarsGroundingGeometry(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TarsGroundingGeometry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTarsGroundingGeometry() {
  "use strict";

  function screenshotToViewportPoint({
    x,
    y,
    screenshotWidth,
    screenshotHeight,
    viewportWidth,
    viewportHeight,
  }) {
    if (![x, y, screenshotWidth, screenshotHeight, viewportWidth, viewportHeight].every(Number.isFinite)) {
      return null;
    }
    if (screenshotWidth <= 0 || screenshotHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(viewportWidth, (x / screenshotWidth) * viewportWidth)),
      y: Math.max(0, Math.min(viewportHeight, (y / screenshotHeight) * viewportHeight)),
    };
  }

  function shouldCropFocusRegion(region) {
    const kind = String(region?.kind || "").toLowerCase();
    return Boolean(region?.rect) && kind !== "img" && kind !== "image";
  }

  return { screenshotToViewportPoint, shouldCropFocusRegion };
});
