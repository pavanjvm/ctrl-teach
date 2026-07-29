(function initTarsExtensionAssets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TarsExtensionAssets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTarsExtensionAssets() {
  "use strict";

  const CONTENT_SCRIPT_FILES = Object.freeze([
    "extension-assets.js",
    "grounding-geometry.js",
    "drawing-lifetime.js",
    "content.js",
  ]);

  const LOCAL_CTRLTEACH_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

  function normalizeAppOrigin(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.origin;
    } catch {
      return "";
    }
  }

  function isCtrlTeachAppOrigin(value, configuredOrigins = []) {
    const origin = normalizeAppOrigin(value);
    if (!origin) return false;
    const url = new URL(origin);
    if (LOCAL_CTRLTEACH_HOSTS.has(url.hostname)) return true;
    return configuredOrigins.some((configured) => normalizeAppOrigin(configured) === origin);
  }

  return { CONTENT_SCRIPT_FILES, normalizeAppOrigin, isCtrlTeachAppOrigin };
});
