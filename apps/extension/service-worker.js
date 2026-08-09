importScripts("extension-assets.js", "github-lab.js");

const LOCAL_STATE_KEY = "ctrlteach_tars_extension_state";
const SESSION_TOKEN_KEY = "ctrlteach_tars_extension_token";
const ACTIVE_BROWSER_LAB_KEY = "ctrlteach_tars_active_browser_lab";
const CTRLTEACH_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

let state = {
  enabled: false,
  suspended: false,
  userId: "",
  learnerName: "",
  apiUrl: "",
  wsUrl: "",
};
let accessToken = "";
let loaded = false;
let activeTabId = null;
let latestCursor = { x: 80, y: 120 };
let currentTurn = null;
let activeContext = null;
let activeBrowserLab = null;
let micSetupOpened = false;
const coordinateClickTabs = new Set();
const COORDINATE_CLICK_MAX_AGE_MS = 30_000;

async function loadState() {
  if (loaded) return;
  const [local, session] = await Promise.all([
    chrome.storage.local.get(LOCAL_STATE_KEY),
    chrome.storage.session.get([SESSION_TOKEN_KEY, ACTIVE_BROWSER_LAB_KEY]),
  ]);
  state = { ...state, ...(local[LOCAL_STATE_KEY] || {}) };
  accessToken = session[SESSION_TOKEN_KEY] || "";
  const savedLab = session[ACTIVE_BROWSER_LAB_KEY];
  if (savedLab?.attemptId && Number.isInteger(savedLab.tabId)) {
    activeBrowserLab = {
      ...savedLab,
      observedAssertionIds: new Set(savedLab.observedAssertionIds || []),
      policyViolationCodes: new Set(savedLab.policyViolationCodes || []),
    };
  }
  loaded = true;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  activeTabId = active?.id ?? null;
}

async function persistActiveBrowserLab() {
  if (!activeBrowserLab) {
    await chrome.storage.session.remove(ACTIVE_BROWSER_LAB_KEY);
    return;
  }
  await chrome.storage.session.set({
    [ACTIVE_BROWSER_LAB_KEY]: {
      ...activeBrowserLab,
      observedAssertionIds: [...activeBrowserLab.observedAssertionIds],
      policyViolationCodes: [...activeBrowserLab.policyViolationCodes],
    },
  });
}

async function persistState() {
  await Promise.all([
    chrome.storage.local.set({ [LOCAL_STATE_KEY]: state }),
    accessToken
      ? chrome.storage.session.set({ [SESSION_TOKEN_KEY]: accessToken })
      : chrome.storage.session.remove(SESSION_TOKEN_KEY),
  ]);
}

function isNormalPage(url = "") {
  return url.startsWith("http://") || url.startsWith("https://");
}

function isTrustedBridgeSender(sender) {
  try {
    return CTRLTEACH_ORIGINS.has(new URL(sender.tab?.url || sender.url || "").origin);
  } catch {
    return false;
  }
}

async function offscreenExists() {
  if (chrome.offscreen.hasDocument) return chrome.offscreen.hasDocument();
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("offscreen.html")],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await offscreenExists()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Tars needs persistent microphone capture and response audio across tab changes.",
  });
}

async function sendToOffscreen(message) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ ...message, target: "offscreen" });
}

async function sendToTab(tabId, message) {
  if (typeof tabId !== "number") return null;
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

async function ensureContentScript(tabId) {
  if (typeof tabId !== "number") return false;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !isNormalPage(tab.url || "")) return false;
  const ready = await sendToTab(tabId, { type: "TARS_EXTENSION_PING" });
  if (ready?.ok) return true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        delete window.__ctrlTeachTarsExtensionLoaded;
        document.getElementById("ctrlteach-tars-extension")?.remove();
      },
    });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      // Recovery injection must match manifest order. content.js depends on
      // both helpers and must never be injected by itself on an existing tab.
      files: [...TarsExtensionAssets.CONTENT_SCRIPT_FILES],
    });
    const injected = await sendToTab(tabId, { type: "TARS_EXTENSION_PING" });
    return Boolean(injected?.ok);
  } catch (error) {
    console.warn("[Tars] could not inject content script", tab.url, error);
    return false;
  }
}

