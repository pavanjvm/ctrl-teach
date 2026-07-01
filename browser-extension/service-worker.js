const LOCAL_STATE_KEY = "ctrlteach_clicky_extension_state";
const SESSION_TOKEN_KEY = "ctrlteach_clicky_extension_token";
const CTRLTEACH_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

let state = {
  enabled: false,
  suspended: false,
  userId: "",
  wsUrl: "",
};
let accessToken = "";
let loaded = false;
let activeTabId = null;
let latestCursor = { x: 80, y: 120 };
let currentTurn = null;
let activeContext = null;
let micSetupOpened = false;

async function loadState() {
  if (loaded) return;
  const [local, session] = await Promise.all([
    chrome.storage.local.get(LOCAL_STATE_KEY),
    chrome.storage.session.get(SESSION_TOKEN_KEY),
  ]);
  state = { ...state, ...(local[LOCAL_STATE_KEY] || {}) };
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
    justification: "Clicky needs persistent microphone capture and response audio across tab changes.",
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
  const ready = await sendToTab(tabId, { type: "CLICKY_EXTENSION_PING" });
  if (ready?.ok) return true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        delete window.__ctrlTeachClickyExtensionLoaded;
        document.getElementById("ctrlteach-clicky-extension")?.remove();
      },
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    const injected = await sendToTab(tabId, { type: "CLICKY_EXTENSION_PING" });
    return Boolean(injected?.ok);
  } catch (error) {
    console.warn("[Clicky] could not inject content script", tab.url, error);
    return false;
  }
}

function publicState(tabId) {
  return {
    enabled: state.enabled && Boolean(accessToken),
    suspended: state.suspended,
    active: tabId === activeTabId,
    cursor: latestCursor,
  };
}

async function publishState(tabId = activeTabId) {
  if (typeof tabId !== "number") return;
  if (!await ensureContentScript(tabId)) return;
  await sendToTab(tabId, { type: "CLICKY_STATE", state: publicState(tabId) });
}

async function configureFromApp(config, sender) {
  if (!isTrustedBridgeSender(sender)) return { ok: false, error: "untrusted_origin" };
  state = {
    enabled: Boolean(config.enabled),
    suspended: Boolean(config.suspended),
    userId: String(config.userId || ""),
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
    type: "CLICKY_CONFIG",
    config: { ...state, accessToken },
  });
  return {
    ok: true,
    extensionActive: state.enabled && Boolean(accessToken),
    state: publicState(sender.tab?.id),
  };
}

async function beginPushToTalk(tabId, trigger = "keyboard") {
  await loadState();
  if (!state.enabled || state.suspended || !accessToken || tabId !== activeTabId || currentTurn) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !isNormalPage(tab.url || "")) return;
  const contextId = crypto.randomUUID();
  currentTurn = { contextId, tabId, windowId: tab.windowId };
  await sendToTab(tabId, { type: "CLICKY_PREPARE_PTT", contextId, trigger });
  await sendToOffscreen({ type: "CLICKY_PTT_START", contextId, tabId });
  await sendToTab(tabId, { type: "CLICKY_MODE", mode: "listening", trigger });
}

async function cancelPushToTalk(reason = "cancelled") {
  const turn = currentTurn;
  currentTurn = null;
  if (!turn) return;
  await sendToOffscreen({ type: "CLICKY_PTT_CANCEL", reason });
  await sendToTab(turn.tabId, { type: "CLICKY_MODE", mode: "idle" });
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
      await sendToOffscreen({ type: "CLICKY_PTT_CANCEL", reason: "tab_changed" });
      await sendToTab(turn.tabId, { type: "CLICKY_MODE", mode: "idle" });
    }
    return;
  }
  const speech = await sendToOffscreen({
    type: "CLICKY_PTT_END",
    contextId: turn.contextId,
  });
  if (!speech?.hasSpeech) {
    await sendToTab(tabId, { type: "CLICKY_MODE", mode: "idle" });
    return;
  }
  const context = await sendToTab(tabId, {
    type: "CLICKY_COLLECT_CONTEXT",
    contextId: turn.contextId,
  });
  if (!context?.ok) {
    await sendToOffscreen({ type: "CLICKY_PTT_CANCEL", reason: "context_unavailable" });
    await sendToTab(tabId, { type: "CLICKY_MODE", mode: "idle" });
    return;
  }
  let screenshotDataUrl = "";
  try {
    screenshotDataUrl = await chrome.tabs.captureVisibleTab(turn.windowId, {
      format: "jpeg",
      quality: 94,
    });
  } catch (error) {
    console.warn("[Clicky] visible-tab capture failed", error);
  }
  if (!screenshotDataUrl) {
    await sendToOffscreen({ type: "CLICKY_PTT_CANCEL", reason: "capture_failed" });
    await sendToTab(tabId, { type: "CLICKY_MODE", mode: "idle" });
    return;
  }
  const tabs = await chrome.tabs.query({ windowId: turn.windowId });
  await sendToOffscreen({
    type: "CLICKY_PTT_CONTEXT",
    turn: {
      ...turn,
      screenshotDataUrl,
      context: context.context,
      tabs: safeTabInventory(tabs),
    },
  });
  await sendToTab(tabId, { type: "CLICKY_MODE", mode: "thinking" });
}

