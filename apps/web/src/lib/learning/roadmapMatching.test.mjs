import assert from "node:assert/strict";
import test from "node:test";

import { rankRoadmapsForGoal } from "./roadmapMatching.ts";
import { LEARNING_ROADMAPS } from "./roadmaps.ts";

test("ranks Cloud Architect first for the onboarding demo goal", () => {
  const matches = rankRoadmapsForGoal(LEARNING_ROADMAPS, {
    goal: "I want to become a cloud architect.",
    currentRole: "Software Engineer",
    experienceLevel: "Intermediate",
  });

  assert.equal(matches[0]?.roadmap.title, "Cloud Architect");
  assert.ok(matches[0]?.score > (matches[1]?.score ?? 0));
});

test("matches related skills without requiring the exact roadmap title", () => {
  const matches = rankRoadmapsForGoal(LEARNING_ROADMAPS, {
    goal: "I want to design secure cloud infrastructure and resilient systems",
    currentRole: "Software Engineer",
    experienceLevel: "Intermediate",
  });

  assert.equal(matches[0]?.roadmap.title, "Cloud Architect");
});

test("returns no suitable roadmap for an unrelated goal", () => {
  const matches = rankRoadmapsForGoal(LEARNING_ROADMAPS, {
    goal: "I want to become a marine biologist",
    currentRole: "Software Engineer",
    experienceLevel: "Intermediate",
  });

  assert.deepEqual(matches, []);
});