function publicState(tabId) {
  const ownsLab = Boolean(activeBrowserLab && activeBrowserLab.tabId === tabId);
  return {
    enabled: state.enabled && Boolean(accessToken),
    suspended: state.suspended,
    active: tabId === activeTabId,
    labActive: ownsLab,
    activeLabId: ownsLab ? activeBrowserLab?.attemptId || "" : "",
    labWorkflow: ownsLab ? activeBrowserLab?.workflow || "" : "",
    cursor: latestCursor,
  };
}

function urlHost(url = "") {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function hostAllowed(host, allowedHosts = []) {
  const clean = String(host || "").toLowerCase();
  if (!clean) return false;
  return allowedHosts.some((allowed) => {
    const item = String(allowed || "").toLowerCase();
    return clean === item || clean.endsWith(`.${item}`);
  });
}

function tokens(value = "") {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
}

function textMatches(value, blob) {
  const wanted = tokens(value).filter((token) => !["the", "and", "for", "with", "into"].includes(token));
  if (!wanted.length) return true;
  const haystack = String(blob || "").toLowerCase();
  return wanted.slice(0, 5).every((token) => haystack.includes(token));
}

function labEventText(payload = {}) {
  return [
    payload.text,
    payload.label,
    payload.role,
    payload.title,
    payload.selector,
    payload.tagName,
    payload.visibleText,
  ].filter(Boolean).join(" ");
}

function assertionMatchesEvent(assertion, kind, payload = {}) {
  const assertionKind = assertion?.kind;
  const value = String(assertion?.value || "");
  const phase = assertion?.phase || "task";
  if (phase === "cleanup" && payload.phase !== "cleanup") return false;
  if (assertionKind === "visit_host") return Boolean(payload.url && hostAllowed(urlHost(payload.url), activeBrowserLab?.allowedHosts || []));
  if (assertionKind === "url_contains") return Boolean(value && String(payload.url || "").toLowerCase().includes(value.toLowerCase()));
  if (assertionKind === "click_text") return kind === "click" && textMatches(value, labEventText(payload));
  if (assertionKind === "input_changed") return ["input", "change"].includes(kind) && textMatches(value, labEventText(payload));
  if (assertionKind === "page_text") return ["navigation", "page_snapshot"].includes(kind) && textMatches(value, labEventText(payload));
  if (assertionKind === "structured_state" && kind === "state_snapshot") {
    const [key, ...expectedParts] = value.split("=");
    if (!key || !expectedParts.length || !payload.state || typeof payload.state !== "object") return false;
    const actual = payload.state[key.trim()];
    const normalized = typeof actual === "boolean" ? String(actual) : String(actual ?? "").trim().toLowerCase();
    return normalized === expectedParts.join("=").trim().toLowerCase();
  }
  if (assertionKind === "interaction_observed") {
    return ["click", "input", "change", "navigation", "page_snapshot"].includes(kind) && textMatches(value, labEventText(payload));
  }
  return false;
}

async function postLabEvidence(kind, payload = {}) {
  if (!activeBrowserLab || !state.apiUrl || !accessToken) return null;
  const base = String(state.apiUrl).replace(/\/$/, "");
  const body = {
    clientEventId: crypto.randomUUID(),
    kind,
    payload,
  };
  try {
    const response = await fetch(`${base}/api/browser-labs/attempts/${encodeURIComponent(activeBrowserLab.attemptId)}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`lab evidence rejected (${response.status})`);
    const data = await response.json().catch(() => null);
    if (data?.attempt?.status === "verified" && activeBrowserLab && !activeBrowserLab.verified) {
      activeBrowserLab.verified = true;
      await persistActiveBrowserLab();
      await coachBrowserLab(
        activeBrowserLab.tabId,
        "Nice recovery. GitHub created the repository and its visibility is Private. Lab complete.",
        null,
        "The GitHub lab has been verified. Congratulate the learner in one short sentence. State that the repository is Private and the lab is complete.",
      );
      await publishState(activeTabId);
    }
    return data;
  } catch (error) {
    console.warn("[Tars] browser lab evidence failed", error);
    return null;
  }
}

async function recordLabEvent(kind, payload = {}) {
  if (!activeBrowserLab) return;
  const host = urlHost(payload.url || "");
  if (payload.url && !hostAllowed(host, activeBrowserLab.allowedHosts)) return;
  const safePayload = {
    ...payload,
    url: String(payload.url || "").slice(0, 2048),
    title: String(payload.title || "").slice(0, 240),
    text: String(payload.text || "").slice(0, 240),
    label: String(payload.label || "").slice(0, 240),
    role: String(payload.role || "").slice(0, 80),
    selector: String(payload.selector || "").slice(0, 180),
    tagName: String(payload.tagName || "").slice(0, 40),
    visibleText: String(payload.visibleText || "").slice(0, 700),
    phase: activeBrowserLab.phase || "task",
  };
  if (kind === "state_snapshot" && safePayload.state && typeof safePayload.state === "object") {
    const repositoryNwo = String(safePayload.state.repositoryNameWithOwner || "");
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryNwo)) {
      activeBrowserLab.repositoryNameWithOwner = repositoryNwo;
    }
    if (safePayload.state.repositoryVisibility === "private") {
      delete activeBrowserLab.githubPrivateAutomation;
    }
    await persistActiveBrowserLab();
  }
  await postLabEvidence(kind, safePayload);
  const assertions = [
    ...(activeBrowserLab.taskAssertions || []),
    ...(activeBrowserLab.cleanupAssertions || []),
  ];
  for (const assertion of assertions) {
    const assertionId = String(assertion?.id || "");
    if (!assertionId || activeBrowserLab.observedAssertionIds.has(assertionId)) continue;
    if (!assertionMatchesEvent(assertion, kind, safePayload)) continue;
    activeBrowserLab.observedAssertionIds.add(assertionId);
    await postLabEvidence("assertion_observed", {
      assertionId,
      observedKind: kind,
      url: safePayload.url,
      title: safePayload.title,
      text: safePayload.text || safePayload.label || safePayload.visibleText,
      phase: safePayload.phase,
    });
    await persistActiveBrowserLab();
  }
}

async function publishState(tabId = activeTabId) {
  if (typeof tabId !== "number") return;
  if (!await ensureContentScript(tabId)) return;
  await sendToTab(tabId, { type: "TARS_STATE", state: publicState(tabId) });
}

async function coachBrowserLab(tabId, text, targetRect = null, spokenInstruction = "") {
  if (typeof tabId !== "number") return null;
  // Spoken guidance already streams its authoritative transcript back through
  // TARS_STATUS. Never render a second hardcoded copy of spoken text.
  if (!spokenInstruction) {
    await sendToTab(tabId, {
      type: "TARS_LAB_COACH",
      text: String(text || "").slice(0, 260),
      targetRect,
    });
  }
  return sendToOffscreen({
    type: "TARS_PROACTIVE_TEXT",
    text: String(spokenInstruction || text || "").slice(0, 1600),
  });
}

async function narrateGithubPrivateAutomation(message, sender) {
  if (
    !activeBrowserLab?.githubPrivateAutomation
    || sender.tab?.id !== activeBrowserLab.tabId
  ) return { ok: false, error: "inactive_automation" };
  const stage = String(message.stage || "");
  const instructions = {
    settings: "Say exactly: \"First, I'm opening repository Settings.\" Do not add any other words and do not call a tool.",
    visibility: "Say exactly: \"Next, I'm moving to Change visibility.\" Do not add any other words and do not call a tool.",
  };
  const instruction = instructions[stage];
  if (!instruction) return { ok: false, error: "invalid_stage" };
  const result = await coachBrowserLab(
    activeBrowserLab.tabId,
    "",
    null,
    instruction,
  );
  return result?.ok ? { ok: true, narrationQueued: true } : { ok: false, error: "narration_unavailable" };
}

async function briefBrowserLab(tabId) {
  if (!activeBrowserLab || activeBrowserLab.tabId !== tabId || activeBrowserLab.briefingSent) return;
  activeBrowserLab.briefingSent = true;
  const { bubbleText, spokenInstruction } = CtrlTeachGitHubLab.openingGuidance(state.learnerName);
  await coachBrowserLab(tabId, bubbleText, null, spokenInstruction);
}

async function handleLabPolicyViolation(message, sender) {
  if (
    !activeBrowserLab
    || sender.tab?.id !== activeBrowserLab.tabId
    || message.code !== "github_repository_public"
  ) return { ok: false, error: "inactive_lab_tab" };
  const url = sender.tab?.url || message.payload?.url || "";
  if (!hostAllowed(urlHost(url), activeBrowserLab.allowedHosts)) {
    return { ok: false, error: "outside_lab_host" };
  }
  const repositoryCreatedViolation = message.payload?.reason === "public_repository_created";
  const violationKey = repositoryCreatedViolation
    ? `${message.code}:repository_created`
    : message.code;
  // Older extension builds stored the repository URL in this key. Recognize
  // that shape too so reloading during an active demo cannot replay the warning.
  const legacyCreatedViolation = repositoryCreatedViolation
    && [...activeBrowserLab.policyViolationCodes].some((code) => (
      code.startsWith(`${message.code}:http://`)
      || code.startsWith(`${message.code}:https://`)
    ));
  const firstViolation = !activeBrowserLab.policyViolationCodes.has(violationKey)
    && !legacyCreatedViolation;
  activeBrowserLab.policyViolationCodes.add(message.code);
  activeBrowserLab.policyViolationCodes.add(violationKey);
  activeBrowserLab.correctionAcknowledged = false;
  await persistActiveBrowserLab();
  await recordLabEvent("policy_violation", {
    ...(message.payload || {}),
    code: message.code,
    url,
    title: sender.tab?.title || message.payload?.title || "",
  });
  if (repositoryCreatedViolation && firstViolation) {
    await coachBrowserLab(
      activeBrowserLab.tabId,
      "Oops—you created this repository as Public instead of Private. Switch it to Private in repository Settings.",
      null,
      "The learner accidentally created the GitHub repository as Public instead of Private. In one natural sentence, begin with 'Oops' and point out that mistake. Tell them to switch it to Private in repository Settings. Do not say 'the lab is not complete,' do not congratulate them, and do not ask an open-ended question.",
    );
  } else if (firstViolation || message.payload?.reason === "blocked_submit") {
    await coachBrowserLab(
      activeBrowserLab.tabId,
      "Hold on—you selected Public. This lab requires a Private repository. Choose Private here before continuing.",
      message.payload?.targetRect || null,
      "A browser lab guard caught Public visibility before repository creation. In no more than two sentences, explain that Public would expose the repository, this lab requires Private, and tell the learner to select Private. Do not ask a question.",
    );
  }
  return { ok: true, blocked: false };
}

async function configureFromApp(config, sender) {
  if (!isTrustedBridgeSender(sender)) return { ok: false, error: "untrusted_origin" };
  const shouldSuspend = !config.enabled || Boolean(config.suspended);
  if (shouldSuspend) {
    await cancelPushToTalk("tars_suspended");
    activeContext = null;
  }
  state = {
    enabled: Boolean(config.enabled),
    suspended: Boolean(config.suspended),
    userId: String(config.userId || ""),
    learnerName: CtrlTeachGitHubLab.cleanLearnerName(config.learnerName),
    apiUrl: String(config.apiUrl || state.apiUrl || ""),
    wsUrl: String(config.wsUrl || ""),
  };
  accessToken = state.enabled ? String(config.accessToken || accessToken || "") : "";
  await persistState();

  // The tab that initiated the toggle may become active before Chrome delivers
  // tabs.onActivated to a freshly restarted service worker. Resolve it again
  // here and publish visibility before the slower offscreen/audio setup.
  const [focusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  activeTabId = focusedTab?.id ?? sender.tab?.id ?? activeTabId;
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => publishState(tab.id)));

  await ensureOffscreen();
  await sendToOffscreen({
    type: "TARS_CONFIG",
    config: { ...state, accessToken },
  });
  return {
    ok: true,
    extensionActive: state.enabled && Boolean(accessToken),
    state: publicState(sender.tab?.id),
  };
}