async function routeOffscreenEvent(message) {
  if (message.type === "CLICKY_CONTEXT_BOUND") {
    activeContext = message.context;
    return;
  }
  if (message.type === "CLICKY_MIC_REQUIRED") {
    if (!micSetupOpened) {
      micSetupOpened = true;
      await chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    }
    return;
  }
  if (message.type === "CLICKY_STATUS") {
    await sendToTab(activeTabId, { type: "CLICKY_STATUS", ...message });
    return;
  }
  const context = activeContext;
  if (!context || context.tabId !== activeTabId) return;
  if (message.type === "CLICKY_POINT") {
    await sendToTab(context.tabId, { type: "CLICKY_POINT", context, response: message.response });
  } else if (message.type === "CLICKY_DRAW") {
    await sendToTab(context.tabId, { type: "CLICKY_DRAW", context, tool: message.tool, response: message.response });
  } else if (message.type === "CLICKY_DRAW_BATCH") {
    await sendToTab(context.tabId, { type: "CLICKY_DRAW_BATCH", context, tool: message.tool, responses: message.responses });
  } else if (message.type === "CLICKY_ACTION") {
    const action = message.response?.action;
    if (action === "activate_tab") {
      const raw = String(message.response?.targetId || "").replace(/^tab-/, "");
      const targetTabId = Number(raw);
      if (Number.isInteger(targetTabId)) await chrome.tabs.update(targetTabId, { active: true }).catch(() => undefined);
    } else {
      await sendToTab(context.tabId, { type: "CLICKY_ACTION", context, response: message.response });
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") return false;
  void (async () => {
    await loadState();
    switch (message?.type) {
      case "CTRLTEACH_CLICKY_CONFIG":
        sendResponse(await configureFromApp(message.config || {}, sender));
        return;
      case "CLICKY_PAGE_READY":
        if (sender.tab?.active) activeTabId = sender.tab.id;
        sendResponse({ ok: true, state: publicState(sender.tab?.id) });
        return;
      case "CLICKY_EXTENSION_PING":
        sendResponse({ ok: true });
        return;
      case "CLICKY_CURSOR_POSITION":
        if (sender.tab?.id === activeTabId) latestCursor = { x: Number(message.x) || 0, y: Number(message.y) || 0 };
        sendResponse({ ok: true });
        return;
      case "CLICKY_PTT_START":
        await beginPushToTalk(sender.tab?.id, "keyboard");
        sendResponse({ ok: true });
        return;
      case "CLICKY_PTT_STOP":
        await finishPushToTalk(sender.tab?.id);
        sendResponse({ ok: true });
        return;
      case "CLICKY_MIC_GRANTED":
        micSetupOpened = false;
        await sendToOffscreen({ type: "CLICKY_RETRY_MIC" });
        sendResponse({ ok: true });
        return;
      case "CLICKY_OFFSCREEN_EVENT":
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
});

chrome.action.onClicked.addListener(async (tab) => {
  if (typeof tab.id !== "number") return;
  if (currentTurn) await finishPushToTalk(tab.id);
  else await beginPushToTalk(tab.id, "toolbar");
});

void loadState().then(async () => {
  if (state.enabled && accessToken) {
    await sendToOffscreen({ type: "CLICKY_CONFIG", config: { ...state, accessToken } });
  }
  const appTabs = await chrome.tabs.query({
    url: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"],
  }).catch(() => []);
  await Promise.all(appTabs.map((tab) => publishState(tab.id)));
  if (!appTabs.some((tab) => tab.id === activeTabId)) await publishState(activeTabId);
});
