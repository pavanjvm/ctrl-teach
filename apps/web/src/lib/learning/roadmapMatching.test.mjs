import assert from "node:assert/strict";
import test from "node:test";

import { rankRoadmapsForGoal, searchRoadmaps } from "./roadmapMatching.ts";
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

test("suggests the default GitHub Administrator roadmap for github admin", () => {
  const matches = rankRoadmapsForGoal(LEARNING_ROADMAPS, {
    goal: "github admin",
    currentRole: "System Administrator",
    experienceLevel: "Intermediate",
  });

  assert.equal(matches[0]?.roadmap.id, "github-administrator");
  assert.ok(!matches[0]?.roadmap.id.startsWith("custom-"));
});

test("finds the default GitHub Administrator roadmap in catalogue search", () => {
  const matches = searchRoadmaps(LEARNING_ROADMAPS, "github admin");

  assert.equal(matches[0]?.id, "github-administrator");
});

test("starts GitHub Administrator with absolute Git and GitHub basics", () => {
  const roadmap = LEARNING_ROADMAPS.find((item) => item.id === "github-administrator");

  assert.equal(roadmap?.stages[0]?.id, "git-github-basics");
  assert.equal(
    roadmap?.stages[0]?.topics[0]?.courseIds[0],
    "platform-git-and-github-basics-for-absolute-beginners-a48cf2",
  );
});