async function startBrowserLab(message, sender) {
  if (!isTrustedBridgeSender(sender)) return { ok: false, error: "untrusted_origin" };
  await loadState();
  if (!state.enabled || !accessToken) return { ok: false, error: "tars_disabled" };
  const lab = message.lab || {};
  const attemptId = String(message.attemptId || "");
  const launchUrl = String(message.launchUrl || lab.launchUrl || "");
  const allowedHosts = (lab.allowedHosts || []).map((host) => String(host || "").toLowerCase()).filter(Boolean);
  if (!attemptId || !launchUrl || !hostAllowed(urlHost(launchUrl), allowedHosts)) {
    return { ok: false, error: "invalid_lab" };
  }
  activeBrowserLab = {
    attemptId,
    launchUrl,
    allowedHosts,
    workflow: String(lab.workflow || ""),
    tabId: null,
    taskAssertions: lab.taskAssertions || [],
    cleanupAssertions: (lab.cleanupAssertions || []).map((assertion) => ({ ...assertion, phase: "cleanup" })),
    observedAssertionIds: new Set(),
    phase: "task",
    verified: false,
    briefingSent: false,
    correctionAcknowledged: false,
    policyViolationCodes: new Set(),
  };
  const created = await chrome.tabs.create({ url: launchUrl, active: true }).catch(() => null);
  if (!created?.id) {
    activeBrowserLab = null;
    await persistActiveBrowserLab();
    return { ok: false, error: "lab_tab_open_failed" };
  }
  activeBrowserLab.tabId = created.id;
  activeTabId = created.id;
  await persistActiveBrowserLab();
  await recordLabEvent("lab_started", {
    url: launchUrl,
    title: String(lab.objective || "Browser lab").slice(0, 240),
  });
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => publishState(tab.id)));
  return { ok: true, attemptId, state: publicState(sender.tab?.id) };
}

