(() => {
  if (window.__ctrlTeachTarsExtensionLoaded) return;
  window.__ctrlTeachTarsExtensionLoaded = true;

  // A reloaded unpacked extension leaves its old closed-shadow host in tabs
  // that were already open. A newly injected content-script world removes that
  // orphan before mounting the live overlay.
  document.getElementById("ctrlteach-tars-extension")?.remove();

  const IS_TOP_FRAME = window === window.top;
  const FRAME_INPUT_TYPE = "CTRLTEACH_TARS_FRAME_INPUT";
  const FRAME_INPUT_SOURCE = chrome.runtime.id;
  const childFrameCache = new WeakMap();

  function findChildFrame(root, source) {
    for (const frame of root.querySelectorAll("iframe,frame")) {
      try {
        if (frame.contentWindow === source) return frame;
      } catch {
        // A cross-origin frame still exposes comparable WindowProxy identity,
        // but ignore a browser-specific access failure and keep searching.
      }
    }
    // Console shells can mount their workspace iframe below an open shadow
    // root after a client-side navigation. querySelectorAll on document alone
    // cannot see those frames, so traverse each open component root.
    for (const element of root.querySelectorAll("*")) {
      if (!element.shadowRoot) continue;
      const nested = findChildFrame(element.shadowRoot, source);
      if (nested) return nested;
    }
    return null;
  }

  function directChildFrame(source) {
    if (!source || (typeof source !== "object" && typeof source !== "function")) return null;
    const cached = childFrameCache.get(source);
    if (cached?.isConnected) {
      try {
        if (cached.contentWindow === source) return cached;
      } catch {
        // Fall through to fresh discovery after a restored frame changes.
      }
    }
    const frame = findChildFrame(document, source);
    if (frame) childFrameCache.set(source, frame);
    return frame;
  }

  function mapRelayedFrameInput(event) {
    const data = event.data;
    if (
      event.source === window
      || data?.type !== FRAME_INPUT_TYPE
      || data?.source !== FRAME_INPUT_SOURCE
      || !["pointer", "ptt_start", "ptt_stop"].includes(data.kind)
    ) return null;
    const frame = directChildFrame(event.source);
    if (!(frame instanceof HTMLElement)) return null;
    const rect = frame.getBoundingClientRect();
    const point = TarsGroundingGeometry.framePointToParentViewport({
      x: Number(data.x),
      y: Number(data.y),
      childViewportWidth: Number(data.viewportWidth),
      childViewportHeight: Number(data.viewportHeight),
      frameLeft: rect.left,
      frameTop: rect.top,
      frameWidth: rect.width,
      frameHeight: rect.height,
      frameOffsetWidth: frame.offsetWidth,
      frameOffsetHeight: frame.offsetHeight,
      frameClientLeft: frame.clientLeft,
      frameClientTop: frame.clientTop,
      frameClientWidth: frame.clientWidth,
      frameClientHeight: frame.clientHeight,
    });
    if (!point) return null;
    return {
      type: FRAME_INPUT_TYPE,
      source: FRAME_INPUT_SOURCE,
      kind: data.kind,
      x: point.x,
      y: point.y,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  }

  function postFrameInput(kind, point) {
    window.parent.postMessage({
      type: FRAME_INPUT_TYPE,
      source: FRAME_INPUT_SOURCE,
      kind,
      x: point.x,
      y: point.y,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }, "*");
  }

  // Only the top frame owns the visual overlay and the backend turn. Child
  // frames relay trusted input upward, one parent at a time, so the pointer is
  // translated through nested and cross-origin iframe boundaries without
  // creating duplicate Tars cursors.
  if (!IS_TOP_FRAME) {
    let frameMouse = { x: 0, y: 0 };
    let framePttHeld = false;

    window.addEventListener("mousemove", (event) => {
      if (!event.isTrusted) return;
      frameMouse = { x: event.clientX, y: event.clientY };
      postFrameInput("pointer", frameMouse);
    }, true);

    window.addEventListener("keydown", (event) => {
      if (
        !event.isTrusted
        || event.key !== "Control"
        || event.metaKey
        || event.altKey
        || event.repeat
        || framePttHeld
      ) return;
      framePttHeld = true;
      postFrameInput("ptt_start", frameMouse);
    }, true);

    window.addEventListener("keyup", (event) => {
      if (!event.isTrusted || event.key !== "Control" || !framePttHeld) return;
      framePttHeld = false;
      postFrameInput("ptt_stop", frameMouse);
    }, true);

    window.addEventListener("blur", (event) => {
      if (!event.isTrusted || !framePttHeld) return;
      framePttHeld = false;
      postFrameInput("ptt_stop", frameMouse);
    }, true);

    window.addEventListener("message", (event) => {
      const relayed = mapRelayedFrameInput(event);
      if (relayed) window.parent.postMessage(relayed, "*");
    }, true);
    return;
  }

  function runtimeSend(message) {
    try {
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => null);
    } catch {
      // An unpacked-extension reload invalidates scripts already living in a
      // tab. The new worker reinjects a fresh bundle; the stale instance must
      // fail quietly while it is being replaced.
      return Promise.resolve(null);
    }
  }

  const CTRLTEACH_ORIGINS = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const CONTENT_INSTANCE_ID = crypto.randomUUID();
  const MAX_TARGETS = 240;
  const rocketPet = globalThis.CtrlTeachRocketPet;
  const SENSITIVE_TEXT = /\b(buy|purchase|pay|checkout|place order|delete|remove|erase|send|submit|publish|post|sign out|log out|change password|reset password|upload|download|allow|grant|confirm booking|book now)\b/i;

  const githubLabRules = globalThis.CtrlTeachGitHubLab;
  let extensionState = {
    enabled: false,
    suspended: false,
    active: false,
    labActive: false,
    activeLabId: "",
    labWorkflow: "",
    cursor: { x: 80, y: 120 },
  };
  let mode = "idle";
  let pttHeld = false;
  let currentContextId = "";
  let currentTargets = new Map();
  let lastCollectedElements = [];
  let mouse = { x: 45, y: 95 };
  let position = { x: 80, y: 120 }; // independent pet perch
  let perchInitialized = false;
  let activePoint = false;
  // Monotonic token that cancels any in-progress pointing/navigation when a
  // new point arrives, so a stale return-flight never clobbers a fresh target.
  let navToken = 0;
  let rocketPose = null;
  let rocketSide = null;
  let rocketFrame = 0;
  let rocketTimer = 0;
  let perchFrame = 0;
  let roamTimer = 0;
  let petDragging = false;
  let petDragPointerId = null;
  let petDragOffset = { x: 0, y: 0 };
  let activeRawCoordinate = false;
  let rocketHoldOpen = false;
  const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const DRAWINGS_AUTO_CLEAR_MS = 6000;
  let drawingLifetime = null;
  let ctrlTrailPoints = [];
  let ctrlGesturePoints = [];
  let ctrlTrailGroup = null;
  let ctrlTrailFrame = 0;
  let ctrlGesture = null;
  let lastLabInputAt = 0;
  let githubSnapshotTimer = 0;
  let lastGitHubSnapshotSignature = "";
  let lastGitHubPolicySignal = "";
  let githubPrivateAutomationRunning = false;
  let githubPrivateHandoffActive = false;
  let cursorReportAt = 0;
  let statusText = "";
  let transcriptText = "";
  let transcriptReplayBase = "";
  let transcriptReplayCandidate = "";
  let transcriptReplaySuppressed = false;
  let bubbleClearTimer = 0;
  let bubbleStreamToken = 0;

  const host = document.createElement("div");
  host.id = "ctrlteach-tars-extension";
  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    pointerEvents: "none",
    display: "none",
  });
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      #layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      #drawings { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: visible; pointer-events: none; }
      #cursor { position: fixed; left: 0; top: 0; width: 48px; height: 44px; transform-origin: 50% 68%; will-change: transform; filter: drop-shadow(0 5px 9px rgba(16,18,15,.22)) drop-shadow(0 0 2px rgba(255,255,255,.9)); pointer-events: auto; cursor: grab; touch-action: none; user-select: none; }
      #cursor[data-dragging="true"] { cursor: grabbing; }
      #pet-svg { width: 48px; height: 44px; overflow: visible; animation: petBreathe 2.8s ease-in-out infinite; }
      #pet-eyes { transform-origin: 22px 19px; animation: petBlink 6.2s ease-in-out infinite; }
      #hand-left, #hand-right { transition: opacity .1s ease; }
      #socket-left, #socket-right { opacity: 0; animation: socketGlow .55s ease-in-out infinite; }
      #cursor[data-launch-side="left"]:not([data-gesture="perched"]):not([data-gesture="dock"]) #hand-left { opacity: 0; }
      #cursor[data-launch-side="right"]:not([data-gesture="perched"]):not([data-gesture="dock"]) #hand-right { opacity: 0; }
      #cursor[data-launch-side="left"]:not([data-gesture="perched"]) #socket-left,
      #cursor[data-launch-side="right"]:not([data-gesture="perched"]) #socket-right { opacity: .9; }
      #cursor[data-mode="speaking"] #pet-svg { animation: petSpeak .78s ease-in-out infinite; }
      #pet-ear { opacity: 0; transform-origin: 34px 18px; transform: scale(.55); transition: opacity .18s ease, transform .18s ease; filter: drop-shadow(1px 2px 2px rgba(16,18,15,.2)); }
      #cursor[data-mode="listening"] #pet-ear { opacity: 1; animation: listen .62s ease-in-out infinite alternate; }
      #pet-speaking-mouth { opacity: 0; transform-origin: 22px 29px; }
      #cursor[data-mode="speaking"] #pet-smile { opacity: 0; }
      #cursor[data-mode="speaking"] #pet-speaking-mouth { opacity: 1; animation: talk .34s ease-in-out infinite; }
      #thinking-face, #thinking-hand { opacity: 0; transition: opacity .15s ease; }
      #cursor[data-mode="thinking"] #pet-smile { opacity: 0; }
      #cursor[data-mode="thinking"] #thinking-face { opacity: 1; }
      #cursor[data-mode="thinking"][data-gesture="perched"] #hand-right,
      #cursor[data-mode="thinking"][data-gesture="dock"] #hand-right { opacity: 0; }
      #cursor[data-mode="thinking"][data-gesture="perched"] #thinking-hand,
      #cursor[data-mode="thinking"][data-gesture="dock"] #thinking-hand { opacity: 1; animation: ponder .72s ease-in-out infinite alternate; transform-origin: 31px 30px; }
      #thought { position: absolute; right: -11px; top: -11px; display: flex; align-items: flex-end; gap: 2px; opacity: 0; transition: opacity .16s ease; }
      #thought span { width: 5px; height: 5px; border-radius: 50%; background: #79a925; box-shadow: 0 1px 3px rgba(16,18,15,.24); animation: thinkDot .72s ease-in-out infinite; }
      #thought span:nth-child(2) { width: 7px; height: 7px; animation-delay: .12s; }
      #thought span:nth-child(3) { width: 9px; height: 9px; animation-delay: .24s; }
      #cursor[data-mode="thinking"] #thought { opacity: 1; }
      #rocket-hand { position: fixed; left: 0; top: 0; width: 36px; height: 22px; display: none; transform-origin: 97% 50%; will-change: transform; filter: drop-shadow(0 3px 6px rgba(16,18,15,.2)); }
      #rocket-hand.visible { display: block; }
      #rocket-thrust { position: absolute; left: -18px; top: 50%; width: 22px; height: 16px; transform: translateY(-50%); opacity: 0; }
      #rocket-hand.thrusting #rocket-thrust { opacity: 1; }
      #rocket-thrust .flame { position: absolute; right: 0; top: 50%; height: 8px; clip-path: polygon(100% 0,0 50%,100% 100%); transform-origin: right center; animation: flame .09s ease-in-out infinite alternate; }
      #rocket-thrust .outer { width: 20px; margin-top: -4px; background: #f59e0b; }
      #rocket-thrust .inner { width: 13px; height: 4px; margin-top: -2px; background: #d9ff83; }
      #rocket-thrust .spark { position: absolute; right: 5px; width: 3px; height: 3px; border-radius: 50%; background: #f59e0b; animation: spark .36s linear infinite; }
      #rocket-thrust .spark.one { top: 1px; } #rocket-thrust .spark.two { bottom: 1px; animation-delay: .17s; }
      #rocket-thrust .smoke { position: absolute; right: 11px; top: 6px; width: 5px; height: 5px; border-radius: 50%; background: #d8dbd1; animation: smoke .55s ease-out infinite; }
      #rocket-thrust .smoke.two { animation-delay: .25s; }
      #target-pulse { position: fixed; left: 0; top: 0; width: 20px; height: 20px; display: none; border: 2px solid rgba(121,169,37,.8); border-radius: 50%; transform: translate(-50%,-50%); animation: targetPulse 1s ease-out infinite; }
      #target-pulse.visible { display: block; }
      #bubble-anchor { position: absolute; left: 50px; top: -9px; transform-origin: 0 0; }
      #cursor[data-bubble-side="left"] #bubble-anchor { left: auto; right: 50px; }
      #bubble { width: max-content; max-width: 320px; padding: 8px 11px; border-radius: 10px; background: #111827; color: white; font: 600 12px/1.4 Inter, ui-sans-serif, system-ui, sans-serif; font-style: normal; letter-spacing: 0; text-align: left; box-shadow: 0 12px 34px rgba(0,0,0,.22); opacity: 0; transform: translateY(3px) scale(.96); transform-origin: 0 0; transition: opacity .2s ease, transform .2s ease; }
      #bubble.visible { opacity: 1; transform: translateY(0) scale(1); }
      #bubble.pop { animation: bubblePop .26s cubic-bezier(.2,1.5,.35,1); }
      @keyframes bubblePop { from { transform: translateY(5px) scale(.5); } to { transform: translateY(0) scale(1); } }
      #status { position: fixed; right: 18px; bottom: 18px; max-width: 320px; padding: 8px 11px; border: 1px solid #d8dbd1; border-radius: 6px; background: rgba(255,255,255,.96); color: #4f7716; font: 650 11px/1.2 Inter, ui-sans-serif, system-ui, sans-serif; box-shadow: 0 8px 25px rgba(16,18,15,.1); opacity: 0; transition: opacity .2s ease; }
      #status.visible { opacity: 1; }
      #confirm { position: fixed; inset: 0; display: none; place-items: center; background: rgba(17,24,39,.2); pointer-events: auto; }
      #confirm.visible { display: grid; }
      #confirm-card { width: min(360px, calc(100vw - 40px)); padding: 20px; border: 1px solid #e5e7eb; border-radius: 16px; background: white; color: #111827; box-shadow: 0 24px 70px rgba(0,0,0,.2); }
      #confirm-title { margin: 0 0 8px; font: 700 16px/1.3 Inter, ui-sans-serif, system-ui, sans-serif; }
      #confirm-copy { margin: 0; color: #6b7280; font: 500 13px/1.5 Inter, ui-sans-serif, system-ui, sans-serif; }
      #confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
      .confirm-button { border: 0; border-radius: 10px; padding: 9px 13px; font: 700 12px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
      #confirm-cancel { background: #f3f4f6; color: #374151; }
      #confirm-accept { background: #b7ec52; color: #26320f; }
      .stroke { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .55s cubic-bezier(.22,.8,.24,1) forwards; }
      .stroke.dashed { stroke-dasharray: 8 6; stroke-dashoffset: 0; animation: none; }
      .stroke.dotted { stroke-dasharray: 2 5; stroke-dashoffset: 0; stroke-linecap: round; animation: none; }
      .ctrl-trail-segment { stroke: #14b8a6; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 6px rgba(20,184,166,.5)); }
      .draw-text { font: 600 13px/1.3 Inter, ui-sans-serif, system-ui, sans-serif; paint-order: stroke; stroke: rgba(0,0,0,.55); stroke-width: 4px; stroke-linejoin: round; animation: draw .35s ease forwards; }
      @keyframes petBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }
      @keyframes petBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(.08); } }
      @keyframes petSpeak { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045) translateY(-1px); } }
      @keyframes socketGlow { 0%,100% { filter: drop-shadow(0 0 2px #f59e0b); } 50% { filter: drop-shadow(0 0 7px #f59e0b); } }
      @keyframes listen { from { transform: scale(.96) rotate(-1deg); } to { transform: scale(1.035) rotate(1deg); } }
      @keyframes talk { 0%,100% { transform: scaleY(.55); } 50% { transform: scaleY(1.2); } }
      @keyframes thinkDot { 0%,100% { transform: translateY(0); opacity: .35; } 50% { transform: translateY(-3px); opacity: 1; } }
      @keyframes ponder { from { transform: translateY(0) rotate(-1deg); } to { transform: translateY(-1px) rotate(1deg); } }
      @keyframes flame { from { transform: scaleX(.7); opacity: .72; } to { transform: scaleX(1.12); opacity: 1; } }
      @keyframes spark { from { transform: translateX(0) scale(1); opacity: 1; } to { transform: translateX(-15px) scale(0); opacity: 0; } }
      @keyframes smoke { from { transform: translateX(0) scale(.6); opacity: .36; } to { transform: translateX(-22px) scale(1.3); opacity: 0; } }
      @keyframes targetPulse { from { transform: translate(-50%,-50%) scale(.45); opacity: .62; } to { transform: translate(-50%,-50%) scale(1.5); opacity: 0; } }
      @keyframes draw { to { stroke-dashoffset: 0; } }
      @media (prefers-reduced-motion: reduce) { #pet-svg,#pet-eyes,#pet-ear,#pet-speaking-mouth,#thinking-hand,#thought span,#socket-left,#socket-right,#target-pulse { animation: none !important; } #target-pulse { opacity: .45; transform: translate(-50%,-50%); } }
    </style>
    <div id="layer">
      <svg id="drawings" aria-hidden="true"></svg>
      <div id="cursor" data-mode="idle" data-gesture="perched">
        <svg id="pet-svg" viewBox="0 0 44 40" aria-hidden="true">
          <ellipse cx="22" cy="37" rx="14" ry="2.5" fill="rgba(16,18,15,.16)"></ellipse>
          <circle id="socket-left" cx="5.5" cy="25" r="3.2" fill="#26320f"></circle>
          <circle id="socket-right" cx="38.5" cy="25" r="3.2" fill="#26320f"></circle>
          <path id="pet-body-shape" d="M8.3 9.8C11.8 4.4 17.1 2 22 2s10.2 2.4 13.7 7.8c3.2 4.8 4.2 13.2 1.2 19.1C34.2 34.2 28.5 37 22 37S9.8 34.2 7.1 28.9c-3-5.9-2-14.3 1.2-19.1Z" fill="#b7ec52" stroke="#10120f" stroke-width="2"></path>
          <path d="M11.3 11.5c3-4 6.6-5.6 10.7-5.6s7.7 1.6 10.7 5.6" fill="none" stroke="rgba(255,255,255,.64)" stroke-width="2.2" stroke-linecap="round"></path>
          <g id="pet-ear">
            <path d="M34.2 11.5c1.5-4.8 8.9-6.1 12.3-1.7 3.7 4.9 1.3 14-5.2 16.6-4.7 1.8-9.2-1-8.9-5.1.2-2.5 2-4.3 4.8-5 3-.7 4.3-2.9 3.1-4.8-1.2-1.9-3.9-1.7-6.1 0Z" fill="#e7ffb1" stroke="#10120f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M38.3 11.5c2.7-.8 4.9 1.1 4.3 3.5-.5 1.9-2.2 2.8-4.1 2.8-1.5 0-2.4 1-2.3 2.2.1 1.1 1 1.8 2.1 2" fill="none" stroke="#527f19" stroke-width="1.6" stroke-linecap="round"></path>
          </g>
          <g id="pet-eyes">
            <ellipse cx="16.3" cy="19" rx="5.2" ry="5.5" fill="#fff" stroke="#10120f" stroke-width="1.5"></ellipse>
            <ellipse cx="27.7" cy="19" rx="5.2" ry="5.5" fill="#fff" stroke="#10120f" stroke-width="1.5"></ellipse>
            <g id="pupils">
              <circle cx="16.3" cy="19" r="2.1" fill="#10120f"></circle>
              <circle cx="27.7" cy="19" r="2.1" fill="#10120f"></circle>
              <circle cx="15.6" cy="18.2" r=".65" fill="#fff"></circle>
              <circle cx="27" cy="18.2" r=".65" fill="#fff"></circle>
            </g>
          </g>
          <path id="pet-smile" d="M18.8 28.2c2 1.4 4.4 1.4 6.4 0" fill="none" stroke="#10120f" stroke-width="1.7" stroke-linecap="round"></path>
          <ellipse id="pet-speaking-mouth" cx="22" cy="29" rx="3.4" ry="2.5" fill="#10120f"></ellipse>
          <g id="thinking-face">
            <path d="M11.6 13.8c2-1.8 4.5-2.2 6.8-1.1M25.7 12.4c2.3-.5 4.5.2 6.2 2" fill="none" stroke="#10120f" stroke-width="1.5" stroke-linecap="round"></path>
            <path d="M19.2 29.6c1.9-1.5 4.4-1.3 6.1.3" fill="none" stroke="#10120f" stroke-width="1.6" stroke-linecap="round"></path>
          </g>
          <g id="hand-left" transform="scale(-1 1) translate(-44 0)"><path d="M37 22c3-1 5 .8 4 3.2-.7 1.8-2.1 3.7-4.4 4.8-2.4 1.2-4.5-.4-4.1-2.8.4-2.1 1.8-4.2 4.5-5.2Z" fill="#b7ec52" stroke="#10120f" stroke-width="1.7"></path></g>
          <g id="hand-right"><path d="M37 22c3-1 5 .8 4 3.2-.7 1.8-2.1 3.7-4.4 4.8-2.4 1.2-4.5-.4-4.1-2.8.4-2.1 1.8-4.2 4.5-5.2Z" fill="#b7ec52" stroke="#10120f" stroke-width="1.7"></path></g>
          <g id="thinking-hand">
            <path d="M40.2 35.2c-2.2 2.3-6.1 2.7-8.5.8-1.5-1.2-1.8-3.3-.5-4.7 1.2-1.3 3.1-1.6 4.6-.7l1.5.8-4.8-2.4c-1.3-.7-.8-2.8.7-2.7 1.2.1 3.1.9 5.6 2.5 2.6 1.6 3.2 4.4 1.4 6.4Z" fill="#b7ec52" stroke="#10120f" stroke-width="1.7" stroke-linejoin="round"></path>
            <path d="M34.2 30.1 27.8 27" fill="none" stroke="#10120f" stroke-width="1.7" stroke-linecap="round"></path>
          </g>
        </svg>
        <div id="thought" aria-hidden="true"><span></span><span></span><span></span></div>
        <div id="bubble-anchor"><div id="bubble"></div></div>
      </div>
      <div id="rocket-hand" aria-hidden="true">
        <div id="rocket-thrust"><span class="flame outer"></span><span class="flame inner"></span><i class="spark one"></i><i class="spark two"></i><i class="smoke one"></i><i class="smoke two"></i></div>
        <svg width="36" height="22" viewBox="0 0 36 22">
          <path d="M8 6.2h13.5V4.5c0-2 1.4-3.5 3.2-3.5 1.7 0 2.8 1.3 2.8 3v2.2h4.8c1.7 0 2.7 1.1 2.7 2.6 0 1.6-1.1 2.7-2.7 2.7h-5.1c-.8 5.2-4.3 8.5-9.7 8.5H13c-5.2 0-8.5-3.2-8.5-7.8 0-3.3 1.2-6 3.5-6Z" fill="#b7ec52" stroke="#10120f" stroke-width="1.8" stroke-linejoin="round"></path>
          <path d="M11 8.4c2.3-1 4.9-.8 7 .5" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="1.7" stroke-linecap="round"></path>
        </svg>
      </div>
      <div id="target-pulse" aria-hidden="true"></div>
      <div id="status"></div>
      <div id="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div id="confirm-card">
          <h2 id="confirm-title">Confirm Tars action</h2>
          <p id="confirm-copy"></p>
          <div id="confirm-actions">
            <button id="confirm-cancel" class="confirm-button" type="button">Cancel</button>
            <button id="confirm-accept" class="confirm-button" type="button">Continue</button>
          </div>
        </div>
      </div>
    </div>`;

  const cursor = shadow.getElementById("cursor");
  const bubble = shadow.getElementById("bubble");
  const bubbleAnchor = shadow.getElementById("bubble-anchor");
  const pupils = shadow.getElementById("pupils");
  const rocketHand = shadow.getElementById("rocket-hand");
  const targetPulse = shadow.getElementById("target-pulse");
  const status = shadow.getElementById("status");
  const drawings = shadow.getElementById("drawings");
  const confirmLayer = shadow.getElementById("confirm");
  const confirmCopy = shadow.getElementById("confirm-copy");
  const confirmAccept = shadow.getElementById("confirm-accept");
  const confirmCancel = shadow.getElementById("confirm-cancel");
  let pendingConfirmation = null;

  const createDrawingLifetimeGate = globalThis.TarsDrawingLifetime?.createDrawingLifetimeGate
    || ((onExpire) => ({
      // Drawing expiry is optional. If its helper ever fails to load, keep the
      // core cursor alive and leave annotations visible instead of aborting.
      markDrawn() {},
      setActive() {},
      clear() {},
      onExpire,
    }));
  drawingLifetime = createDrawingLifetimeGate(() => {
    // Only remove the annotations that existed when expiry began. A late
    // grounded stroke must never be removed by an older fade callback.
    const expiredChildren = [...drawings.children];
    expiredChildren.forEach((child) => {
      child.style.transition = "opacity .5s ease";
      child.style.opacity = "0";
    });
    setTimeout(() => {
      expiredChildren.forEach((child) => child.remove());
      if (ctrlTrailGroup && !ctrlTrailGroup.isConnected) ctrlTrailGroup = null;
    }, 500);
  }, { delayMs: DRAWINGS_AUTO_CLEAR_MS });

  function mount() {
    // Fullscreen hides siblings outside the fullscreen top-layer element. Move
    // Tars's overlay inside a fullscreen player container so annotations stay
    // visible over YouTube and other HTML video players.
    const parent = document.fullscreenElement || document.documentElement || document;
    if (host.parentNode !== parent) parent.appendChild(host);
  }

  document.addEventListener("fullscreenchange", mount, true);

  function visible() {
    return extensionState.enabled && extensionState.active && !extensionState.suspended;
  }

  function renderVisibility() {
    mount();
    host.style.display = visible() ? "block" : "none";
    if (!visible()) {
      navToken += 1;
      clearRocketMotion();
      pttHeld = false;
      activePoint = false;
      rocketPose = null;
      rocketSide = null;
      petDragging = false;
      petDragPointerId = null;
      delete cursor.dataset.dragging;
      rocketHand.classList.remove("visible", "thrusting");
      targetPulse.classList.remove("visible");
      setRocketGesture("perched", null);
      setBubble("");
      setMode("idle");
    } else {
      transformCursor(position.x, position.y);
      updatePetGaze(mouse);
      scheduleRoam();
    }
  }

  function setMode(next) {
    const previous = mode;
    mode = next || "idle";
    if (mode !== "idle" && bubbleClearTimer) {
      clearTimeout(bubbleClearTimer);
      bubbleClearTimer = 0;
    }
    if (mode === "listening" && previous !== "listening") {
      transcriptText = "";
      resetTranscriptMergeState();
      setBubble("");
    }
    cursor.dataset.mode = mode;
    updatePetGaze(rocketPose || mouse);
    // Thinking and speaking are part of the same visual turn. The drawing's
    // lifetime begins only after the playback gate reports idle.
    drawingLifetime?.setActive(mode !== "idle");
    scheduleRoam();
  }

  function resetTranscriptMergeState() {
    transcriptReplayBase = "";
    transcriptReplayCandidate = "";
    transcriptReplaySuppressed = false;
  }

  function mergeTranscriptText(current, incoming) {
    const existing = String(current || "");
    const next = String(incoming || "");
    if (!next) return existing.slice(-420);
    if (!existing) return next.slice(-420);

    if (transcriptReplaySuppressed) return existing.slice(-420);

    if (transcriptReplayCandidate) {
      const candidate = `${transcriptReplayCandidate}${next}`;
      if (transcriptReplayBase.startsWith(candidate)) {
        transcriptReplayCandidate = candidate;
        if (candidate.length >= transcriptReplayBase.length) {
          transcriptReplaySuppressed = true;
        }
        return existing.slice(-420);
      }
      const buffered = `${transcriptReplayCandidate}${next}`;
      resetTranscriptMergeState();
      return `${existing}${buffered}`.slice(-420);
    }

    const normalize = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const normalizedExisting = normalize(existing);
    const normalizedNext = normalize(next);

    // Realtime may repeat a complete transcript before its final event. Keep
    // that snapshot once instead of displaying the same sentence twice.
    if (normalizedNext === normalizedExisting) {
      transcriptReplaySuppressed = true;
      return existing.slice(-420);
    }
    if (next.startsWith(existing)) return next.slice(-420);
    if (existing.endsWith(next)) return existing.slice(-420);
    if (existing.length > next.length && existing.startsWith(next)) {
      transcriptReplayBase = existing;
      transcriptReplayCandidate = next;
      return existing.slice(-420);
    }

    resetTranscriptMergeState();
    return `${existing}${next}`.slice(-420);
  }

  function setBubble(text) {
    bubbleStreamToken += 1;
    const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 260);
    if (clean && bubbleClearTimer) {
      clearTimeout(bubbleClearTimer);
      bubbleClearTimer = 0;
    }
    // Reset the pointing-lifecycle decorations so transcript/status text never
    // inherits a stale bounce animation or a slow fade transition.
    bubble.classList.remove("pop");
    bubble.style.transition = "";
    bubble.textContent = clean;
    bubble.classList.toggle("visible", Boolean(clean));
  }

  function setStatus(text, temporary = false, durationMs = 2200) {
    statusText = String(text || "").trim();
    status.textContent = statusText;
    status.classList.toggle("visible", Boolean(statusText));
    if (temporary && statusText) {
      const expected = statusText;
      setTimeout(() => {
        if (statusText === expected) setStatus("");
      }, durationMs);
    }
  }

  function transformCursor(x, y, _rotation = 0, scale = 1, recoil = 0) {
    position = { x, y };
    cursor.style.transform = `translate3d(${x - 24}px,${y - 22}px,0) translateX(${recoil}px) scale(${scale})`;
  }

  function beginPetDrag(event) {
    if (event.button !== 0 || !visible()) return;
    petDragging = true;
    petDragPointerId = event.pointerId;
    petDragOffset = { x: event.clientX - position.x, y: event.clientY - position.y };
    if (perchFrame) cancelAnimationFrame(perchFrame);
    perchFrame = 0;
    if (roamTimer) clearTimeout(roamTimer);
    roamTimer = 0;
    cursor.dataset.dragging = "true";
    cursor.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function movePetDrag(event) {
    if (!petDragging || event.pointerId !== petDragPointerId) return;
    const next = rocketPet.clampPerch(
      { x: event.clientX - petDragOffset.x, y: event.clientY - petDragOffset.y },
      { width: innerWidth, height: innerHeight },
    );
    transformCursor(next.x, next.y);
    updatePetGaze(rocketPose || mouse);
    event.preventDefault();
    event.stopPropagation();
  }

  function endPetDrag(event, releaseCapture = true) {
    if (!petDragging || event.pointerId !== petDragPointerId) return;
    petDragging = false;
    petDragPointerId = null;
    delete cursor.dataset.dragging;
    if (releaseCapture && cursor.hasPointerCapture(event.pointerId)) {
      cursor.releasePointerCapture(event.pointerId);
    }
    scheduleRoam();
    event.preventDefault();
    event.stopPropagation();
  }

  cursor.addEventListener("pointerdown", beginPetDrag);
  cursor.addEventListener("pointermove", movePetDrag);
  cursor.addEventListener("pointerup", endPetDrag);
  cursor.addEventListener("pointercancel", endPetDrag);
  cursor.addEventListener("lostpointercapture", (event) => endPetDrag(event, false));

  function updatePetGaze(point) {
    if (mode === "thinking" && !rocketPose) {
      pupils.setAttribute("transform", "translate(1.2 -2)");
      return;
    }
    const dx = point.x - position.x;
    const dy = point.y - position.y;
    const distance = Math.hypot(dx, dy) || 1;
    pupils.setAttribute("transform", `translate(${dx / distance * 2.2} ${dy / distance * 1.8})`);
  }

  function setRocketGesture(gesture, side = rocketSide) {
    cursor.dataset.gesture = gesture;
    cursor.dataset.bubbleSide = position.x > innerWidth - 350 ? "left" : "right";
    if (side) cursor.dataset.launchSide = side;
    else delete cursor.dataset.launchSide;
  }

  function setRocketPose(pose, thrust = true) {
    rocketPose = { ...pose, thrust };
    rocketHand.classList.add("visible");
    rocketHand.classList.toggle("thrusting", thrust && !reducedMotionQuery.matches);
    rocketHand.style.transform = `translate3d(${pose.x}px,${pose.y}px,0) translate(-97%,-50%) rotate(${pose.rotation}deg)`;
    updatePetGaze(pose);
  }

  function clearRocketMotion(resolvePending = true) {
    if (rocketFrame) cancelAnimationFrame(rocketFrame);
    if (rocketTimer) clearTimeout(rocketTimer);
    rocketFrame = 0;
    rocketTimer = 0;
    if (resolvePending && pendingLandingResolve) {
      pendingLandingResolve(false);
      pendingLandingResolve = null;
    }
  }

  function animateRocketSegment(from, to, token, { returning = false, resolveTarget } = {}) {
    if (rocketFrame) cancelAnimationFrame(rocketFrame);
    rocketFrame = 0;
    const duration = rocketPet.flightDuration(from, to, returning);
    if (reducedMotionQuery.matches) {
      const resolved = resolveTarget ? resolveTarget() : to;
      if (!resolved) return Promise.resolve(null);
      const rotation = Math.atan2(resolved.y - from.y, resolved.x - from.x) * 180 / Math.PI;
      setRocketPose({ ...resolved, rotation }, false);
      return new Promise((resolve) => {
        rocketTimer = setTimeout(() => resolve(resolved), 120);
      });
    }
    const started = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        if (token !== navToken) return;
        const raw = Math.min((now - started) / duration, 1);
        const resolvedTarget = raw >= .65 && resolveTarget ? resolveTarget() : to;
        if (!resolvedTarget) {
          rocketFrame = 0;
          resolve(null);
          return;
        }
        const trackedTarget = resolvedTarget;
        const frame = rocketPet.bezierFrame(from, trackedTarget, raw, returning ? .08 : .12);
        setRocketPose(frame, raw < .96);
        if (raw < 1) rocketFrame = requestAnimationFrame(step);
        else {
          rocketFrame = 0;
          resolve(trackedTarget);
        }
      };
      rocketFrame = requestAnimationFrame(step);
    });
  }

  // Types the point label while the launched hand is in flight.
  function streamBubbleText(text, token) {
    const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 260);
    const streamToken = ++bubbleStreamToken;
    bubble.textContent = "";
    bubble.classList.add("visible", "pop");
    if (!clean.length) return;
    let i = 0;
    const tick = () => {
      if (token !== navToken || streamToken !== bubbleStreamToken || i >= clean.length) return;
      bubble.textContent += clean[i++];
      setTimeout(tick, 22 + Math.random() * 8);
    };
    setTimeout(tick, 30);
  }

  function dockRocket(token) {
    if (token !== navToken) return;
    setRocketGesture("dock", rocketSide);
    rocketTimer = setTimeout(() => {
      if (token !== navToken) return;
      rocketPose = null;
      rocketSide = null;
      rocketHoldOpen = false;
      activeRawCoordinate = false;
      activePoint = false;
      rocketHand.classList.remove("visible", "thrusting");
      targetPulse.classList.remove("visible");
      setRocketGesture("perched", null);
      transformCursor(position.x, position.y);
      if (mode === "speaking" && transcriptText) setBubble(transcriptText);
      else if (mode !== "speaking") setBubble("");
      scheduleRoam();
    }, reducedMotionQuery.matches ? 30 : 180);
  }

  function returnRocket(token = navToken) {
    if (!rocketPose || !rocketSide || token !== navToken) return;
    rocketHoldOpen = false;
    targetPulse.classList.remove("visible");
    setRocketGesture("return", rocketSide);
    const from = { x: rocketPose.x, y: rocketPose.y };
    const to = rocketPet.shoulderPoint(position, rocketSide);
    animateRocketSegment(from, to, token, {
      returning: true,
      resolveTarget: () => rocketPet.shoulderPoint(position, rocketSide),
    }).then(() => dockRocket(token));
  }

  function recallRocket() {
    navToken += 1;
    const token = navToken;
    clearRocketMotion();
    activeRawCoordinate = false;
    setBubble("");
    if (!rocketPose || !rocketSide) {
      rocketPose = null;
      rocketSide = null;
      rocketHoldOpen = false;
      activePoint = false;
      rocketHand.classList.remove("visible", "thrusting");
      targetPulse.classList.remove("visible");
      setRocketGesture("perched", null);
      scheduleRoam();
      return;
    }
    returnRocket(token);
  }

  let pendingLandingResolve = null;

  function flyTo(point, options = {}) {
    navToken += 1;
    const token = navToken;
    clearRocketMotion();
    activePoint = true;
    if (perchFrame) cancelAnimationFrame(perchFrame);
    perchFrame = 0;
    const to = options.resolveTarget?.() || { x: point.x, y: point.y };
    const alreadyDetached = Boolean(rocketPose && rocketSide);
    rocketSide = rocketSide || rocketPet.chooseLaunchSide(position, to);
    const from = rocketPose
      ? { x: rocketPose.x, y: rocketPose.y }
      : rocketPet.shoulderPoint(position, rocketSide);
    const label = point.label || "right here";
    activeRawCoordinate = Boolean(options.rawCoordinate);
    rocketHoldOpen = Boolean(options.holdOpen);
    setRocketGesture(alreadyDetached ? "flight" : "ignition", rocketSide);
    streamBubbleText(label, token);
    scheduleRoam();

    return new Promise((resolve) => {
      pendingLandingResolve = resolve;
      const begin = () => {
        if (token !== navToken) return;
        setRocketGesture("flight", rocketSide);
        animateRocketSegment(from, to, token, { resolveTarget: options.resolveTarget }).then((landed) => {
          if (token !== navToken) return;
          if (!landed) {
            pendingLandingResolve = null;
            resolve(false);
            recallRocket();
            return;
          }
          const rotation = Math.atan2(landed.y - position.y, landed.x - position.x) * 180 / Math.PI;
          setRocketPose({ ...landed, rotation }, false);
          setRocketGesture("point", rocketSide);
          targetPulse.style.left = `${landed.x}px`;
          targetPulse.style.top = `${landed.y}px`;
          targetPulse.classList.add("visible");
          options.onLand?.();
          if (options.resolveTarget && !reducedMotionQuery.matches) {
            const trackTarget = () => {
              if (token !== navToken) return;
              const tracked = options.resolveTarget();
              if (tracked) {
                const trackedRotation = Math.atan2(tracked.y - position.y, tracked.x - position.x) * 180 / Math.PI;
                setRocketPose({ ...tracked, rotation: trackedRotation }, false);
                targetPulse.style.left = `${tracked.x}px`;
                targetPulse.style.top = `${tracked.y}px`;
              }
              rocketFrame = requestAnimationFrame(trackTarget);
            };
            rocketFrame = requestAnimationFrame(trackTarget);
          }
          pendingLandingResolve = null;
          resolve(true);
          if (rocketHoldOpen) return;
          const hold = Math.min(Math.max(label.length * 30 + 800, 1200), 8600);
          rocketTimer = setTimeout(() => returnRocket(token), hold);
        });
      };
      if (alreadyDetached || reducedMotionQuery.matches) begin();
      else {
        const recoil = rocketSide === "left" ? 3 : -3;
        transformCursor(position.x, position.y, 0, 1, recoil);
        rocketTimer = setTimeout(() => {
          transformCursor(position.x, position.y);
          begin();
        }, 180);
      }
    });
  }

  function isSafePerch(point) {
    const element = document.elementFromPoint(point.x, point.y);
    if (!element || element === host || host.contains(element)) return false;
    if (element.closest?.("button,a[href],input,textarea,select,[role='button'],[role='link'],[role='tab'],[role='menuitem']")) return false;
    const rect = element.getBoundingClientRect();
    const text = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    return text.length < 48 || rect.width * rect.height > 180000;
  }

  function animatePerchHop(to) {
    if (activePoint || petDragging || reducedMotionQuery.matches) return;
    if (perchFrame) cancelAnimationFrame(perchFrame);
    const from = { ...position };
    const started = performance.now();
    const step = (now) => {
      if (activePoint || petDragging || !visible()) return;
      const raw = Math.min((now - started) / 460, 1);
      const t = rocketPet.smoothstep(raw);
      transformCursor(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t - Math.sin(raw * Math.PI) * 18,
      );
      if (raw < 1) perchFrame = requestAnimationFrame(step);
      else {
        perchFrame = 0;
        transformCursor(to.x, to.y);
        scheduleRoam();
      }
    };
    perchFrame = requestAnimationFrame(step);
  }

  function scheduleRoam() {
    if (roamTimer) clearTimeout(roamTimer);
    roamTimer = 0;
    if (!visible()) return;
    roamTimer = setTimeout(() => {
      roamTimer = 0;
      if (activePoint || petDragging || mode !== "idle" || reducedMotionQuery.matches) {
        scheduleRoam();
        return;
      }
      const next = rocketPet.chooseNearbyPerch(
        mouse,
        position,
        { width: innerWidth, height: innerHeight },
        isSafePerch,
      );
      if (next) animatePerchHop(next);
      else scheduleRoam();
    }, 8000 + Math.random() * 6000);
  }

  function elementLabel(element) {
    if (element.matches("input[type='password'],input[type='file']")) return element.getAttribute("aria-label") || element.getAttribute("placeholder") || "protected input";
    const semantic = element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("placeholder") || element.getAttribute("alt") || "";
    return String(semantic || element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function elementRole(element) {
    return element.getAttribute("role") || element.tagName.toLowerCase();
  }

  function isActionable(element) {
    if (element.getAttribute("aria-disabled") === "true" || element.matches(":disabled")) return false;
    return element.matches("button,a[href],input:not([type='password']):not([type='file']),textarea,select,[role='button'],[role='link'],[role='tab'],[role='menuitem'],[role='switch'],[role='checkbox']");
  }

  function selectorHint(element) {
    if (!(element instanceof HTMLElement)) return "";
    if (element.id) return `#${element.id.slice(0, 80)}`;
    const aria = element.getAttribute("aria-label") || element.getAttribute("name") || element.getAttribute("placeholder");
    if (aria) return `${element.tagName.toLowerCase()}[${aria.replace(/\s+/g, " ").trim().slice(0, 80)}]`;
    return element.tagName.toLowerCase();
  }

  function labElementPayload(element) {
    if (!(element instanceof HTMLElement) || element === host || host.contains(element)) return null;
    const rect = element.getBoundingClientRect();
    const inputType = element instanceof HTMLInputElement ? element.type.toLowerCase() : "";
    const safeControl = ["radio", "checkbox"].includes(inputType) || element instanceof HTMLSelectElement;
    return {
      url: location.href,
      title: document.title,
      tagName: element.tagName.toLowerCase(),
      role: elementRole(element),
      text: elementLabel(element),
      label: element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("placeholder") || "",
      selector: selectorHint(element),
      actionable: isActionable(element),
      controlState: safeControl ? {
        inputType: inputType || element.tagName.toLowerCase(),
        checked: element instanceof HTMLInputElement ? element.checked : undefined,
        value: String(element instanceof HTMLSelectElement ? element.value : element.getAttribute("value") || "").slice(0, 80),
      } : undefined,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      },
    };
  }

  function emitLabInteraction(kind, element) {
    if (!extensionState.labActive) return;
    const payload = labElementPayload(element);
    if (!payload) return;
    void runtimeSend({ type: "TARS_LAB_INTERACTION", kind, payload });
  }

  function isGitHubPrivateRepositoryLab() {
    return extensionState.labActive
      && extensionState.labWorkflow === githubLabRules?.PRIVATE_REPOSITORY_WORKFLOW
      && location.hostname === "github.com";
  }

  function associatedControlText(element) {
    if (!(element instanceof Element)) return "";
    const pieces = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("value"),
      element.textContent,
      element.closest("label,[role='radio']")?.textContent,
    ];
    if (element.id) {
      try { pieces.push(document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent); } catch {}
    }
    return pieces.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 320);
  }

  function githubVisibilitySignal(element) {
    if (!(element instanceof Element)) return null;
    const control = element.closest("input[type='radio'],[role='radio']") || element;
    const selected = control instanceof HTMLInputElement
      ? control.checked
      : control.getAttribute("aria-checked") === "true"
        || control.getAttribute("data-state") === "checked";
    return {
      selected,
      value: control.getAttribute("value") || "",
      label: control.getAttribute("aria-label") || control.getAttribute("title") || "",
      text: control.textContent || "",
      ancestorText: associatedControlText(control),
    };
  }

  function checkedGitHubVisibility() {
    const publicMeta = document.querySelector('meta[name="octolytics-dimension-repository_public"]')?.getAttribute("content");
    if (publicMeta === "true") return "public";
    if (publicMeta === "false") return "private";
    const selected = document.querySelectorAll(
      "input[type='radio']:checked,[role='radio'][aria-checked='true'],[role='radio'][data-state='checked']",
    );
    for (const element of selected) {
      const visibility = githubLabRules?.visibilityFromSignal(githubVisibilitySignal(element) || {});
      if (visibility) return visibility;
    }
    const repositoryHeader = document.querySelector(
      "#repository-container-header,[data-testid='repository-header'],[aria-label='Repository navigation']",
    );
    if (repositoryHeader) {
      const labels = repositoryHeader.querySelectorAll("[aria-label],[title],span,strong,div");
      for (const element of labels) {
        const text = associatedControlText(element).toLowerCase();
        if (text === "private" || /\brepository\s+visibility:\s*private\b/.test(text)) return "private";
        if (text === "public" || /\brepository\s+visibility:\s*public\b/.test(text)) return "public";
      }
    }
    return "unknown";
  }

  function privateVisibilityTarget() {
    const candidates = document.querySelectorAll("input[type='radio'],[role='radio'],label");
    for (const element of candidates) {
      if (!/\bprivate\b/i.test(associatedControlText(element))) continue;
      const target = element instanceof HTMLElement ? element : element.parentElement;
      if (target?.getBoundingClientRect().width) return target;
    }
    return null;
  }

  function githubRepositoryState() {
    const repositoryId = document.querySelector('meta[name="octolytics-dimension-repository_id"]')?.getAttribute("content") || "";
    const repositoryNwo = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.getAttribute("content") || "";
    return githubLabRules?.repositoryState({
      hostname: location.hostname,
      pathname: location.pathname,
      repositoryId,
      repositoryNwo,
      visibility: checkedGitHubVisibility(),
    }) || {};
  }

  function emitGitHubStateSnapshot() {
    githubSnapshotTimer = 0;
    if (!isGitHubPrivateRepositoryLab()) return;
    const state = githubRepositoryState();
    const signature = JSON.stringify({ url: location.href, state });
    if (signature === lastGitHubSnapshotSignature) return;
    lastGitHubSnapshotSignature = signature;
    void runtimeSend({
      type: "TARS_LAB_INTERACTION",
      kind: "state_snapshot",
      payload: {
        url: location.href,
        title: document.title,
        visibleText: [state.pageKind, state.repositoryVisibility, state.repositoryNameWithOwner].filter(Boolean).join(" "),
        state,
      },
    });
    if (state.repositoryCreated && state.repositoryVisibility === "public") {
      reportGitHubPublicSelection("public_repository_created");
    }
  }

  function scheduleGitHubStateSnapshot(delay = 180) {
    if (!isGitHubPrivateRepositoryLab()) return;
    if (githubSnapshotTimer) clearTimeout(githubSnapshotTimer);
    githubSnapshotTimer = setTimeout(emitGitHubStateSnapshot, delay);
  }

  function reportGitHubPublicSelection(reason) {
    if (!isGitHubPrivateRepositoryLab() || checkedGitHubVisibility() !== "public") return;
    const signal = `${location.href}:${reason}`;
    if (signal === lastGitHubPolicySignal && reason !== "blocked_submit") return;
    lastGitHubPolicySignal = signal;
    const target = privateVisibilityTarget();
    const rect = target?.getBoundingClientRect();
    void runtimeSend({
      type: "TARS_LAB_POLICY_VIOLATION",
      code: "github_repository_public",
      payload: {
        url: location.href,
        title: document.title,
        observed: "public",
        expected: "private",
        reason,
        targetRect: rect ? {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
        } : null,
      },
    });
  }

  function githubCreateAction(element) {
    if (!(element instanceof Element)) return null;
    const action = element.closest("button,input[type='submit'],[role='button']");
    if (action instanceof HTMLElement && githubLabRules?.isCreateRepositoryAction(associatedControlText(action))) {
      return action;
    }
    const form = element instanceof HTMLFormElement ? element : element.closest("form");
    if (!form) return null;
    for (const candidate of form.querySelectorAll("button,input[type='submit'],[role='button']")) {
      if (candidate instanceof HTMLElement && githubLabRules?.isCreateRepositoryAction(associatedControlText(candidate))) {
        return candidate;
      }
    }
    return null;
  }

  function observeGitHubCreate(event) {
    if (!isGitHubPrivateRepositoryLab()) return false;
    const action = githubCreateAction(event.target);
    if (!action) return false;
    scheduleGitHubStateSnapshot(0);
    return false;
  }

  function visibleAutomationElement(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 1
      && rect.height > 1
      && style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) !== 0;
  }

  function automationAction(root, patterns) {
    const candidates = root.querySelectorAll(
      "button,input[type='button'],input[type='submit'],[role='button'],summary,a[href]",
    );
    return [...candidates].find((element) => {
      if (!visibleAutomationElement(element) || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
      const text = associatedControlText(element).replace(/\s+/g, " ").trim();
      return patterns.some((pattern) => pattern.test(text));
    }) || null;
  }

  function automationElementInViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }

  async function flyAutomationCursorTo(element, label) {
    if (!visibleAutomationElement(element)) return false;
    if (!automationElementInViewport(element)) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      setStatus(`Tars is scrolling to ${label}`, true, 3000);
      await new Promise((resolve) => setTimeout(resolve, 1400));
    }
    if (!visibleAutomationElement(element) || !automationElementInViewport(element)) return false;
    const rect = element.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const landed = await flyTo({ ...point, label }, {
      holdOpen: true,
      resolveTarget: () => {
        if (!element.isConnected) return null;
        const liveRect = element.getBoundingClientRect();
        return { x: liveRect.left + liveRect.width / 2, y: liveRect.top + liveRect.height / 2 };
      },
    });
    if (!landed || !element.isConnected) return false;
    const landedToken = navToken;
    // The bubble belongs exclusively to the Realtime transcript. The cursor
    // movement itself shows which control Tars is operating.
    if (transcriptText) setBubble(transcriptText);
    await new Promise((resolve) => setTimeout(resolve, 650));
    if (
      landedToken !== navToken
      || !visibleAutomationElement(element)
      || !automationElementInViewport(element)
      || element.disabled
      || element.getAttribute("aria-disabled") === "true"
    ) return false;
    return true;
  }

  async function automationClick(element, label) {
    if (!await flyAutomationCursorTo(element, label)) return false;
    element.focus({ preventScroll: true });
    element.click();
    rocketHoldOpen = false;
    rocketTimer = setTimeout(() => returnRocket(navToken), 320);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    return true;
  }

  function reportGithubPrivateAutomation(status) {
    void runtimeSend({
      type: "TARS_GITHUB_PRIVATE_AUTOMATION_RESULT",
      status,
    });
  }

  function finishGithubPrivateAutomation(status, keepPointer = false) {
    githubPrivateAutomationRunning = false;
    githubPrivateHandoffActive = keepPointer;
    if (!keepPointer) recallRocket();
    if (transcriptText) setBubble(transcriptText);
    reportGithubPrivateAutomation(status);
  }

  async function automateGithubRepositoryPrivate(repositoryNameWithOwner) {
    if (githubPrivateAutomationRunning) return;
    const repositoryNwo = String(repositoryNameWithOwner || "").trim();
    if (
      !isGitHubPrivateRepositoryLab()
      || location.hostname !== "github.com"
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryNwo)
      || !location.pathname.startsWith(`/${repositoryNwo}`)
    ) {
      finishGithubPrivateAutomation("failed");
      return;
    }

    githubPrivateAutomationRunning = true;
    githubPrivateHandoffActive = false;
    setStatus("Tars is taking you to Change visibility", true, 12_000);
    // Let Realtime begin narrating before the first visible cursor action.
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const deadline = Date.now() + 45_000;
    let lastActionAt = 0;
    while (Date.now() < deadline) {
      if (checkedGitHubVisibility() === "private") {
        scheduleGitHubStateSnapshot(0);
        finishGithubPrivateAutomation("private");
        return;
      }

      if (location.pathname !== `/${repositoryNwo}/settings`) {
        const settingsLink = [...document.querySelectorAll(`a[href="/${repositoryNwo}/settings"]`)]
          .find((element) => visibleAutomationElement(element));
        if (settingsLink) {
          await automationClick(settingsLink, "repository settings");
          lastActionAt = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        finishGithubPrivateAutomation("failed");
        return;
      }

      const openVisibility = automationAction(document, [
        /^change visibility$/i,
        /^change repository visibility$/i,
      ]);
      if (openVisibility) {
        if (await flyAutomationCursorTo(openVisibility, "change visibility")) {
          finishGithubPrivateAutomation("handoff", true);
          return;
        }
      } else {
        scrollBy({ top: Math.max(420, innerHeight * 0.72), behavior: "smooth" });
        setStatus("Tars is looking for Change visibility", true, 3000);
        await new Promise((resolve) => setTimeout(resolve, 1400));
      }

      await new Promise((resolve) => setTimeout(resolve, 650));
      if (lastActionAt && Date.now() - lastActionAt > 12_000) break;
    }
    finishGithubPrivateAutomation("failed");
  }

  function showLabCoach(message) {
    const text = String(message?.text || "").replace(/\s+/g, " ").trim().slice(0, 260);
    const rect = message?.targetRect;
    setMode("thinking");
    if (rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
      void flyTo({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        label: text,
      }, { rawCoordinate: true });
    } else {
      setBubble(text);
    }
  }

  function collectDomTargets(contextId) {
    const selector = [
      "button", "a[href]", "input", "textarea", "select", "[role='button']", "[role='link']",
      "[role='tab']", "[role='menuitem']", "[role='option']", "[role='switch']", "[role='checkbox']",
      "[aria-label]", "[title]", "h1", "h2", "h3", "h4", "h5", "h6", "label", "summary", "p", "li", "td", "th", "code",
    ].join(",");
    const candidates = new Set(document.querySelectorAll(selector));
    if (document.body) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
        if (text.length >= 2 && parent && parent.childElementCount === 0 && !parent.matches("script,style,noscript,textarea")) candidates.add(parent);
      }
    }
    const ranked = [...candidates].sort((a, b) => {
      const score = (element) => (isActionable(element) ? 800 : 0) + (element.hasAttribute("aria-label") || element.hasAttribute("title") ? 500 : 0) + (element.childElementCount === 0 ? 250 : 0);
      return score(b) - score(a);
    });
    const elements = [];
    const targetMap = new Map();
    const seen = new Set();
    for (const element of ranked) {
      if (!(element instanceof HTMLElement) || element === host || host.contains(element)) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4 || rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight) continue;
      const text = elementLabel(element);
      if (!text && !element.matches("input,textarea,select")) continue;
      const clipped = {
        x: Math.max(0, rect.left),
        y: Math.max(0, rect.top),
        width: Math.max(1, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)),
        height: Math.max(1, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)),
      };
      const dedupe = `${elementRole(element)}|${text.toLowerCase()}|${Math.round(clipped.x)}|${Math.round(clipped.y)}|${Math.round(clipped.width)}|${Math.round(clipped.height)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const id = `dom-${contextId.slice(0, 8)}-${elements.length}`;
      elements.push({ id, role: elementRole(element), text: text || elementRole(element), actionable: isActionable(element), rect: clipped });
      targetMap.set(id, element);
      if (elements.length >= MAX_TARGETS) break;
    }
    currentTargets = targetMap;
    currentContextId = contextId;
    lastCollectedElements = elements;
    return elements;
  }

  function visibleMedia() {
    return [...document.querySelectorAll("video,audio")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 8 && rect.height > 8 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      })
      .sort((a, b) => {
        const first = a.getBoundingClientRect();
        const second = b.getBoundingClientRect();
        return second.width * second.height - first.width * first.height;
      })[0] || null;
  }

  function mediaContext() {
    const media = visibleMedia();
    if (!media) return {};
    const mediaRect = media.getBoundingClientRect();
    const left = Math.max(0, mediaRect.left);
    const top = Math.max(0, mediaRect.top);
    const right = Math.min(innerWidth, mediaRect.right);
    const bottom = Math.min(innerHeight, mediaRect.bottom);
    const captions = [...document.querySelectorAll(".ytp-caption-segment")]
      .map((element) => element.textContent?.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 1600);
    const transcript = document.querySelector("ytd-transcript-segment-list-renderer, [target-id='engagement-panel-searchable-transcript']")?.textContent
      ?.replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000) || "";
    return {
      kind: media.tagName.toLowerCase(),
      currentTime: Number.isFinite(media.currentTime) ? Number(media.currentTime.toFixed(2)) : null,
      duration: Number.isFinite(media.duration) ? Number(media.duration.toFixed(2)) : null,
      paused: media.paused,
      muted: media.muted,
      playbackRate: media.playbackRate,
      rect: {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      },
      intrinsicWidth: media instanceof HTMLVideoElement ? media.videoWidth : 0,
      intrinsicHeight: media instanceof HTMLVideoElement ? media.videoHeight : 0,
      visibleCaptions: captions,
      transcript,
    };
  }

  function nonDomRegionContext() {
    const candidates = [...document.querySelectorAll("iframe,canvas,img")]
      .filter((element) => {
        if (!(element instanceof HTMLElement) || element === host || host.contains(element)) return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = element.getBoundingClientRect();
        return rect.width >= 120 && rect.height >= 90
          && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      })
      .sort((first, second) => {
        const a = first.getBoundingClientRect();
        const b = second.getBoundingClientRect();
        return b.width * b.height - a.width * a.height;
      });
    const element = candidates[0];
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right);
    const bottom = Math.min(innerHeight, rect.bottom);
    const semantic = element.getAttribute("aria-label")
      || element.getAttribute("title")
      || element.getAttribute("alt")
      || element.getAttribute("name")
      || element.tagName.toLowerCase();
    return {
      kind: element.tagName.toLowerCase(),
      label: String(semantic).replace(/\s+/g, " ").trim().slice(0, 120),
      rect: {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      },
    };
  }

  function preparePtt() {
    const media = visibleMedia();
    if (media && !media.paused) media.pause();
    clearDrawings();
    startCtrlTrail(mouse);
    transcriptText = "";
    resetTranscriptMergeState();
    setBubble("");
  }

  function collectContext(contextId) {
    const elements = collectDomTargets(contextId);
    return {
      ok: true,
      context: {
        contextId,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          devicePixelRatio,
          scrollX,
          scrollY,
        },
        page: {
          title: document.title.slice(0, 240),
          url: location.href.slice(0, 1200),
          language: document.documentElement.lang || navigator.language,
        },
        media: mediaContext(),
        focusRegion: nonDomRegionContext(),
        ctrlGesture,
        elements,
      },
    };
  }

  function pointForElement(element, label) {
    const quoted = label?.match(/['\"]([^'\"]+)['\"]/)?.[1]?.trim();
    const cleaned = String(label || "").replace(/['\"]/g, "").replace(/\b(the|word|text|button|link|field|icon|right|here)\b/gi, " ").replace(/\s+/g, " ").trim();
    const needles = [quoted, cleaned].filter((value) => value && value.length >= 2).sort((a, b) => b.length - a.length);
    if (needles.length) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent || "";
        for (const needle of needles) {
          const start = text.toLowerCase().indexOf(needle.toLowerCase());
          if (start < 0) continue;
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + needle.length);
          const rect = range.getBoundingClientRect();
          if (rect.width >= 1 && rect.height >= 1) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
      }
    }
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function sensitiveReason(element, label) {
    const text = `${label || ""} ${elementLabel(element)}`;
    if (element.matches("input[type='password'],input[type='file']")) return "This action uses a protected password or file field.";
    if (element.matches("button[type='submit'],input[type='submit']")) return "This action submits a form.";
    if (element.matches("button:not([type])") && element.closest("form")) return "This button may submit a form.";
    if (SENSITIVE_TEXT.test(text)) return `This may perform a sensitive action: “${elementLabel(element) || label}”.`;
    return "";
  }

  function confirmAction(action, reason) {
    pendingConfirmation = action;
    confirmCopy.textContent = reason;
    confirmLayer.classList.add("visible");
  }

  confirmCancel.addEventListener("click", () => {
    pendingConfirmation = null;
    confirmLayer.classList.remove("visible");
  });
  confirmAccept.addEventListener("click", () => {
    const action = pendingConfirmation;
    pendingConfirmation = null;
    confirmLayer.classList.remove("visible");
    if (typeof action === "function") action();
  });

  function maybeClick(element, label) {
    if (!element?.isConnected || !isActionable(element)) return;
    const reason = sensitiveReason(element, label);
    if (reason) {
      confirmAction(() => {
        if (!element?.isConnected) return;
        element.focus({ preventScroll: true });
        element.click();
      }, reason);
    }
    else {
      element.focus({ preventScroll: true });
      element.click();
    }
  }

  function validContext(context) {
    return visible() && context?.contextId === currentContextId && context?.tabId != null;
  }

  function validCoordinateClickContext(context) {
    if (!validContext(context)) return false;
    const capturedAt = Number(context.capturedAt);
    const viewport = context.viewport || {};
    return Number.isFinite(capturedAt)
      && Date.now() - capturedAt <= 30_000
      && (!context.pageUrl || context.pageUrl === location.href)
      && Math.abs(Number(viewport.width) - innerWidth) <= 1
      && Math.abs(Number(viewport.height) - innerHeight) <= 1
      && Math.abs(Number(viewport.scrollX || 0) - scrollX) <= 1
      && Math.abs(Number(viewport.scrollY || 0) - scrollY) <= 1;
  }

  function requestCoordinateClick(context, point, label) {
    if (!validCoordinateClickContext(context)) {
      setStatus("The page moved, so Tars did not click", true, 5000);
      return;
    }
    const target = document.elementFromPoint(point.x, point.y);
    if (!(target instanceof HTMLElement) || target === host || host.contains(target)) {
      setStatus("Tars couldn't safely click that location", true, 5000);
      return;
    }
    const run = () => {
      if (!validCoordinateClickContext(context)) {
        setStatus("The page moved, so Tars did not click", true, 5000);
        return;
      }
      void runtimeSend({
        type: "TARS_COORDINATE_CLICK",
        contextId: context.contextId,
        x: point.x,
        y: point.y,
      }).then((result) => {
        if (!result?.ok) setStatus("Tars couldn't complete that visual click", true, 5000);
      });
    };
    const reason = sensitiveReason(target, label);
    if (reason) confirmAction(run, reason);
    else run();
  }

  function handlePoint(context, response) {
    if (!validContext(context)) {
      console.warn("[Tars] ignored point for stale or inactive context", {
        incoming: context?.contextId,
        current: currentContextId,
      });
      return;
    }
    const target = response?.targetId ? currentTargets.get(response.targetId) : null;
    if (target?.isConnected) {
      const point = pointForElement(target, response.label);
      void flyTo({ ...point, label: response.label }, {
        resolveTarget: () => target.isConnected ? pointForElement(target, response.label) : null,
        onLand: response.action === "click" ? () => maybeClick(target, response.label) : undefined,
      });
      return;
    }
    if (typeof response?.x === "number" && typeof response?.y === "number" && context.screenshotWidth && context.screenshotHeight) {
      const point = responsePoint(context, response.x, response.y, response.coordinate_space);
      if (point) {
        void flyTo({ ...point, label: response.label }, {
          rawCoordinate: true,
          onLand: response.action === "click"
            ? () => requestCoordinateClick(context, point, response.label)
            : undefined,
        });
      }
      else setStatus("Tars couldn't map that point", true);
      return;
    }
    console.warn("[Tars] point response had no target or coordinates", response);
    setStatus("Tars couldn't lock onto that target", true);
  }

  function mediaAction(action, value) {
    const media = visibleMedia();
    if (!media) return;
    if (action === "pause_media") media.pause();
    else if (action === "play_media") void media.play().catch(() => setStatus("Click the page once, then ask Tars to resume", true));
    else if (action === "seek_media" && Number.isFinite(Number(value))) {
      media.currentTime = Math.max(0, Math.min(Number.isFinite(media.duration) ? media.duration : Number(value), Number(value)));
    }
  }

  function handleAction(context, response) {
    if (!validContext(context)) return;
    const action = response?.action;
    if (action === "scroll_up") scrollBy({ top: -Math.max(320, innerHeight * 0.72), behavior: "smooth" });
    else if (action === "scroll_down") scrollBy({ top: Math.max(320, innerHeight * 0.72), behavior: "smooth" });
    else if (["pause_media", "play_media", "seek_media"].includes(action)) mediaAction(action, response.value);
  }

  function svgElement(name, attributes) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value != null) element.setAttribute(key, String(value));
    }
    return element;
  }

  function clearDrawings() {
    drawingLifetime?.clear();
    drawings.replaceChildren();
    ctrlTrailGroup = null;
    ctrlTrailPoints = [];
  }

  function clippedRect(rect) {
    return {
      x: Math.max(0, rect.left),
      y: Math.max(0, rect.top),
      width: Math.max(1, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)),
      height: Math.max(1, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)),
    };
  }

  function nearestElementSummary(point) {
    let element = document.elementFromPoint(point.x, point.y);
    if (element && host.contains(element)) element = null;
    if (element instanceof HTMLElement && element !== host) {
      const rect = element.getBoundingClientRect();
      if (rect.width >= 2 && rect.height >= 2) {
        return {
          role: elementRole(element),
          text: elementLabel(element),
          actionable: isActionable(element),
          rect: clippedRect(rect),
        };
      }
    }
    const nearest = lastCollectedElements
      .map((item) => {
        const rect = item.rect || {};
        const cx = Number(rect.x || 0) + Number(rect.width || 0) / 2;
        const cy = Number(rect.y || 0) + Number(rect.height || 0) / 2;
        return { item, distance: Math.hypot(cx - point.x, cy - point.y) };
      })
      .sort((a, b) => a.distance - b.distance)[0];
    return nearest?.distance < 90 ? nearest.item : null;
  }

  const CTRL_TRAIL_LIFETIME_MS = 320;
  const CTRL_TRAIL_MAX_POINTS = 72;
  const CTRL_GESTURE_MAX_POINTS = 220;

  function ensureCtrlTrailGroup() {
    if (ctrlTrailGroup) return ctrlTrailGroup;
    ctrlTrailGroup = svgElement("g", { "data-tars-ctrl-trail": "true" });
    drawings.appendChild(ctrlTrailGroup);
    return ctrlTrailGroup;
  }

  function scheduleCtrlTrailRender() {
    if (ctrlTrailFrame) return;
    ctrlTrailFrame = requestAnimationFrame(() => {
      ctrlTrailFrame = 0;
      renderCtrlTrail();
      if (pttHeld || ctrlTrailPoints.length) scheduleCtrlTrailRender();
    });
  }

  function renderCtrlTrail() {
    const now = performance.now();
    ctrlTrailPoints = ctrlTrailPoints.filter((point) => now - point.t <= CTRL_TRAIL_LIFETIME_MS);
    if (!ctrlTrailPoints.length) {
      if (ctrlTrailGroup) ctrlTrailGroup.remove();
      ctrlTrailGroup = null;
      return;
    }

    const group = ensureCtrlTrailGroup();
    group.replaceChildren();
    for (let index = 1; index < ctrlTrailPoints.length; index += 1) {
      const previous = ctrlTrailPoints[index - 1];
      const point = ctrlTrailPoints[index];
      const age = Math.max(0, now - previous.t);
      const opacity = Math.max(0, Math.min(0.78, 1 - age / CTRL_TRAIL_LIFETIME_MS));
      if (opacity <= 0.03) continue;
      group.appendChild(svgElement("line", {
        class: "ctrl-trail-segment",
        x1: previous.x.toFixed(1),
        y1: previous.y.toFixed(1),
        x2: point.x.toFixed(1),
        y2: point.y.toFixed(1),
        opacity: opacity.toFixed(3),
      }));
    }
  }

  function startCtrlTrail(point) {
    const stamped = { x: point.x, y: point.y, t: performance.now() };
    ctrlTrailPoints = [stamped];
    ctrlGesturePoints = [stamped];
    ctrlGesture = null;
    ensureCtrlTrailGroup();
    renderCtrlTrail();
    scheduleCtrlTrailRender();
  }

  function recordCtrlTrailPoint(point) {
    if (!pttHeld) return;
    const previous = ctrlTrailPoints[ctrlTrailPoints.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 4) return;
    const stamped = { x: point.x, y: point.y, t: performance.now() };
    ctrlTrailPoints.push(stamped);
    ctrlGesturePoints.push(stamped);
    if (ctrlTrailPoints.length > CTRL_TRAIL_MAX_POINTS) ctrlTrailPoints.shift();
    if (ctrlGesturePoints.length > CTRL_GESTURE_MAX_POINTS) ctrlGesturePoints.shift();
    renderCtrlTrail();
    scheduleCtrlTrailRender();
  }

  function finishCtrlTrail() {
    const points = ctrlGesturePoints.slice();
    scheduleCtrlTrailRender();
    const classified = TarsGroundingGeometry.classifyCtrlGesture(points);
    if (!classified) return null;
    const gesture = {
      ...classified.gesture,
      nearestElement: nearestElementSummary(classified.referencePoint),
    };
    ctrlGesture = gesture;
    ctrlGesturePoints = [];
    return gesture;
  }

  function screenshotPoint(context, x, y) {
    return TarsGroundingGeometry.screenshotToViewportPoint({
      x,
      y,
      screenshotWidth: context.screenshotWidth,
      screenshotHeight: context.screenshotHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    });
  }

  function responsePoint(context, x, y, coordinateSpace) {
    if (coordinateSpace === "media" && context.mediaRect) {
      if (typeof x !== "number" || typeof y !== "number") return null;
      const mediaX = context.mediaRect.x + (Math.max(0, Math.min(1000, x)) / 1000) * context.mediaRect.width;
      const mediaY = context.mediaRect.y + (Math.max(0, Math.min(1000, y)) / 1000) * context.mediaRect.height;
      return screenshotPoint(context, mediaX, mediaY);
    }
    return screenshotPoint(context, x, y);
  }

  function targetRect(targetId) {
    const element = targetId ? currentTargets.get(targetId) : null;
    return element?.isConnected ? element.getBoundingClientRect() : null;
  }

  function handleDraw(context, tool, response) {
    if (!validContext(context)) return;
    if (tool === "clear_screen_drawings") {
      clearDrawings();
      return;
    }
    const annotationId = String(response.annotation_id || crypto.randomUUID());
    // Stable ids make each grounded model tool call independently traceable.
    for (const child of [...drawings.children]) {
      if (child.getAttribute("data-annotation-id") === annotationId) child.remove();
    }
    if (response.remove === true) return;
    const annotationGroup = svgElement("g", {
      "data-annotation-id": annotationId,
      class: "annotation",
      opacity: response.provisional === true ? 0.42 : 1,
    });
    const colors = { blue: "#3380ff", teal: "#14b8a6", red: "#ef4444", amber: "#f59e0b", purple: "#8b5cf6" };
    const color = colors[response.color] || colors.blue;
    const shape = response.shape || "rectangle";
    const strokeStyle = response.style === "dashed" ? "dashed"
      : response.style === "dotted" ? "dotted" : "";
    const rect = targetRect(response.target_id);
    const fromRect = targetRect(response.from_target_id);
    const toRect = targetRect(response.to_target_id);
    const rawStart = responsePoint(context, response.x, response.y, response.coordinate_space);
    const rawEnd = responsePoint(context, response.end_x, response.end_y, response.coordinate_space);
    // strokeAttrs is spread into every stroked SVG element so dash style is
    // applied uniformly across shapes.
    const strokeAttrs = strokeStyle
      ? { class: `stroke ${strokeStyle}`, pathLength: null }
      : { class: "stroke", pathLength: 1 };

    // ── Text annotation ──────────────────────────────────────
    // Places a short label at a viewport position. Uses the DOM element rect
    // center if a target_id is given, otherwise raw x/y.
    if (shape === "text") {
      const anchor = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : rawStart;
      if (!anchor) { setStatus("Tars couldn't place that text", true); return; }
      const textContent = String(response.label || "").slice(0, 200);
      if (!textContent) return;
      const text = svgElement("text", {
        x: anchor.x,
        y: anchor.y,
        fill: color,
        class: "draw-text",
        "dominant-baseline": "hanging",
      });
      text.textContent = textContent;
      annotationGroup.appendChild(text);
      drawings.appendChild(annotationGroup);
      drawingLifetime.markDrawn();
      return;
    }

    let element = null;
    let extraElements = [];
    let leaderLabelAnchor = null;

    if (["rectangle", "triangle", "highlight", "circle", "underline"].includes(shape) && rect) {
      if (shape === "triangle") {
        element = svgElement("polygon", { points: `${rect.left + rect.width / 2},${rect.top} ${rect.right},${rect.bottom} ${rect.left},${rect.bottom}`, fill: "none", stroke: color, "stroke-width": 3, "stroke-linejoin": "round", "pathLength": 1, ...strokeAttrs });
      } else if (shape === "circle") {
        element = svgElement("ellipse", { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, rx: rect.width / 2 + 8, ry: rect.height / 2 + 8, fill: "none", stroke: color, "stroke-width": 3, "pathLength": 1, ...strokeAttrs });
      } else if (shape === "underline") {
        element = svgElement("line", { x1: rect.left, y1: rect.bottom + 4, x2: rect.right, y2: rect.bottom + 4, stroke: color, "stroke-width": 4, "stroke-linecap": "round", "pathLength": 1, ...strokeAttrs });
      } else {
        element = svgElement("rect", { x: rect.left - 6, y: rect.top - 6, width: rect.width + 12, height: rect.height + 12, rx: 8, fill: shape === "highlight" ? color : "none", "fill-opacity": shape === "highlight" ? .18 : 0, stroke: color, "stroke-width": shape === "highlight" ? 1.5 : 3, "pathLength": 1, ...strokeAttrs });
      }
    } else if (["rectangle", "triangle", "highlight", "circle", "underline"].includes(shape) && rawStart) {
      // Pixels inside videos, canvas elements, and cross-origin iframes have no
      // DOM target. Draw directly in the calibrated screenshot coordinate
      // space instead of silently dropping the annotation.
      if (shape === "underline") {
        const end = rawEnd || { x: rawStart.x + 72, y: rawStart.y };
        element = svgElement("line", { x1: rawStart.x, y1: rawStart.y, x2: end.x, y2: end.y, stroke: color, "stroke-width": 4, "stroke-linecap": "round", "pathLength": 1, ...strokeAttrs });
      } else {
        const end = rawEnd || { x: rawStart.x + 68, y: rawStart.y + 68 };
        const left = Math.min(rawStart.x, end.x);
        const top = Math.min(rawStart.y, end.y);
        const width = Math.max(12, Math.abs(end.x - rawStart.x));
        const height = Math.max(12, Math.abs(end.y - rawStart.y));
        if (shape === "triangle") {
          element = svgElement("polygon", { points: `${left + width / 2},${top} ${left + width},${top + height} ${left},${top + height}`, fill: "none", stroke: color, "stroke-width": 3, "stroke-linejoin": "round", "pathLength": 1, ...strokeAttrs });
        } else if (shape === "circle") {
          element = svgElement("ellipse", { cx: left + width / 2, cy: top + height / 2, rx: width / 2, ry: height / 2, fill: "none", stroke: color, "stroke-width": 3, "pathLength": 1, ...strokeAttrs });
        } else {
          element = svgElement("rect", { x: left, y: top, width, height, rx: 8, fill: shape === "highlight" ? color : "none", "fill-opacity": shape === "highlight" ? .18 : 0, stroke: color, "stroke-width": shape === "highlight" ? 1.5 : 3, "pathLength": 1, ...strokeAttrs });
        }
      }
    } else if (shape === "arrow") {
      const start = fromRect ? { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 } : rawStart;
      const end = toRect ? { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 } : rawEnd;
      if (start && end) {
        leaderLabelAnchor = end;
        // Shorten the line slightly so the arrowhead tip sits exactly at end.
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = 14;
        const lineEndX = end.x - Math.cos(angle) * headLen * 0.6;
        const lineEndY = end.y - Math.sin(angle) * headLen * 0.6;
        element = svgElement("line", { x1: start.x, y1: start.y, x2: lineEndX, y2: lineEndY, stroke: color, "stroke-width": 3, "stroke-linecap": "round", "pathLength": 1, ...strokeAttrs });
        // Arrowhead: a filled triangle at the end point, rotated to the line angle.
        const p1x = end.x - Math.cos(angle - 0.42) * headLen;
        const p1y = end.y - Math.sin(angle - 0.42) * headLen;
        const p2x = end.x - Math.cos(angle + 0.42) * headLen;
        const p2y = end.y - Math.sin(angle + 0.42) * headLen;
        const head = svgElement("polygon", {
          points: `${end.x},${end.y} ${p1x},${p1y} ${p2x},${p2y}`,
          fill: color,
          stroke: color,
          "stroke-width": 1,
          "stroke-linejoin": "round",
          class: "stroke",
        });
        extraElements.push(head);
      }
    } else if (shape === "line") {
      const start = fromRect ? { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 } : rawStart;
      const end = toRect ? { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 } : rawEnd;
      if (start && end) {
        leaderLabelAnchor = end;
        element = svgElement("line", { x1: start.x, y1: start.y, x2: end.x, y2: end.y, stroke: color, "stroke-width": 3, "stroke-linecap": "round", "pathLength": 1, ...strokeAttrs });
      }
    }
    if (!element) {
      setStatus("Tars couldn't place that annotation", true);
      return;
    }
    annotationGroup.appendChild(element);
    for (const extra of extraElements) annotationGroup.appendChild(extra);
    const leaderLabel = String(response.label || "").trim().slice(0, 120);
    if (leaderLabelAnchor && leaderLabel) {
      const text = svgElement("text", {
        x: leaderLabelAnchor.x + 8,
        y: leaderLabelAnchor.y - 8,
        fill: color,
        class: "draw-text",
      });
      text.textContent = leaderLabel;
      annotationGroup.appendChild(text);
    }
    drawings.appendChild(annotationGroup);
    drawingLifetime.markDrawn();
  }

  function showSolMissingNotice(responses) {
    const missed = (responses || []).filter((response) =>
      response?.coordinate_source === "sol_missing"
      || response?.grounding_failure === "batch_locator_missing"
      || response?.grounding_failure === "batch_exception"
    );
    if (!missed.length) return;
    const labels = [...new Set(missed
      .map((response) => String(response.label || "").trim())
      .filter(Boolean))];
    const named = labels.length
      ? labels.slice(0, 3).join(", ") + (labels.length > 3 ? ` +${labels.length - 3} more` : "")
      : `${missed.length} target${missed.length === 1 ? "" : "s"}`;
    setStatus(`Sol missed ${named}; annotation skipped`, true, 5000);
  }

  function updateMouse(next) {
    mouse = { x: next.x, y: next.y };
    if (!rocketPose) updatePetGaze(mouse);
    recordCtrlTrailPoint(mouse);
    if (visible() && performance.now() - cursorReportAt > 120) {
      cursorReportAt = performance.now();
      void runtimeSend({ type: "TARS_CURSOR_POSITION", x: mouse.x, y: mouse.y });
    }
  }

  function startPtt(next) {
    if (next) updateMouse(next);
    if (!visible() || pttHeld) return;
    pttHeld = true;
    startCtrlTrail(mouse);
    setMode("listening");
    setStatus("Tars listening — release Ctrl");
    void runtimeSend({ type: "TARS_PTT_START" });
  }

  function stopPtt(next) {
    if (next) updateMouse(next);
    if (!pttHeld) return;
    pttHeld = false;
    finishCtrlTrail();
    setMode("thinking");
    setStatus("Tars thinking");
    void runtimeSend({ type: "TARS_PTT_STOP" });
  }

  // AWS keeps its service workspace in a same-origin, src-less iframe. During
  // console navigation it can replace that iframe's Document without a normal
  // top-level navigation. Chrome does not always reinject a manifest content
  // script for that replacement document, which used to leave Tars tracking
  // only the AWS header. Bind the top-frame controller directly to accessible
  // child windows as a lifecycle-safe fallback. Cross-origin frames continue
  // to use the postMessage relay above.
  const directFrameBindings = new WeakMap();
  const directFrameWatchers = new WeakMap();
  const observedFrameRoots = new WeakMap();
  const trackedDirectFrames = new Set();

  function directFramePoint(frameChain, childWindow, point) {
    let mapped = { x: point.x, y: point.y };
    let childViewportWidth = Number(childWindow?.innerWidth);
    let childViewportHeight = Number(childWindow?.innerHeight);

    for (let index = frameChain.length - 1; index >= 0; index -= 1) {
      const frame = frameChain[index];
      if (!frame?.isConnected) return null;
      const rect = frame.getBoundingClientRect();
      mapped = TarsGroundingGeometry.framePointToParentViewport({
        x: mapped.x,
        y: mapped.y,
        childViewportWidth,
        childViewportHeight,
        frameLeft: rect.left,
        frameTop: rect.top,
        frameWidth: rect.width,
        frameHeight: rect.height,
        frameOffsetWidth: frame.offsetWidth,
        frameOffsetHeight: frame.offsetHeight,
        frameClientLeft: frame.clientLeft,
        frameClientTop: frame.clientTop,
        frameClientWidth: frame.clientWidth,
        frameClientHeight: frame.clientHeight,
      });
      if (!mapped) return null;
      const parentWindow = frame.ownerDocument?.defaultView;
      childViewportWidth = Number(parentWindow?.innerWidth);
      childViewportHeight = Number(parentWindow?.innerHeight);
    }

    return mapped;
  }

  function bindDirectFrame(frame, frameChain) {
    let childWindow;
    let childDocument;
    try {
      childWindow = frame.contentWindow;
      childDocument = frame.contentDocument;
      if (!childWindow || !childDocument) return;
      // Accessing readyState forces the same-origin check before listeners are
      // installed. A later load event retries if the frame becomes accessible.
      void childDocument.readyState;
    } catch {
      return;
    }

    const existing = directFrameBindings.get(frame);
    if (existing?.window === childWindow && existing?.document === childDocument) {
      observeDirectFrameRoot(childDocument, frameChain);
      return;
    }
    existing?.cleanup();

    let frameMouse = { x: 0, y: 0 };
    let framePttHeld = false;
    const pointer = (event) => {
      if (!event.isTrusted) return;
      frameMouse = { x: event.clientX, y: event.clientY };
      const point = directFramePoint(frameChain, childWindow, frameMouse);
      if (point) updateMouse(point);
    };
    const keydown = (event) => {
      if (
        !event.isTrusted
        || event.key !== "Control"
        || event.metaKey
        || event.altKey
        || event.repeat
        || framePttHeld
      ) return;
      const point = directFramePoint(frameChain, childWindow, frameMouse);
      framePttHeld = true;
      if (point) startPtt(point);
    };
    const keyup = (event) => {
      if (!event.isTrusted || event.key !== "Control" || !framePttHeld) return;
      const point = directFramePoint(frameChain, childWindow, frameMouse);
      framePttHeld = false;
      stopPtt(point);
    };
    const blur = () => {
      if (!framePttHeld) return;
      const point = directFramePoint(frameChain, childWindow, frameMouse);
      framePttHeld = false;
      stopPtt(point);
    };

    childWindow.addEventListener("mousemove", pointer, true);
    childWindow.addEventListener("keydown", keydown, true);
    childWindow.addEventListener("keyup", keyup, true);
    childWindow.addEventListener("blur", blur, true);
    directFrameBindings.set(frame, {
      window: childWindow,
      document: childDocument,
      cleanup: () => {
        try {
          childWindow.removeEventListener("mousemove", pointer, true);
          childWindow.removeEventListener("keydown", keydown, true);
          childWindow.removeEventListener("keyup", keyup, true);
          childWindow.removeEventListener("blur", blur, true);
        } catch {
          // The old document may become inaccessible while AWS swaps it.
        }
      },
    });
    observeDirectFrameRoot(childDocument, frameChain);
  }

  function watchDirectFrame(frame, parentFrameChain) {
    if (!frame?.matches?.("iframe,frame")) return;
    const frameChain = [...parentFrameChain, frame];
    trackedDirectFrames.add(frame);
    const watcher = directFrameWatchers.get(frame);
    if (watcher) watcher.frameChain = frameChain;
    else {
      const nextWatcher = { frameChain };
      nextWatcher.load = () => {
        // Wait until the new inner Window and Document are observable.
        queueMicrotask(() => bindDirectFrame(frame, nextWatcher.frameChain));
        setTimeout(() => bindDirectFrame(frame, nextWatcher.frameChain), 50);
      };
      directFrameWatchers.set(frame, nextWatcher);
      frame.addEventListener("load", nextWatcher.load, true);
    }
    bindDirectFrame(frame, frameChain);
  }

  function scanDirectFrameNode(node, frameChain) {
    // Nodes observed inside a child document belong to that document's realm,
    // so an `instanceof Element` check against the top window would reject
    // them. nodeType is realm-independent.
    if (node?.nodeType !== 1) return;
    if (node.matches("iframe,frame")) watchDirectFrame(node, frameChain);
    if (node.shadowRoot) observeDirectFrameRoot(node.shadowRoot, frameChain);
    for (const frame of node.querySelectorAll("iframe,frame")) watchDirectFrame(frame, frameChain);
    for (const element of node.querySelectorAll("*")) {
      if (element.shadowRoot) observeDirectFrameRoot(element.shadowRoot, frameChain);
    }
  }

  function observeDirectFrameRoot(root, frameChain) {
    const previous = observedFrameRoots.get(root);
    if (previous) return;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) scanDirectFrameNode(node, frameChain);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    observedFrameRoots.set(root, { observer, frameChain });
    for (const frame of root.querySelectorAll("iframe,frame")) watchDirectFrame(frame, frameChain);
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) observeDirectFrameRoot(element.shadowRoot, frameChain);
    }
  }

  function refreshDirectFrameBindings() {
    for (const frame of trackedDirectFrames) {
      if (!frame.isConnected) {
        directFrameBindings.get(frame)?.cleanup();
        trackedDirectFrames.delete(frame);
        continue;
      }
      const watcher = directFrameWatchers.get(frame);
      bindDirectFrame(frame, watcher?.frameChain || [frame]);
    }
  }

  window.addEventListener("mousemove", (event) => {
    if (!event.isTrusted) return;
    updateMouse({ x: event.clientX, y: event.clientY });
  }, true);

  window.addEventListener("submit", (event) => {
    observeGitHubCreate(event);
  }, true);

  window.addEventListener("click", (event) => {
    if (event.composedPath().includes(host)) return;
    if (githubPrivateHandoffActive && /\bchange (?:repository )?visibility\b/i.test(associatedControlText(event.target))) {
      githubPrivateHandoffActive = false;
      recallRocket();
    }
    observeGitHubCreate(event);
    emitLabInteraction("click", event.target);
    scheduleGitHubStateSnapshot();
  }, true);

  window.addEventListener("input", (event) => {
    if (performance.now() - lastLabInputAt < 700) return;
    lastLabInputAt = performance.now();
    emitLabInteraction("input", event.target);
  }, true);

  window.addEventListener("change", (event) => {
    emitLabInteraction("change", event.target);
    if (isGitHubPrivateRepositoryLab()) {
      scheduleGitHubStateSnapshot(0);
    }
  }, true);

  window.addEventListener("keydown", (event) => {
    if (!event.isTrusted || event.key !== "Control" || event.metaKey || event.altKey || event.repeat) return;
    startPtt();
  }, true);

  window.addEventListener("keyup", (event) => {
    if (!event.isTrusted || event.key !== "Control") return;
    stopPtt();
  }, true);

  window.addEventListener("blur", (event) => {
    if (!event.isTrusted) return;
    stopPtt();
  });

  window.addEventListener("message", (event) => {
    const relayed = mapRelayedFrameInput(event);
    if (!relayed) return;
    const point = { x: relayed.x, y: relayed.y };
    if (relayed.kind === "pointer") updateMouse(point);
    else if (relayed.kind === "ptt_start") startPtt(point);
    else if (relayed.kind === "ptt_stop") stopPtt(point);
  }, true);

  window.addEventListener("message", (event) => {
    if (event.source !== window || !CTRLTEACH_ORIGINS.has(event.origin)) return;
    if (event.data?.type === "CTRLTEACH_TARS_PROBE") {
      window.postMessage({
        type: "CTRLTEACH_TARS_EXTENSION_READY",
        requestId: event.data.requestId,
        instanceId: CONTENT_INSTANCE_ID,
      }, event.origin);
    } else if (event.data?.type === "CTRLTEACH_TARS_CONFIG") {
      void runtimeSend({ type: "CTRLTEACH_TARS_CONFIG", config: event.data.config }).then((response) => {
        // Apply the returned state immediately. The service worker also
        // broadcasts it, but this direct path avoids a first-enable race where
        // the cursor otherwise waits for a page refresh.
        if (response?.state) {
          extensionState = { ...extensionState, ...response.state };
          renderVisibility();
        }
        window.postMessage({ type: "CTRLTEACH_TARS_CONFIG_ACK", requestId: event.data.requestId, response }, event.origin);
      });
    } else if (event.data?.type === "CTRLTEACH_BROWSER_LAB_START") {
      void runtimeSend({
        type: "CTRLTEACH_BROWSER_LAB_START",
        attemptId: event.data.attemptId,
        launchUrl: event.data.launchUrl,
        lab: event.data.lab,
      }).then((response) => {
        window.postMessage({ type: "CTRLTEACH_BROWSER_LAB_ACK", requestId: event.data.requestId, response }, event.origin);
      });
    } else if (event.data?.type === "CTRLTEACH_BROWSER_LAB_STOP") {
      void runtimeSend({
        type: "CTRLTEACH_BROWSER_LAB_STOP",
        attemptId: event.data.attemptId,
      }).then((response) => {
        window.postMessage({ type: "CTRLTEACH_BROWSER_LAB_ACK", requestId: event.data.requestId, response }, event.origin);
      });
    } else if (event.data?.type === "CTRLTEACH_BROWSER_LAB_CLEANUP_READY") {
      void runtimeSend({
        type: "CTRLTEACH_BROWSER_LAB_CLEANUP_READY",
        attemptId: event.data.attemptId,
      }).then((response) => {
        window.postMessage({ type: "CTRLTEACH_BROWSER_LAB_ACK", requestId: event.data.requestId, response }, event.origin);
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "TARS_EXTENSION_PING") {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "TARS_STATE") {
      const previousLabId = extensionState.activeLabId;
      extensionState = { ...extensionState, ...message.state };
      if (previousLabId !== extensionState.activeLabId) {
        lastGitHubSnapshotSignature = "";
        lastGitHubPolicySignal = "";
      }
      if (message.state?.cursor) {
        mouse = { ...message.state.cursor };
        updatePetGaze(mouse);
      }
      renderVisibility();
      scheduleGitHubStateSnapshot(0);
    } else if (message.type === "TARS_PREPARE_PTT") {
      preparePtt();
    } else if (message.type === "TARS_COLLECT_CONTEXT") {
      sendResponse(collectContext(message.contextId));
      return false;
    } else if (message.type === "TARS_MODE") {
      // A delayed start acknowledgement must not put the pet back into its
      // listening pose after Ctrl has already been released.
      if (message.mode !== "listening" || pttHeld || message.trigger === "toolbar") setMode(message.mode);
    } else if (message.type === "TARS_STATUS") {
      // Ctrl owns the visual state while it is held. In particular, the
      // acknowledgement for interrupting old playback must not hide the live
      // listening ear.
      if (pttHeld && ["idle", "thinking", "speaking"].includes(message.mode)) {
        sendResponse({ ok: true });
        return false;
      }
      if (message.mode === "listening" && !pttHeld && mode !== "listening") {
        sendResponse({ ok: true });
        return false;
      }
      if (message.resetTranscript) {
        transcriptText = "";
        resetTranscriptMergeState();
        setBubble("");
      }
      // Transcripts may finish after the final audio source. They update the
      // bubble, but only physical playback may drive the speaking mouth.
      if (message.mode !== "speaking" || message.playbackActive === true) {
        setMode(message.mode);
      }
      if (message.mode === "speaking" && message.append) {
        transcriptText = mergeTranscriptText(transcriptText, message.text);
        // Don't clobber an active rocket-hand label. The transcript is restored
        // after the hand docks back into the pet.
        if (!activePoint || githubPrivateAutomationRunning || githubPrivateHandoffActive) setBubble(transcriptText);
      } else if (message.mode === "speaking" && message.finished) {
        transcriptText = String(message.text || transcriptText).slice(-420);
        resetTranscriptMergeState();
        if (!activePoint || githubPrivateAutomationRunning || githubPrivateHandoffActive) setBubble(transcriptText);
      } else if (message.text) {
        setStatus(message.text, message.delayed);
        if (message.mode === "idle" && !activePoint) {
          if (bubbleClearTimer) clearTimeout(bubbleClearTimer);
          bubbleClearTimer = setTimeout(() => {
            bubbleClearTimer = 0;
            if (mode === "idle" && !activePoint) setBubble("");
          }, 1400);
        }
      }
    } else if (message.type === "TARS_POINT") {
      handlePoint(message.context, message.response);
    } else if (message.type === "TARS_DRAW") {
      showSolMissingNotice([message.response]);
      handleDraw(message.context, message.tool, message.response);
    } else if (message.type === "TARS_DRAW_BATCH") {
      // All nodes are appended in this message handler, before the browser's
      // next paint, so a diagram appears as one coherent visual.
      showSolMissingNotice(message.responses || []);
      for (const response of message.responses || []) {
        handleDraw(message.context, message.tool, response);
      }
    } else if (message.type === "TARS_ACTION") {
      handleAction(message.context, message.response);
    } else if (message.type === "TARS_GITHUB_MAKE_PRIVATE") {
      void automateGithubRepositoryPrivate(message.repositoryNameWithOwner);
    } else if (message.type === "TARS_LAB_COACH") {
      showLabCoach(message);
    } else if (message.type === "TARS_LAB_ENDED") {
      if (rocketPose) recallRocket();
      else activePoint = false;
      clearDrawings();
      setBubble("");
      setStatus("Lab monitoring ended", true);
      setMode("idle");
    }
    sendResponse({ ok: true });
    return false;
  });

  function applyExtensionState(nextState) {
    if (!nextState) return;
    extensionState = { ...extensionState, ...nextState };
    const initial = nextState.cursor || position;
    mouse = { x: initial.x, y: initial.y };
    if (!perchInitialized) {
      position = rocketPet.clampPerch(
        { x: initial.x + 96, y: initial.y + 72 },
        { width: innerWidth, height: innerHeight },
      );
      perchInitialized = true;
    }
    transformCursor(position.x, position.y);
    updatePetGaze(mouse);
    renderVisibility();
    scheduleGitHubStateSnapshot(0);
  }

  function refreshExtensionState() {
    return runtimeSend({ type: "TARS_PAGE_READY" })
      .then((response) => applyExtensionState(response?.state))
      .catch(() => undefined);
  }

  mount();
  const githubLabObserver = new MutationObserver(() => scheduleGitHubStateSnapshot(320));
  const observeGitHubLabDocument = () => {
    if (!document.documentElement) return;
    githubLabObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["checked", "aria-checked", "data-state", "content"],
    });
  };
  if (document.documentElement) observeGitHubLabDocument();
  else document.addEventListener("DOMContentLoaded", observeGitHubLabDocument, { once: true });
  observeDirectFrameRoot(document, []);
  // A cheap identity check over the handful of discovered frame elements also
  // covers document.open()/document.write() replacements that do not emit a
  // reliable parent mutation or top-tab navigation event.
  setInterval(refreshDirectFrameBindings, 750);
  scheduleRoam();
  const handlePetViewportChange = () => {
    position = rocketPet.clampPerch(position, { width: innerWidth, height: innerHeight });
    transformCursor(position.x, position.y);
    if (activeRawCoordinate) recallRocket();
  };
  addEventListener("resize", handlePetViewportChange, true);
  addEventListener("scroll", handlePetViewportChange, true);
  reducedMotionQuery.addEventListener?.("change", scheduleRoam);
  if (CTRLTEACH_ORIGINS.has(window.location.origin)) {
    window.postMessage({
      type: "CTRLTEACH_TARS_EXTENSION_ATTACHED",
      instanceId: CONTENT_INSTANCE_ID,
    }, window.location.origin);
  }
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void refreshExtensionState();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshDirectFrameBindings();
      void refreshExtensionState();
    }
  }, true);
  void refreshExtensionState();
})();
