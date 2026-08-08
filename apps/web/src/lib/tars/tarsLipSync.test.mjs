import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const assistantSource = fs.readFileSync(
  path.join(directory, "../../components/tars/GlobalTarsAssistant.tsx"),
  "utf8",
);
const audioSource = fs.readFileSync(path.join(directory, "../../hooks/useAudio.ts"), "utf8");

test("the web pet speaks only while scheduled audio is playing", () => {
  assert.match(
    assistantSource,
    /setMode\(audioHook\.isPlaying \? "speaking" : "idle"\)/,
  );
  assert.doesNotMatch(
    assistantSource,
    /last\.role === "agent"[\s\S]{0,140}setMode\("speaking"\)/,
  );
  assert.match(assistantSource, /onInterrupt:[\s\S]{0,160}audioHook\.clearPlayback\(\)[\s\S]{0,100}setMode\("idle"\)/);
});

test("playback becomes idle only after the scheduled source queue drains", () => {
  assert.match(audioSource, /source\.onended = \(\) => \{[\s\S]*?playerSourcesRef\.current\.delete\(source\)/);
  assert.match(audioSource, /if \(playerSourcesRef\.current\.size === 0\) schedulePlaybackIdleCheck\(\)/);
  assert.match(audioSource, /setIsPlaying\(false\)/);
});