async function stopBrowserLab(message, sender) {
  if (!isTrustedBridgeSender(sender)) return { ok: false, error: "untrusted_origin" };
  if (activeBrowserLab && (!message.attemptId || message.attemptId === activeBrowserLab.attemptId)) {
    const labTabId = activeBrowserLab.tabId;
    await recordLabEvent("lab_stopped", {});
    await sendToTab(labTabId, { type: "TARS_LAB_ENDED" });
    activeBrowserLab = null;
    await persistActiveBrowserLab();
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => publishState(tab.id)));
  }
  return { ok: true };
}

async function markBrowserLabCleanupReady(message, sender) {
  if (!isTrustedBridgeSender(sender)) return { ok: false, error: "untrusted_origin" };
  if (activeBrowserLab && (!message.attemptId || message.attemptId === activeBrowserLab.attemptId)) {
    activeBrowserLab.phase = "cleanup";
    await persistActiveBrowserLab();
    await recordLabEvent("cleanup_started", {});
    return { ok: true, phase: "cleanup" };
  }
  return { ok: false, error: "no_active_lab" };
}

async function beginPushToTalk(tabId, trigger = "keyboard") {
  await loadState();
  if (!state.enabled || state.suspended || !accessToken || tabId !== activeTabId || currentTurn) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !isNormalPage(tab.url || "")) return;
  const contextId = crypto.randomUUID();
  currentTurn = { contextId, tabId, windowId: tab.windowId };
  await sendToTab(tabId, { type: "TARS_PREPARE_PTT", contextId, trigger });
  await sendToOffscreen({ type: "TARS_PTT_START", contextId, tabId });
  await sendToTab(tabId, { type: "TARS_MODE", mode: "listening", trigger });
}

