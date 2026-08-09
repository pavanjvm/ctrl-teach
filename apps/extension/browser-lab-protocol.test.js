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
  assert.match(offscreenSource, /resetTranscript: Boolean\(event\.resetTranscript\)/);
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
  assert.match(contentSource, /flyAutomationCursorTo\([\s\S]*?openVisibility,[\s\S]*?"change visibility"/);
  assert.match(contentSource, /finishGithubPrivateAutomation\("handoff", true\)/);
  assert.doesNotMatch(contentSource, /automationClick\(openVisibility, "change visibility"\)/);
  assert.match(workerSource, /message\.status === "handoff"[\s\S]*?one short, natural sentence/);
  assert.match(workerSource, /Say exactly: \\"First, I'm opening repository Settings/);
  assert.match(workerSource, /Say exactly: \\"Next, I'm moving to Change visibility/);
  assert.match(contentSource, /narrateGithubPrivateAutomation\("settings"\)/);
  assert.match(contentSource, /narrateGithubPrivateAutomation\("visibility"\)/);
  assert.match(contentSource, /if \(transcriptText\) setBubble\(transcriptText\)/);
  assert.doesNotMatch(contentSource, /setBubble\(label\)/);
  assert.match(contentSource, /scrollElementForTars\(openVisibility|flyAutomationCursorTo\([\s\S]*?openVisibility/);
  assert.match(contentSource, /waitForAutomationAction\(document, visibilityPatterns, 12_000\)/);
  assert.match(contentSource, /waitForAutomationAction\(document, visibilityPatterns, 4000\)/);
  assert.match(contentSource, /scrollElementForTars\(openVisibility, "change visibility"\)/);
  assert.match(contentSource, /\{ allowScroll: false \}/);
  assert.match(contentSource, /const githubDomTools = githubDomToolsApi\.createGithubDomTools/);
  assert.match(contentSource, /Narration is presentation only/);
  assert.doesNotMatch(contentSource, /usedAnchorScroll/);
  assert.doesNotMatch(contentSource, /scrollBy\(/);
  assert.doesNotMatch(workerSource, /tabs\.update\(activeBrowserLab\.tabId, \{ url: settingsUrl \}\)/);
});

test("page mutations are serialized and duplicate GitHub automation is idempotent", () => {
  const contentSource = fs.readFileSync(
    path.join(__dirname, "content.js"),
    "utf8",
  );
  const assetsSource = fs.readFileSync(
    path.join(__dirname, "extension-assets.js"),
    "utf8",
  );
  assert.match(assetsSource, /"page-action-gate\.js"/);
  assert.match(contentSource, /pageActionGate\.begin\(/);
  assert.match(contentSource, /observationId: context\.contextId/);
  assert.match(contentSource, /pageActionGate\.abort\(claim\.token\)/);
  assert.match(contentSource, /Tars paused to avoid repeating the same action/);
  assert.match(workerSource, /if \(existing\.repositoryNameWithOwner !== observed\)/);
  assert.match(workerSource, /return \{ ok: true, working: true \}/);
});

test("the second-request GitHub action waits for spoken approval playback", () => {
  const offscreenSource = fs.readFileSync(
    path.join(__dirname, "offscreen.js"),
    "utf8",
  );
  assert.match(offscreenSource, /response\.action === "github_make_private"[\s\S]*?deferredActionCompletion\.queue\(response\)/);
  assert.match(offscreenSource, /event\.deferredAction\?\.response/);
  assert.match(offscreenSource, /deferredActionCompletion\.queue/);
  assert.match(offscreenSource, /deferredActionCompletion\.markAudioStarted/);
  assert.match(offscreenSource, /deferredActionCompletion\.drain\(\)/);
  assert.doesNotMatch(offscreenSource, /proactivePlaybackWaiter/);
});
