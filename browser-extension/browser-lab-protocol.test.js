const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workerSource = fs.readFileSync(
  path.join(__dirname, "service-worker.js"),
  "utf8",
);

test("assertion telemetry retains the observed lab phase", () => {
  assert.match(
    workerSource,
    /postLabEvidence\("assertion_observed",\s*\{[\s\S]*?phase:\s*safePayload\.phase,[\s\S]*?\}\)/,
  );
});

test("cleanup starts with an explicit evidence boundary", () => {
  assert.match(
    workerSource,
    /activeBrowserLab\.phase\s*=\s*"cleanup";\s*await recordLabEvent\("cleanup_started",\s*\{\}\)/,
  );
});
