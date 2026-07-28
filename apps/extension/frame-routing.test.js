const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
const contentSource = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
const workerSource = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");

test("injects the frame relay into embedded and inherited-origin frames", () => {
  const script = manifest.content_scripts[0];
  assert.equal(script.all_frames, true);
  assert.equal(script.match_about_blank, true);
  assert.equal(script.match_origin_as_fallback, true);
});

test("keeps the visual overlay in the top frame and relays child input", () => {
  assert.match(contentSource, /const IS_TOP_FRAME = window === window\.top/);
  assert.match(contentSource, /if \(!IS_TOP_FRAME\) \{[\s\S]*?postFrameInput\("pointer", frameMouse\)/);
  assert.match(contentSource, /if \(!IS_TOP_FRAME\) \{[\s\S]*?return;\s*\}/);
  assert.match(contentSource, /event\.source === window/);
  assert.match(contentSource, /frame\.contentWindow === source/);
});

test("rediscovers dynamically mounted frames below open shadow roots", () => {
  assert.match(contentSource, /function findChildFrame\(root, source\)/);
  assert.match(contentSource, /element\.shadowRoot/);
  assert.match(contentSource, /findChildFrame\(element\.shadowRoot, source\)/);
  assert.match(contentSource, /cached\?\.isConnected/);
});

test("rebinds accessible frame windows when an SPA replaces their document", () => {
  assert.match(contentSource, /existing\?\.window === childWindow && existing\?\.document === childDocument/);
  assert.match(contentSource, /frame\.addEventListener\("load", nextWatcher\.load, true\)/);
  assert.match(contentSource, /new MutationObserver/);
  assert.match(contentSource, /setInterval\(refreshDirectFrameBindings, 750\)/);
  assert.match(contentSource, /directFramePoint\(frameChain, childWindow, frameMouse\)/);
});

test("only trusted mouse and Control-key events enter the frame relay", () => {
  assert.match(contentSource, /window\.addEventListener\("mousemove", \(event\) => \{\s*if \(!event\.isTrusted\) return;/);
  assert.match(contentSource, /!event\.isTrusted\s*\|\|\s*event\.key !== "Control"/);
});

test("refreshes extension state when a page is restored or revisited", () => {
  assert.match(contentSource, /window\.addEventListener\("pageshow"[\s\S]*?event\.persisted[\s\S]*?refreshExtensionState/);
  assert.match(contentSource, /document\.addEventListener\("visibilitychange"[\s\S]*?document\.visibilityState === "visible"[\s\S]*?refreshExtensionState/);
});

test("extension reload reinjects Tars into every open normal tab", () => {
  assert.match(workerSource, /const tabs = await chrome\.tabs\.query\(\{\}\)/);
  assert.match(workerSource, /tabs\.filter\(\(tab\) => isNormalPage\(tab\.url \|\| ""\)\)/);
  assert.match(workerSource, /Promise\.all\(normalTabs\.map\(\(tab\) => publishState\(tab\.id\)\)\)/);
});

test("stale content scripts fail quietly while a fresh bundle is injected", () => {
  assert.match(contentSource, /function runtimeSend\(message\)/);
  assert.match(contentSource, /Promise\.resolve\(chrome\.runtime\.sendMessage\(message\)\)\.catch\(\(\) => null\)/);
});

test("manual recovery reinjects the complete bundle into every frame", () => {
  const allFrameTargets = workerSource.match(/target:\s*\{\s*tabId,\s*allFrames:\s*true\s*\}/g) || [];
  assert.equal(allFrameTargets.length, 2);
});
