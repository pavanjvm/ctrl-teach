importScripts("extension-assets.js");

const LOCAL_STATE_KEY = "ctrlteach_tars_extension_state";
const SESSION_TOKEN_KEY = "ctrlteach_tars_extension_token";
const TRUSTED_APP_ORIGINS_KEY = "ctrlteach_tars_trusted_app_origins";
const { isCtrlTeachAppOrigin, normalizeAppOrigin } = TarsExtensionAssets;

let state = {
  enabled: false,
  suspended: false,
  userId: "",
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
const suspendedTabIds = new Set();
let trustedAppOrigins = [];

async function loadState() {
  if (loaded) return;
  const [local, session] = await Promise.all([
    chrome.storage.local.get([LOCAL_STATE_KEY, TRUSTED_APP_ORIGINS_KEY]),
    chrome.storage.session.get(SESSION_TOKEN_KEY),
  ]);
  state = { ...state, ...(local[LOCAL_STATE_KEY] || {}), suspended: false };
  trustedAppOrigins = Array.isArray(local[TRUSTED_APP_ORIGINS_KEY])
    ? local[TRUSTED_APP_ORIGINS_KEY].map(normalizeAppOrigin).filter(Boolean)
    : [];
  accessToken = session[SESSION_TOKEN_KEY] || "";
  loaded = true;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  activeTabId = active?.id ?? null;
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
  return isCtrlTeachAppOrigin(sender.tab?.url || sender.url || "", trustedAppOrigins);
}

function isExtensionPageSender(sender) {
  return String(sender.url || "").startsWith(chrome.runtime.getURL(""));
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
  return {
    enabled: state.enabled && Boolean(accessToken),
    suspended: suspendedTabIds.has(tabId),
    active: tabId === activeTabId,
    labActive: Boolean(activeBrowserLab),
    activeLabId: activeBrowserLab?.attemptId || "",
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
    if (data?.attempt?.status === "verified") {
      activeBrowserLab.verified = true;
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
  }
}

async function publishState(tabId = activeTabId) {
  if (typeof tabId !== "number") return;
  if (!await ensureContentScript(tabId)) return;
  await sendToTab(tabId, { type: "TARS_STATE", state: publicState(tabId) });
}

async function setActiveTab(tabId) {
  const previous = activeTabId;
  activeTabId = typeof tabId === "number" ? tabId : null;
  if (currentTurn && currentTurn.tabId !== activeTabId) await cancelPushToTalk("tab_changed");
  if (typeof previous === "number" && previous !== activeTabId) await publishState(previous);
  if (typeof activeTabId === "number") await publishState(activeTabId);
}

async function configureFromApp(config, sender) {
  if (!isTrustedBridgeSender(sender)) return { ok: false, error: "untrusted_origin" };
  const appTabId = sender.tab?.id;
  if (!config.enabled) {
    suspendedTabIds.clear();
  } else if (typeof appTabId === "number") {
    if (config.suspended) suspendedTabIds.add(appTabId);
    else suspendedTabIds.delete(appTabId);
  }
  const shouldCancelTurn = !config.enabled || (currentTurn && suspendedTabIds.has(currentTurn.tabId));
  if (shouldCancelTurn) {
    await cancelPushToTalk("tars_suspended");
  }
  if (!config.enabled || (activeContext && suspendedTabIds.has(activeContext.tabId))) {
    activeContext = null;
  }
  state = {
    enabled: Boolean(config.enabled),
    suspended: false,
    userId: String(config.userId || ""),
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
    taskAssertions: lab.taskAssertions || [],
    cleanupAssertions: (lab.cleanupAssertions || []).map((assertion) => ({ ...assertion, phase: "cleanup" })),
    observedAssertionIds: new Set(),
    phase: "task",
    verified: false,
  };
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => publishState(tab.id)));
  await recordLabEvent("lab_started", {
    url: launchUrl,
    title: String(lab.objective || "Browser lab").slice(0, 240),
  });
  const created = await chrome.tabs.create({ url: launchUrl, active: true }).catch(() => null);
  if (created?.id) activeTabId = created.id;
  return { ok: true, attemptId, state: publicState(sender.tab?.id) };
}