async function cancelPushToTalk(reason = "cancelled") {
  const turn = currentTurn;
  currentTurn = null;
  if (!turn) return;
  await sendToOffscreen({ type: "TARS_PTT_CANCEL", reason });
  await sendToTab(turn.tabId, { type: "TARS_MODE", mode: "idle" });
}

function safeTabInventory(tabs) {
  return tabs
    .filter((tab) => typeof tab.id === "number" && isNormalPage(tab.url || ""))
    .slice(0, 40)
    .map((tab) => ({
      id: `tab-${tab.id}`,
      title: String(tab.title || "Untitled tab").slice(0, 180),
      url: String(tab.url || "").slice(0, 500),
      active: Boolean(tab.active),
    }));
}

async function finishPushToTalk(tabId) {
  const turn = currentTurn;
  currentTurn = null;
  if (!turn || turn.tabId !== tabId || tabId !== activeTabId) {
    if (turn) {
      await sendToOffscreen({ type: "TARS_PTT_CANCEL", reason: "tab_changed" });
      await sendToTab(turn.tabId, { type: "TARS_MODE", mode: "idle" });
    }
    return;
  }
  const speech = await sendToOffscreen({
    type: "TARS_PTT_END",
    contextId: turn.contextId,
  });
  if (!speech?.hasSpeech) {
    await sendToTab(tabId, { type: "TARS_MODE", mode: "idle" });
    return;
  }
  const context = await sendToTab(tabId, {
    type: "TARS_COLLECT_CONTEXT",
    contextId: turn.contextId,
  });
  if (!context?.ok) {
    await sendToOffscreen({ type: "TARS_PTT_CANCEL", reason: "context_unavailable" });
    await sendToTab(tabId, { type: "TARS_MODE", mode: "idle" });
    return;
  }
  let screenshotDataUrl = "";
  try {
    // Keep the exact visible-tab pixels for GPT computer-use grounding. JPEG
    // artifacts are especially damaging around tiny text, icons, and edges.
    screenshotDataUrl = await chrome.tabs.captureVisibleTab(turn.windowId, {
      format: "png",
    });
  } catch (error) {
    console.warn("[Tars] visible-tab capture failed", error);
  }
  if (!screenshotDataUrl) {
    await sendToOffscreen({ type: "TARS_PTT_CANCEL", reason: "capture_failed" });
    await sendToTab(tabId, { type: "TARS_MODE", mode: "idle" });
    return;
  }
  const tabs = await chrome.tabs.query({ windowId: turn.windowId });
  const labAttemptId = activeBrowserLab?.tabId === tabId
    ? String(activeBrowserLab.attemptId || "")
    : "";
  await sendToOffscreen({
    type: "TARS_PTT_CONTEXT",
    turn: {
      ...turn,
      capturedAt: Date.now(),
      labAttemptId,
      screenshotDataUrl,
      context: context.context,
      tabs: safeTabInventory(tabs),
    },
  });
  await sendToTab(tabId, { type: "TARS_MODE", mode: "thinking" });
}

