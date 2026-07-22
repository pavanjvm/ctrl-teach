(() => {
  if (window.__ctrlTeachTarsExtensionLoaded) return;
  window.__ctrlTeachTarsExtensionLoaded = true;

  // A reloaded unpacked extension leaves its old closed-shadow host in tabs
  // that were already open. A newly injected content-script world removes that
  // orphan before mounting the live overlay.
  document.getElementById("ctrlteach-tars-extension")?.remove();

  const CTRLTEACH_ORIGINS = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const CONTENT_INSTANCE_ID = crypto.randomUUID();
  const MAX_TARGETS = 240;
  const BUDDY_OFFSET_X = 35;
  const BUDDY_OFFSET_Y = 25;
  const DEFAULT_ROTATION = -35;
  // A slower, more-damped spring keeps a smooth trailing motion without the
  // cursor bouncing around its target.
  const SPRING_RESPONSE = 0.38;
  const SPRING_DAMPING = 0.68;
  const SPRING_OMEGA = (2 * Math.PI) / SPRING_RESPONSE;
  const SPRING_K = SPRING_OMEGA ** 2;
  const SPRING_C = 2 * SPRING_DAMPING * SPRING_OMEGA;
  const SENSITIVE_TEXT = /\b(buy|purchase|pay|checkout|place order|delete|remove|erase|send|submit|publish|post|sign out|log out|change password|reset password|upload|download|allow|grant|confirm booking|book now)\b/i;

  let extensionState = { enabled: false, suspended: false, active: false, labActive: false, activeLabId: "", cursor: { x: 80, y: 120 } };
  let mode = "idle";
  let pttHeld = false;
  let currentContextId = "";
  let currentTargets = new Map();
  let lastCollectedElements = [];
  let mouse = { x: 45, y: 95 };
  let position = { x: 80, y: 120 };
  let velocity = { x: 0, y: 0 };
  let activePoint = false;
  // Monotonic token that cancels any in-progress pointing/navigation when a
  // new point arrives, so a stale return-flight never clobbers a fresh target.
  let navToken = 0;
  const DRAWINGS_AUTO_CLEAR_MS = 6000;
  let drawingLifetime = null;
  let ctrlTrailPoints = [];
  let ctrlGesturePoints = [];
  let ctrlTrailGroup = null;
  let ctrlTrailFrame = 0;
  let ctrlGesture = null;
  let lastLabInputAt = 0;
  let lastFrame = 0;
  let cursorReportAt = 0;
  let statusText = "";
  let transcriptText = "";
  let bubbleClearTimer = 0;

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
      #cursor { position: fixed; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; will-change: transform; }
      #triangle { position: absolute; left: -8px; top: 0; width: 16px; height: 13.856px; background: #79a925; clip-path: polygon(50% 0, 100% 100%, 0 100%); opacity: 1; transition: opacity .13s ease, background-color .13s ease; filter: drop-shadow(0 0 7px rgba(121,169,37,.45)); }
      #waveform { position: absolute; left: -7px; top: -6px; height: 18px; display: flex; align-items: center; gap: 1px; opacity: 0; transform-origin: 7px 6px; transition: opacity .16s ease; filter: drop-shadow(0 0 5px rgba(20,184,166,.6)); }
      #waveform span { width: 2px; border-radius: 999px; background: #14b8a6; transform-origin: center; animation: wave .78s ease-in-out infinite alternate; }
      #waveform span:nth-child(1), #waveform span:nth-child(5) { height: 5px; }
      #waveform span:nth-child(2), #waveform span:nth-child(4) { height: 9px; animation-delay: .09s; }
      #waveform span:nth-child(3) { height: 13px; animation-delay: .18s; }
      #ring { position: absolute; left: -8px; top: -8px; width: 12px; height: 12px; border: 2px solid rgba(121,169,37,.2); border-top-color: #79a925; border-right-color: rgba(121,169,37,.72); border-radius: 999px; opacity: 0; transition: opacity .16s ease; filter: drop-shadow(0 0 5px rgba(121,169,37,.4)); }
      #cursor[data-mode="listening"] #triangle, #cursor[data-mode="thinking"] #triangle { opacity: 0; }
      #cursor[data-mode="listening"] #waveform { opacity: 1; }
      #cursor[data-mode="thinking"] #ring { opacity: 1; animation: spin .9s linear infinite; }
      #bubble-anchor { position: absolute; left: 20px; top: 24px; transform-origin: 0 0; will-change: transform; }
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
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes wave { from { transform: scaleY(.58); opacity: .72; } to { transform: scaleY(1.18); opacity: 1; } }
      @keyframes draw { to { stroke-dashoffset: 0; } }
    </style>
    <div id="layer">
      <svg id="drawings" aria-hidden="true"></svg>
      <div id="cursor" data-mode="idle">
        <div id="triangle"></div>
        <div id="waveform" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
        <div id="ring"></div>
        <div id="bubble-anchor"><div id="bubble"></div></div>
      </div>
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
  const waveform = shadow.getElementById("waveform");
  const bubble = shadow.getElementById("bubble");
  const bubbleAnchor = shadow.getElementById("bubble-anchor");
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
      pttHeld = false;
      activePoint = false;
      setBubble("");
      setMode("idle");
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
      setBubble("");
    }
    cursor.dataset.mode = mode;
    // Thinking and speaking are part of the same visual turn. The drawing's
    // lifetime begins only after the playback gate reports idle.
    drawingLifetime?.setActive(mode !== "idle");
  }

  function setBubble(text) {
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

  function setStatus(text, temporary = false) {
    statusText = String(text || "").trim();
    status.textContent = statusText;
    status.classList.toggle("visible", Boolean(statusText));
    if (temporary && statusText) {
      const expected = statusText;
      setTimeout(() => {
        if (statusText === expected) setStatus("");
      }, 2200);
    }
  }

  function transformCursor(x, y, rotation = DEFAULT_ROTATION, scale = 1) {
    position = { x, y };
    cursor.style.transform = `translate3d(${x}px,${y}px,0) rotate(${rotation}deg) scale(${scale})`;
    // The cursor tilts toward its movement, but a listening waveform should
    // remain level with upright bars instead of inheriting that rotation.
    waveform.style.transform = `rotate(${-rotation}deg)`;
    // The pointer rotates to face its movement. Counter-rotate the bubble so
    // Tars's response text always remains level and readable.
    bubbleAnchor.style.transform = `rotate(${-rotation}deg)`;
  }

  function animateFrame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(32, timestamp - lastFrame) / 1000;
    lastFrame = timestamp;
    if (visible() && !activePoint) {
      const target = { x: mouse.x + BUDDY_OFFSET_X, y: mouse.y + BUDDY_OFFSET_Y };
      velocity.x += (-SPRING_K * (position.x - target.x) - SPRING_C * velocity.x) * dt;
      velocity.y += (-SPRING_K * (position.y - target.y) - SPRING_C * velocity.y) * dt;
      position.x += velocity.x * dt;
      position.y += velocity.y * dt;
      transformCursor(position.x, position.y);
    }
    requestAnimationFrame(animateFrame);
  }

  // Quadratic-bezier arc flight — the same curve production Tars uses:
  // smoothstep ease (3t²-2t³), control point lifted by min(distance*0.2, 80),
  // triangle rotated to the curve tangent, and a sin-pulse scale (1 → 1.3 → 1)
  // that peaks at the arc apex. Resolves when the cursor has landed.
  function bezierFlight(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const duration = Math.min(Math.max(distance / 800, 0.6), 1.4) * 1000;
    const arc = Math.min(distance * 0.2, 80);
    const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc };
    const started = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const raw = Math.min((now - started) / duration, 1);
        const t = raw * raw * (3 - 2 * raw);
        const m = 1 - t;
        const x = m * m * from.x + 2 * m * t * control.x + t * t * to.x;
        const y = m * m * from.y + 2 * m * t * control.y + t * t * to.y;
        const tx = 2 * m * (control.x - from.x) + 2 * t * (to.x - control.x);
        const ty = 2 * m * (control.y - from.y) + 2 * t * (to.y - control.y);
        transformCursor(x, y, (Math.atan2(ty, tx) * 180) / Math.PI + 90, 1 + Math.sin(raw * Math.PI) * 0.3);
        if (raw < 1) requestAnimationFrame(step);
        else { transformCursor(to.x, to.y, DEFAULT_ROTATION, 1); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  // Types the pointing label one character at a time (30–60ms per char) with a
  // scale-bounce entrance, exactly like Tars's navigation bubble.
  function streamBubbleText(text, onDone) {
    const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 260);
    bubble.textContent = "";
    bubble.classList.add("visible", "pop");
    if (!clean.length) { onDone(); return; }
    let i = 0;
    const tick = () => {
      if (i >= clean.length) { onDone(); return; }
      bubble.textContent += clean[i++];
      setTimeout(tick, 30 + Math.random() * 30);
    };
    setTimeout(tick, 30);
  }

  // Second bezier flight back to the live cursor, then resume spring-following.
  function flyBackToCursor(token) {
    const from = { ...position };
    const to = { x: mouse.x + BUDDY_OFFSET_X, y: mouse.y + BUDDY_OFFSET_Y };
    bezierFlight(from, to).then(() => {
      if (token !== navToken) return;
      activePoint = false;
      // Hand the bubble back to a still-speaking transcript, or clear it.
      if (mode === "speaking" && transcriptText) setBubble(transcriptText);
      else if (mode !== "speaking") setBubble("");
    });
  }

  function flyTo(point) {
    // Cancel any navigation already in flight so the new target wins cleanly.
    navToken++;
    const token = navToken;
    activePoint = true;
    const from = { ...position };
    const to = { x: point.x, y: point.y };
    const label = point.label || "right here";

    bezierFlight(from, to).then(() => {
      if (token !== navToken) return;
      // Arrived at the element — point at it: stream the label, hold, fade,
      // then fly back to the live cursor (the full Tars pointing lifecycle).
      streamBubbleText(label, () => {
        if (token !== navToken) return;
        setTimeout(() => {
          if (token !== navToken) return;
          // Fade the bubble out over ~0.5s before the return flight.
          bubble.classList.remove("pop");
          bubble.style.transition = "opacity .5s ease";
          bubble.classList.remove("visible");
          setTimeout(() => {
            bubble.style.transition = "";
            if (token !== navToken) return;
            flyBackToCursor(token);
          }, 500);
        }, 2600);
      });
    });
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
    return {
      url: location.href,
      title: document.title,
      tagName: element.tagName.toLowerCase(),
      role: elementRole(element),
      text: elementLabel(element),
      label: element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("placeholder") || "",
      selector: selectorHint(element),
      actionable: isActionable(element),
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
    void chrome.runtime.sendMessage({ type: "TARS_LAB_INTERACTION", kind, payload });
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
    setBubble("");
  }

  function collectContext(contextId) {
    const elements = collectDomTargets(contextId);
    return {
      ok: true,
      context: {
        contextId,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
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

  function confirmAction(element, reason) {
    pendingConfirmation = element;
    confirmCopy.textContent = reason;
    confirmLayer.classList.add("visible");
  }

  confirmCancel.addEventListener("click", () => {
    pendingConfirmation = null;
    confirmLayer.classList.remove("visible");
  });
  confirmAccept.addEventListener("click", () => {
    const element = pendingConfirmation;
    pendingConfirmation = null;
    confirmLayer.classList.remove("visible");
    if (element?.isConnected) {
      element.focus({ preventScroll: true });
      element.click();
    }
  });

  function maybeClick(element, label) {
    if (!element?.isConnected || !isActionable(element)) return;
    const reason = sensitiveReason(element, label);
    if (reason) confirmAction(element, reason);
    else {
      element.focus({ preventScroll: true });
      element.click();
    }
  }

  function validContext(context) {
    return visible() && context?.contextId === currentContextId && context?.tabId != null;
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
      flyTo({ ...point, label: response.label });
      if (response.action === "click") setTimeout(() => maybeClick(target, response.label), 750);
      return;
    }
    if (typeof response?.x === "number" && typeof response?.y === "number" && context.screenshotWidth && context.screenshotHeight) {
      const point = responsePoint(context, response.x, response.y, response.coordinate_space);
      if (point) flyTo({ ...point, label: response.label });
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
    const annotationGroup = svgElement("g", {
      "data-annotation-id": annotationId,
      class: "annotation",
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

    if (["rectangle", "highlight", "circle", "underline"].includes(shape) && rect) {
      if (shape === "circle") {
        element = svgElement("ellipse", { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, rx: rect.width / 2 + 8, ry: rect.height / 2 + 8, fill: "none", stroke: color, "stroke-width": 3, "pathLength": 1, ...strokeAttrs });
      } else if (shape === "underline") {
        element = svgElement("line", { x1: rect.left, y1: rect.bottom + 4, x2: rect.right, y2: rect.bottom + 4, stroke: color, "stroke-width": 4, "stroke-linecap": "round", "pathLength": 1, ...strokeAttrs });
      } else {
        element = svgElement("rect", { x: rect.left - 6, y: rect.top - 6, width: rect.width + 12, height: rect.height + 12, rx: 8, fill: shape === "highlight" ? color : "none", "fill-opacity": shape === "highlight" ? .18 : 0, stroke: color, "stroke-width": shape === "highlight" ? 1.5 : 3, "pathLength": 1, ...strokeAttrs });
      }
    } else if (["rectangle", "highlight", "circle", "underline"].includes(shape) && rawStart) {
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
        if (shape === "circle") {
          element = svgElement("ellipse", { cx: left + width / 2, cy: top + height / 2, rx: width / 2, ry: height / 2, fill: "none", stroke: color, "stroke-width": 3, "pathLength": 1, ...strokeAttrs });
        } else {
          element = svgElement("rect", { x: left, y: top, width, height, rx: 8, fill: shape === "highlight" ? color : "none", "fill-opacity": shape === "highlight" ? .18 : 0, stroke: color, "stroke-width": shape === "highlight" ? 1.5 : 3, "pathLength": 1, ...strokeAttrs });
        }
      }
    } else if (shape === "arrow") {
      const start = fromRect ? { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 } : rawStart;
      const end = toRect ? { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 } : rawEnd;
      if (start && end) {
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
        element = svgElement("line", { x1: start.x, y1: start.y, x2: end.x, y2: end.y, stroke: color, "stroke-width": 3, "stroke-linecap": "round", "pathLength": 1, ...strokeAttrs });
      }
    }
    if (!element) {
      setStatus("Tars couldn't place that annotation", true);
      return;
    }
    annotationGroup.appendChild(element);
    for (const extra of extraElements) annotationGroup.appendChild(extra);
    drawings.appendChild(annotationGroup);
    drawingLifetime.markDrawn();
  }

  window.addEventListener("mousemove", (event) => {
    mouse = { x: event.clientX, y: event.clientY };
    recordCtrlTrailPoint(mouse);
    if (visible() && performance.now() - cursorReportAt > 120) {
      cursorReportAt = performance.now();
      void chrome.runtime.sendMessage({ type: "TARS_CURSOR_POSITION", x: mouse.x, y: mouse.y });
    }
  }, true);

  window.addEventListener("click", (event) => {
    emitLabInteraction("click", event.target);
  }, true);

  window.addEventListener("input", (event) => {
    if (performance.now() - lastLabInputAt < 700) return;
    lastLabInputAt = performance.now();
    emitLabInteraction("input", event.target);
  }, true);

  window.addEventListener("change", (event) => {
    emitLabInteraction("change", event.target);
  }, true);

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Control" || event.metaKey || event.altKey || event.repeat || !visible() || pttHeld) return;
    pttHeld = true;
    startCtrlTrail(mouse);
    setMode("listening");
    setStatus("Tars listening — release Ctrl");
    void chrome.runtime.sendMessage({ type: "TARS_PTT_START" });
  }, true);

  window.addEventListener("keyup", (event) => {
    if (event.key !== "Control" || !pttHeld) return;
    pttHeld = false;
    finishCtrlTrail();
    setMode("thinking");
    setStatus("Tars thinking");
    void chrome.runtime.sendMessage({ type: "TARS_PTT_STOP" });
  }, true);

  window.addEventListener("blur", () => {
    if (!pttHeld) return;
    pttHeld = false;
    finishCtrlTrail();
    void chrome.runtime.sendMessage({ type: "TARS_PTT_STOP" });
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || !CTRLTEACH_ORIGINS.has(event.origin)) return;
    if (event.data?.type === "CTRLTEACH_TARS_PROBE") {
      window.postMessage({
        type: "CTRLTEACH_TARS_EXTENSION_READY",
        requestId: event.data.requestId,
        instanceId: CONTENT_INSTANCE_ID,
      }, event.origin);
    } else if (event.data?.type === "CTRLTEACH_TARS_CONFIG") {
      void chrome.runtime.sendMessage({ type: "CTRLTEACH_TARS_CONFIG", config: event.data.config }).then((response) => {
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
      void chrome.runtime.sendMessage({
        type: "CTRLTEACH_BROWSER_LAB_START",
        attemptId: event.data.attemptId,
        launchUrl: event.data.launchUrl,
        lab: event.data.lab,
      }).then((response) => {
        window.postMessage({ type: "CTRLTEACH_BROWSER_LAB_ACK", requestId: event.data.requestId, response }, event.origin);
      });
    } else if (event.data?.type === "CTRLTEACH_BROWSER_LAB_STOP") {
      void chrome.runtime.sendMessage({
        type: "CTRLTEACH_BROWSER_LAB_STOP",
        attemptId: event.data.attemptId,
      }).then((response) => {
        window.postMessage({ type: "CTRLTEACH_BROWSER_LAB_ACK", requestId: event.data.requestId, response }, event.origin);
      });
    } else if (event.data?.type === "CTRLTEACH_BROWSER_LAB_CLEANUP_READY") {
      void chrome.runtime.sendMessage({
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
      extensionState = { ...extensionState, ...message.state };
      if (message.state?.cursor) {
        mouse = { ...message.state.cursor };
        position = { x: mouse.x + BUDDY_OFFSET_X, y: mouse.y + BUDDY_OFFSET_Y };
      }
      renderVisibility();
    } else if (message.type === "TARS_PREPARE_PTT") {
      preparePtt();
    } else if (message.type === "TARS_COLLECT_CONTEXT") {
      sendResponse(collectContext(message.contextId));
      return false;
    } else if (message.type === "TARS_MODE") {
      // A delayed start acknowledgement must not put the cursor back into the
      // listening waveform after Ctrl has already been released.
      if (message.mode !== "listening" || pttHeld || message.trigger === "toolbar") setMode(message.mode);
    } else if (message.type === "TARS_STATUS") {
      // Ctrl owns the visual state while it is held. In particular, the
      // acknowledgement for interrupting old playback must not hide the live
      // listening waveform.
      if (pttHeld && ["idle", "thinking", "speaking"].includes(message.mode)) {
        sendResponse({ ok: true });
        return false;
      }
      if (message.mode === "listening" && !pttHeld && mode !== "listening") {
        sendResponse({ ok: true });
        return false;
      }
      setMode(message.mode);
      if (message.mode === "speaking" && message.append) {
        transcriptText = `${transcriptText}${message.text || ""}`.slice(-420);
        // Don't clobber an active pointer bubble — Tars's pointing label owns
        // the bubble during a point. It is restored in flyBackToCursor once the
        // cursor returns to the live mouse.
        if (!activePoint) setBubble(transcriptText);
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
      handleDraw(message.context, message.tool, message.response);
    } else if (message.type === "TARS_DRAW_BATCH") {
      // All nodes are appended in this message handler, before the browser's
      // next paint, so a diagram appears as one coherent visual.
      for (const response of message.responses || []) {
        handleDraw(message.context, message.tool, response);
      }
    } else if (message.type === "TARS_ACTION") {
      handleAction(message.context, message.response);
    }
    sendResponse({ ok: true });
    return false;
  });

  mount();
  requestAnimationFrame(animateFrame);
  if (CTRLTEACH_ORIGINS.has(window.location.origin)) {
    window.postMessage({
      type: "CTRLTEACH_TARS_EXTENSION_ATTACHED",
      instanceId: CONTENT_INSTANCE_ID,
    }, window.location.origin);
  }
  chrome.runtime.sendMessage({ type: "TARS_PAGE_READY" }).then((response) => {
    if (response?.state) {
      extensionState = { ...extensionState, ...response.state };
      const initial = response.state.cursor || position;
      mouse = { x: initial.x, y: initial.y };
      position = { x: initial.x + BUDDY_OFFSET_X, y: initial.y + BUDDY_OFFSET_Y };
      transformCursor(position.x, position.y);
      renderVisibility();
    }
  }).catch(() => undefined);
})();
