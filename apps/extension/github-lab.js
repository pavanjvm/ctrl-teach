(function initCtrlTeachGitHubLab(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CtrlTeachGitHubLab = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGitHubLabRules() {
  "use strict";

  const PRIVATE_REPOSITORY_WORKFLOW = "github_create_private_repository";

  function cleanLearnerName(value = "") {
    let raw = String(value || "").trim();
    if (raw.includes("@")) raw = raw.split("@", 1)[0].replace(/[._-]+/g, " ");
    const clean = raw
      .replace(/[^\p{L}\p{N} .'-]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    return clean.split(" ", 1)[0].slice(0, 40);
  }

  function openingGuidance(learnerName = "") {
    const name = cleanLearnerName(learnerName);
    const greeting = name ? `Hello, ${name}.` : "Hello.";
    const bubbleText = `${greeting} Create a new GitHub repository with a unique name and Private visibility.`;
    return {
      bubbleText,
      spokenInstruction: `Greet ${name || "the learner"} briefly and naturally, then tell them to create a new GitHub repository with a unique name and Private visibility. Keep it to one short sentence. Do not introduce yourself, name Tars, describe monitoring or verification, use canned wording, or ask an open-ended question.`,
    };
  }

  function normalize(value = "") {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function visibilityFromSignal(signal = {}) {
    if (signal.selected === false) return "";
    const text = normalize([
      signal.value,
      signal.label,
      signal.text,
      signal.ancestorText,
    ].filter(Boolean).join(" "));
    if (/\bprivate\b/.test(text)) return "private";
    if (/\bpublic\b/.test(text)) return "public";
    return "";
  }

  function isCreateRepositoryAction(value = "") {
    return /\bcreate\s+(?:a\s+)?repository\b/.test(normalize(value));
  }

  function shouldBlockCreate({ workflow, hostname, visibility, actionText } = {}) {
    return workflow === PRIVATE_REPOSITORY_WORKFLOW
      && normalize(hostname) === "github.com"
      && visibility === "public"
      && isCreateRepositoryAction(actionText);
  }

  function repositoryState({ hostname, pathname, repositoryId, repositoryNwo, visibility } = {}) {
    const host = normalize(hostname);
    const path = String(pathname || "");
    const isGitHub = host === "github.com";
    const isCreatePage = isGitHub && (path === "/new" || /\/repositories\/new\/?$/.test(path));
    const repositoryCreated = Boolean(
      isGitHub
      && !isCreatePage
      && String(repositoryId || "").trim()
      && String(repositoryNwo || "").includes("/"),
    );
    return {
      pageKind: isCreatePage ? "github_new_repository" : repositoryCreated ? "github_repository" : "github_other",
      repositoryCreated,
      repositoryVisibility: visibility || "unknown",
      repositoryNameWithOwner: repositoryCreated ? String(repositoryNwo || "").slice(0, 180) : "",
    };
  }

  return {
    PRIVATE_REPOSITORY_WORKFLOW,
    cleanLearnerName,
    isCreateRepositoryAction,
    openingGuidance,
    repositoryState,
    shouldBlockCreate,
    visibilityFromSignal,
  };
});