async function stopBrowserLab(message, sender) {
  if (!isTrustedBridgeSender(sender)) return { ok: false, error: "untrusted_origin" };
  if (activeBrowserLab && (!message.attemptId || message.attemptId === activeBrowserLab.attemptId)) {
    await recordLabEvent("lab_stopped", {});
    activeBrowserLab = null;
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => publishState(tab.id)));
  }
  return { ok: true };
}

async function markBrowserLabCleanupReady(message, sender) {
  if (!isTrustedBridgeSender(sender)) return { ok: false, error: "untrusted_origin" };
  if (activeBrowserLab && (!message.attemptId || message.attemptId === activeBrowserLab.attemptId)) {
    activeBrowserLab.phase = "cleanup";
    await recordLabEvent("cleanup_started", {});
    return { ok: true, phase: "cleanup" };
  }
  return { ok: false, error: "no_active_lab" };
}

async function beginPushToTalk(tabId, trigger = "keyboard") {
  await loadState();
  if (!state.enabled || suspendedTabIds.has(tabId) || !accessToken) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const tabWindow = tab ? await chrome.windows.get(tab.windowId).catch(() => null) : null;
  if (!tab || !tab.active || !tabWindow?.focused || !isNormalPage(tab.url || "")) return;
  if (tabId !== activeTabId) await setActiveTab(tabId);
  if (currentTurn) return;
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
  await sendToOffscreen({
    type: "TARS_PTT_CONTEXT",
    turn: {
      ...turn,
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
    } else {
      await sendToTab(context.tabId, { type: "TARS_ACTION", context, response: message.response });
    }
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
        sendResponse({ ok: true, state: publicState(sender.tab?.id) });
        return;
      case "TARS_EXTENSION_PING":
        sendResponse({ ok: true });
        return;
      case "TARS_TRUST_CHECK":
        sendResponse({ ok: true, trusted: isTrustedBridgeSender(sender) });
        return;
      case "TARS_SETUP_STATUS": {
        if (!isExtensionPageSender(sender)) {
          sendResponse({ ok: false, error: "untrusted_sender" });
          return;
        }
        sendResponse({
          ok: true,
          configuredAppOrigin: trustedAppOrigins[0] || "",
          enabled: state.enabled && Boolean(accessToken),
        });
        return;
      }
      case "TARS_SET_APP_ORIGIN": {
        if (!isExtensionPageSender(sender)) {
          sendResponse({ ok: false, error: "untrusted_sender" });
          return;
        }
        const origin = normalizeAppOrigin(message.appUrl || "");
        if (message.appUrl && !origin) {
          sendResponse({ ok: false, error: "invalid_app_url" });
          return;
        }
        trustedAppOrigins = origin ? [origin] : [];
        await chrome.storage.local.set({ [TRUSTED_APP_ORIGINS_KEY]: trustedAppOrigins });
        sendResponse({ ok: true, configuredAppOrigin: origin });
        return;
      }
      case "TARS_CURSOR_POSITION":
        if (sender.tab?.id === activeTabId) latestCursor = { x: Number(message.x) || 0, y: Number(message.y) || 0 };
        sendResponse({ ok: true });
        return;
      case "TARS_LAB_INTERACTION":
        await recordLabEvent(message.kind || "event", {
          ...(message.payload || {}),
          url: sender.tab?.url || message.payload?.url || "",
          title: sender.tab?.title || message.payload?.title || "",
        });
        sendResponse({ ok: true });
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

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await loadState();
  const tabWindow = await chrome.windows.get(windowId).catch(() => null);
  if (!tabWindow?.focused) {
    await publishState(tabId);
    return;
  }
  await setActiveTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === "complete") {
    const tabWindow = await chrome.windows.get(tab.windowId).catch(() => null);
    if (tabWindow?.focused) await setActiveTab(tabId);
    else await publishState(tabId);
  }
  if (changeInfo.status === "complete" && activeBrowserLab && tab.url) {
    await recordLabEvent("navigation", {
      url: tab.url,
      title: tab.title || "",
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  suspendedTabIds.delete(tabId);
  if (currentTurn?.tabId === tabId) void cancelPushToTalk("tab_closed");
  if (activeContext?.tabId === tabId) activeContext = null;
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await loadState();
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await setActiveTab(null);
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  await setActiveTab(tab?.id);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (typeof tab.id !== "number") return;
  await loadState();
  if (!state.enabled || !accessToken) {
    await chrome.runtime.openOptionsPage();
    return;
  }
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
