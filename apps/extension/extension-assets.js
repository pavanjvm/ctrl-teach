(function initTarsExtensionAssets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TarsExtensionAssets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTarsExtensionAssets() {
  "use strict";

  const CONTENT_SCRIPT_FILES = Object.freeze([
    "grounding-geometry.js",
    "drawing-lifetime.js",
    "content.js",
  ]);

  function normalizeAppOrigin(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.origin;
    } catch {
      return "";
    }
  }

  function parseExtensionEnv(source) {
    const values = {};
    for (const rawLine of String(source || "").split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("export ")) line = line.slice(7).trim();
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let value = line.slice(separator + 1).trim();
      if (
        value.length >= 2
        && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
    return values;
  }

  function isCtrlTeachAppOrigin(value, configuredOrigins = []) {
    const origin = normalizeAppOrigin(value);
    if (!origin) return false;
    const allowed = Array.isArray(configuredOrigins) ? configuredOrigins : [configuredOrigins];
    return allowed.some((configured) => normalizeAppOrigin(configured) === origin);
  }

  return { CONTENT_SCRIPT_FILES, normalizeAppOrigin, parseExtensionEnv, isCtrlTeachAppOrigin };
});