async function routeOffscreenEvent(message) {
  if (message.type === "TARS_CONTEXT_BOUND") {
    activeContext = message.context;
    return;
  }
  if (message.type === "TARS_MIC_REQUIRED") {
    if (!micSetupOpened) {
      micSetupOpened = true;
      await chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    }
    return;
  }
  if (message.type === "TARS_STATUS") {
    await sendToTab(activeTabId, { type: "TARS_STATUS", ...message });
    return;
  }
  const context = activeContext;
  if (!context || context.tabId !== activeTabId) return;
  if (message.type === "TARS_POINT") {
    await sendToTab(context.tabId, { type: "TARS_POINT", context, response: message.response });
  } else if (message.type === "TARS_DRAW") {
    await sendToTab(context.tabId, { type: "TARS_DRAW", context, tool: message.tool, response: message.response });
  } else if (message.type === "TARS_DRAW_BATCH") {
    await sendToTab(context.tabId, { type: "TARS_DRAW_BATCH", context, tool: message.tool, responses: message.responses });
  } else if (message.type === "TARS_ACTION") {
    const action = message.response?.action;
    if (action === "activate_tab") {
      const raw = String(message.response?.targetId || "").replace(/^tab-/, "");
      const targetTabId = Number(raw);
      if (Number.isInteger(targetTabId)) await chrome.tabs.update(targetTabId, { active: true }).catch(() => undefined);
    } else if (action === "github_make_private") {
      await beginGithubPrivateAutomation(message.response || {});
    } else {
      await sendToTab(context.tabId, { type: "TARS_ACTION", context, response: message.response });
    }
  }
}

function validRepositoryNwo(value = "") {
  const clean = String(value || "").trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean) ? clean : "";
}

async function continueGithubPrivateAutomation() {
  const automation = activeBrowserLab?.githubPrivateAutomation;
  const tabId = activeBrowserLab?.tabId;
  if (!automation || typeof tabId !== "number") return;
  await sendToTab(tabId, {
    type: "TARS_GITHUB_MAKE_PRIVATE",
    repositoryNameWithOwner: automation.repositoryNameWithOwner,
  });
}

async function beginGithubPrivateAutomation(response = {}) {
  if (
    !activeBrowserLab
    || activeBrowserLab.workflow !== CtrlTeachGitHubLab.PRIVATE_REPOSITORY_WORKFLOW
    || typeof activeBrowserLab.tabId !== "number"
  ) return { ok: false, error: "inactive_github_lab" };
  const requested = validRepositoryNwo(response.repositoryNameWithOwner);
  const observed = validRepositoryNwo(activeBrowserLab.repositoryNameWithOwner);
  if (!requested || !observed || requested !== observed) {
    return { ok: false, error: "repository_mismatch" };
  }
  const existing = activeBrowserLab.githubPrivateAutomation;
  if (existing) {
    if (existing.repositoryNameWithOwner !== observed) {
      return { ok: false, error: "automation_repository_mismatch" };
    }
    if (Date.now() - Number(existing.startedAt || 0) < 60_000) {
      await continueGithubPrivateAutomation();
      return { ok: true, working: true };
    }
    delete activeBrowserLab.githubPrivateAutomation;
  }
  activeBrowserLab.githubPrivateAutomation = {
    repositoryNameWithOwner: observed,
    startedAt: Date.now(),
  };
  await persistActiveBrowserLab();
  await continueGithubPrivateAutomation();
  return { ok: true };
}

