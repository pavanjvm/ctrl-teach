(function initTarsExtensionAssets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TarsExtensionAssets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTarsExtensionAssets() {
  "use strict";

  const CONTENT_SCRIPT_FILES = Object.freeze([
    "grounding-geometry.js",
    "drawing-lifetime.js",
    "github-lab.js",
    "rocket-pet.js",
    "content.js",
  ]);

  return { CONTENT_SCRIPT_FILES };
});
