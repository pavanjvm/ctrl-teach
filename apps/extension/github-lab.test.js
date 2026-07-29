const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PRIVATE_REPOSITORY_WORKFLOW,
  cleanLearnerName,
  openingGuidance,
  repositoryState,
  shouldBlockCreate,
  visibilityFromSignal,
} = require("./github-lab.js");

test("opens the lab with only a personal greeting and the task", () => {
  assert.equal(cleanLearnerName("Demo Learner"), "Demo");
  assert.equal(cleanLearnerName("pavan@example.com"), "pavan");
  const guidance = openingGuidance("Demo Learner");
  assert.equal(
    guidance.bubbleText,
    "Hello, Demo. Create a new GitHub repository with a unique name and Private visibility.",
  );
  assert.doesNotMatch(guidance.bubbleText, /tars|monitor|verify|i'll|i am|i'm/i);
  assert.doesNotMatch(guidance.spokenInstruction, /say exactly|speak exactly|exactly this/i);
  assert.match(guidance.spokenInstruction, /briefly and naturally/);
  assert.match(guidance.spokenInstruction, /unique name and Private visibility/);
  assert.match(guidance.spokenInstruction, /Do not introduce yourself/);
});

test("recognizes GitHub visibility without reading free-text inputs", () => {
  assert.equal(visibilityFromSignal({ selected: true, label: "Private" }), "private");
  assert.equal(visibilityFromSignal({ selected: true, value: "public" }), "public");
  assert.equal(visibilityFromSignal({ selected: false, label: "Public" }), "");
});

test("identifies the invalid create action without treating it as completion", () => {
  assert.equal(shouldBlockCreate({
    workflow: PRIVATE_REPOSITORY_WORKFLOW,
    hostname: "github.com",
    visibility: "public",
    actionText: "Create repository",
  }), true);
  assert.equal(shouldBlockCreate({
    workflow: PRIVATE_REPOSITORY_WORKFLOW,
    hostname: "github.com",
    visibility: "private",
    actionText: "Create repository",
  }), false);
  assert.equal(shouldBlockCreate({
    workflow: PRIVATE_REPOSITORY_WORKFLOW,
    hostname: "example.com",
    visibility: "public",
    actionText: "Create repository",
  }), false);
});

test("requires GitHub repository metadata before declaring creation", () => {
  assert.deepEqual(repositoryState({
    hostname: "github.com",
    pathname: "/new",
    visibility: "private",
  }), {
    pageKind: "github_new_repository",
    repositoryCreated: false,
    repositoryVisibility: "private",
    repositoryNameWithOwner: "",
  });
  assert.deepEqual(repositoryState({
    hostname: "github.com",
    pathname: "/pavan/ctrlteach-git-lab-4821",
    repositoryId: "12345",
    repositoryNwo: "pavan/ctrlteach-git-lab-4821",
    visibility: "private",
  }), {
    pageKind: "github_repository",
    repositoryCreated: true,
    repositoryVisibility: "private",
    repositoryNameWithOwner: "pavan/ctrlteach-git-lab-4821",
  });
});
