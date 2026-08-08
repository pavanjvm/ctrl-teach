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
    /activeBrowserLab\.phase\s*=\s*"cleanup";[\s\S]*?await recordLabEvent\("cleanup_started",\s*\{\}\)/,
  );
});

test("active browser labs survive service-worker suspension", () => {
  assert.match(workerSource, /ACTIVE_BROWSER_LAB_KEY/);
  assert.match(workerSource, /observedAssertionIds:\s*new Set\(savedLab\.observedAssertionIds/);
  assert.match(workerSource, /policyViolationCodes:\s*new Set\(savedLab\.policyViolationCodes/);
  assert.match(workerSource, /async function persistActiveBrowserLab\(\)/);
  assert.match(workerSource, /await persistActiveBrowserLab\(\);/);
});

test("voice turns carry the active lab attempt into realtime context", () => {
  assert.match(
    workerSource,
    /const labAttemptId = activeBrowserLab\?\.tabId === tabId[\s\S]*?type: "TARS_PTT_CONTEXT",[\s\S]*?labAttemptId,/,
  );
  const offscreenSource = fs.readFileSync(
    path.join(__dirname, "offscreen.js"),
    "utf8",
  );
  assert.match(
    offscreenSource,
    /type: "tars_screen",[\s\S]*?labAttemptId: String\(turn\.labAttemptId \|\| ""\)/,
  );
});

test("a created Public repository triggers corrective lab coaching", () => {
  const contentSource = fs.readFileSync(
    path.join(__dirname, "content.js"),
    "utf8",
  );
  assert.match(
    contentSource,
    /state\.repositoryCreated && state\.repositoryVisibility === "public"[\s\S]*?reportGitHubPublicSelection\("public_repository_created"\)/,
  );
  assert.match(
    workerSource,
    /reason === "public_repository_created"[\s\S]*?Oops—you created this repository as Public instead of Private/,
  );
  assert.match(workerSource, /do not say 'the lab is not complete/i);
  assert.match(workerSource, /`\$\{message\.code\}:repository_created`/);
  assert.match(workerSource, /legacyCreatedViolation/);
  assert.match(workerSource, /repositoryCreatedViolation && firstViolation/);
});

test("verified Private completion has exactly one spoken response", () => {
  assert.match(
    workerSource,
    /repositoryVisibility === "private"[\s\S]*?repositoryCreated !== true[\s\S]*?!activeBrowserLab\.verified[\s\S]*?That's Private now/,
  );
});

test("spoken lab guidance has one transcript source", () => {
  assert.match(workerSource, /if \(!spokenInstruction\) \{[\s\S]*?type: "TARS_LAB_COACH"/);
  assert.match(workerSource, /type: "TARS_PROACTIVE_TEXT"/);
  const offscreenSource = fs.readFileSync(
    path.join(__dirname, "offscreen.js"),
    "utf8",
  );
  assert.match(offscreenSource, /append: !event\.outputTranscription\.finished/);
  assert.match(offscreenSource, /transcriptOnly: true/);
  assert.match(offscreenSource, /resetTranscript: true/);
  const contentSource = fs.readFileSync(
    path.join(__dirname, "content.js"),
    "utf8",
  );
  assert.match(contentSource, /message\.mode === "speaking" && message\.finished/);
  assert.match(contentSource, /function mergeTranscriptText\(current, incoming\)/);
  assert.match(contentSource, /normalizedNext === normalizedExisting/);
  assert.match(contentSource, /transcriptReplayCandidate/);
  assert.match(contentSource, /transcriptReplaySuppressed = true/);
  assert.match(contentSource, /mergeTranscriptText\(transcriptText, message\.text\)/);
  assert.match(offscreenSource, /scheduledPcmChunks\.has\(part\.inlineData\.data\)/);
});

test("the repeated-request exception stays scoped to the observed lab repository", () => {
  const contentSource = fs.readFileSync(
    path.join(__dirname, "content.js"),
    "utf8",
  );
  assert.match(workerSource, /action === "github_make_private"/);
  assert.match(workerSource, /requested !== observed/);
  assert.match(workerSource, /githubPrivateAutomation/);
  assert.doesNotMatch(workerSource, /Say exactly:.*okay, only this time/);
  assert.match(contentSource, /location\.pathname !== `\/\$\{repositoryNwo\}\/settings`/);
  assert.match(contentSource, /TARS_GITHUB_PRIVATE_AUTOMATION_RESULT/);
  assert.match(contentSource, /checkedGitHubVisibility\(\) === "private"/);
  assert.match(contentSource, /flyAutomationCursorTo/);
  assert.match(contentSource, /automationClick\(settingsLink, "repository settings"\)/);
  assert.match(contentSource, /flyAutomationCursorTo\(openVisibility, "change visibility"\)/);
  assert.match(contentSource, /finishGithubPrivateAutomation\("handoff", true\)/);
  assert.doesNotMatch(contentSource, /automationClick\(openVisibility, "change visibility"\)/);
  assert.match(workerSource, /message\.status === "handoff"[\s\S]*?one short, natural sentence/);
  assert.doesNotMatch(workerSource, /say exactly|speak exactly|exactly this/i);
  assert.match(contentSource, /Let Realtime begin narrating before the first visible cursor action/);
  assert.match(contentSource, /if \(transcriptText\) setBubble\(transcriptText\)/);
  assert.doesNotMatch(contentSource, /setBubble\(label\)/);
  assert.match(contentSource, /scrollBy\(\{ top: Math\.max\(420, innerHeight \* 0\.72\), behavior: "smooth" \}\)/);
  assert.doesNotMatch(workerSource, /tabs\.update\(activeBrowserLab\.tabId, \{ url: settingsUrl \}\)/);
});