async function handleGithubPrivateAutomationResult(message, sender) {
  if (
    !activeBrowserLab?.githubPrivateAutomation
    || sender.tab?.id !== activeBrowserLab.tabId
  ) return { ok: false, error: "inactive_automation" };
  if (message.status === "private") {
    delete activeBrowserLab.githubPrivateAutomation;
    await persistActiveBrowserLab();
    return { ok: true, complete: true };
  }
  if (message.status === "handoff") {
    delete activeBrowserLab.githubPrivateAutomation;
    await persistActiveBrowserLab();
    await coachBrowserLab(
      activeBrowserLab.tabId,
      "I've marked Change visibility. Click it, choose Change to private, and finish GitHub's confirmation prompts.",
      null,
      "The Tars cursor is resting on GitHub's Change visibility button. In one short, natural sentence, tell the learner that you marked the button and ask them to click it, choose Change to private, and finish GitHub's confirmation prompts manually. Do not use canned wording, claim you clicked the button, or ask an open-ended question.",
    );
    return { ok: true, handoff: true };
  }
  if (message.status === "failed") {
    delete activeBrowserLab.githubPrivateAutomation;
    await persistActiveBrowserLab();
    await coachBrowserLab(
      activeBrowserLab.tabId,
      "I couldn't safely finish this GitHub dialog. I'll guide you through the remaining confirmation.",
      null,
      "The one-time GitHub visibility automation could not safely match the current dialog. Say in one short sentence that you will guide the learner through the remaining confirmation. Do not claim the repository is Private.",
    );
    return { ok: false, error: "automation_failed" };
  }
  return { ok: true, working: true };
}

async function clickVisualCoordinate(message, sender) {
  const context = activeContext;
  const tabId = sender.tab?.id;
  if (
    !context
    || !Number.isInteger(tabId)
    || (sender.frameId ?? 0) !== 0
    || tabId !== activeTabId
    || context.tabId !== tabId
    || message.contextId !== context.contextId
  ) return { ok: false, error: "stale_context" };

  const capturedAt = Number(context.capturedAt);
  if (!Number.isFinite(capturedAt) || Date.now() - capturedAt > COORDINATE_CLICK_MAX_AGE_MS) {
    return { ok: false, error: "expired_context" };
  }
  const x = Number(message.x);
  const y = Number(message.y);
  const width = Number(context.viewport?.width);
  const height = Number(context.viewport?.height);
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || x < 0
    || y < 0
    || x > width
    || y > height
  ) return { ok: false, error: "invalid_coordinates" };

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.active || (context.pageUrl && String(tab.url || "").slice(0, 1200) !== context.pageUrl)) {
    return { ok: false, error: "page_changed" };
  }
  if (coordinateClickTabs.has(tabId)) return { ok: false, error: "click_in_progress" };

  const debuggee = { tabId };
  let attached = false;
  coordinateClickTabs.add(tabId);
  try {
    await chrome.debugger.attach(debuggee, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    return { ok: true };
  } catch (error) {
    console.warn("[Tars] visual coordinate click failed", error);
    return { ok: false, error: "coordinate_click_failed" };
  } finally {
    coordinateClickTabs.delete(tabId);
    if (attached) await chrome.debugger.detach(debuggee).catch(() => undefined);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") return false;
  void (async () => {
    await loadState();
    switch (message?.type) {
      case "CTRLTEACH_TARS_CONFIG":
        sendResponse(await configureFromApp(message.config || {}, sender));
        return;
      case "CTRLTEACH_BROWSER_LAB_START":
        sendResponse(await startBrowserLab(message, sender));
        return;
      case "CTRLTEACH_BROWSER_LAB_STOP":
        sendResponse(await stopBrowserLab(message, sender));
        return;
      case "CTRLTEACH_BROWSER_LAB_CLEANUP_READY":
        sendResponse(await markBrowserLabCleanupReady(message, sender));
        return;
      case "TARS_PAGE_READY":
        if (sender.tab?.active) activeTabId = sender.tab.id;
        sendResponse({ ok: true, state: publicState(sender.tab?.id) });
        return;
      case "TARS_EXTENSION_PING":
        sendResponse({ ok: true });
        return;
      case "TARS_CURSOR_POSITION":
        if (sender.tab?.id === activeTabId) latestCursor = { x: Number(message.x) || 0, y: Number(message.y) || 0 };
        sendResponse({ ok: true });
        return;
      case "TARS_COORDINATE_CLICK":
        sendResponse(await clickVisualCoordinate(message, sender));
        return;
      case "TARS_LAB_INTERACTION":
        if (!activeBrowserLab || sender.tab?.id !== activeBrowserLab.tabId) {
          sendResponse({ ok: false, error: "inactive_lab_tab" });
          return;
        }
        await recordLabEvent(message.kind || "event", {
          ...(message.payload || {}),
          url: sender.tab?.url || message.payload?.url || "",
          title: sender.tab?.title || message.payload?.title || "",
        });
        if (
          message.kind === "state_snapshot"
          && message.payload?.state?.repositoryVisibility === "private"
          && message.payload?.state?.repositoryCreated !== true
          && !activeBrowserLab.verified
          && activeBrowserLab.policyViolationCodes.has("github_repository_public")
          && !activeBrowserLab.correctionAcknowledged
        ) {
          activeBrowserLab.correctionAcknowledged = true;
          await persistActiveBrowserLab();
          await coachBrowserLab(
            activeBrowserLab.tabId,
            "That's Private now. You're safe to create the repository.",
            null,
            "Confirm in one short sentence that visibility is now Private and the learner can create the repository.",
          );
        }
        sendResponse({ ok: true });
        return;
      case "TARS_LAB_POLICY_VIOLATION":
        sendResponse(await handleLabPolicyViolation(message, sender));
        return;
      case "TARS_GITHUB_PRIVATE_AUTOMATION_RESULT":
        sendResponse(await handleGithubPrivateAutomationResult(message, sender));
        return;
      case "TARS_GITHUB_PRIVATE_AUTOMATION_NARRATE":
        sendResponse(await narrateGithubPrivateAutomation(message, sender));
        return;
      case "TARS_PTT_START":
        await beginPushToTalk(sender.tab?.id, "keyboard");
        sendResponse({ ok: true });
        return;
      case "TARS_PTT_STOP":
        await finishPushToTalk(sender.tab?.id);
        sendResponse({ ok: true });
        return;
      case "TARS_MIC_GRANTED":
        micSetupOpened = false;
        await sendToOffscreen({ type: "TARS_RETRY_MIC" });
        sendResponse({ ok: true });
        return;
      case "TARS_OFFSCREEN_EVENT":
        await routeOffscreenEvent(message.event || {});
        sendResponse({ ok: true });
        return;
      default:
        sendResponse({ ok: false });
    }
  })();
  return true;
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await loadState();
  const previous = activeTabId;
  activeTabId = tabId;
  if (currentTurn && currentTurn.tabId !== tabId) await cancelPushToTalk("tab_changed");
  if (typeof previous === "number" && previous !== tabId) await publishState(previous);
  await publishState(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === "complete") {
    activeTabId = tabId;
    await publishState(tabId);
  }
  if (
    changeInfo.status === "complete"
    && activeBrowserLab
    && activeBrowserLab.tabId === tabId
    && tab.url
  ) {
    await recordLabEvent("navigation", {
      url: tab.url,
      title: tab.title || "",
    });
    await publishState(tabId);
    await briefBrowserLab(tabId);
    await continueGithubPrivateAutomation();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (typeof tab.id !== "number") return;
  if (currentTurn) await finishPushToTalk(tab.id);
  else await beginPushToTalk(tab.id, "toolbar");
});

void loadState().then(async () => {
  if (state.enabled && accessToken) {
    await sendToOffscreen({ type: "TARS_CONFIG", config: { ...state, accessToken } });
  }
  // Reloading an unpacked extension invalidates every existing content-script
  // context. Refresh all normal tabs immediately—including background AWS
  // tabs—so an in-console SPA transition cannot keep a stale top-only cursor.
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const normalTabs = tabs.filter((tab) => isNormalPage(tab.url || ""));
  await Promise.all(normalTabs.map((tab) => publishState(tab.id)));
});
