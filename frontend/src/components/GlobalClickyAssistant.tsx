"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useClicky } from "@/lib/clicky";
import { WS_URL } from "@/lib/constants";
import { useAudio } from "@/hooks/useAudio";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  extractWakeVector,
  loadWakeTemplate,
  saveWakeTemplate,
  type WakeTemplate,
} from "@/lib/clickyWakeTemplate";

// ── Types ────────────────────────────────────────────────────────────────────

type Point = { x: number; y: number; label?: string };
type DomTarget = {
  id: string;
  role: string;
  text: string;
  actionable: boolean;
  rect: { x: number; y: number; width: number; height: number };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CLICKY_LOG = "[GlobalClicky]";
const CLICKY_SESSION_ID_KEY = "ctrlteach_clicky_session_id";
const WAKE_TRAINING_PHRASES = ["chat", "hey chat"];
const SHOW_CLICKY_BUBBLE = false;
const CLICKY_SPEECH_TAIL_MS = 700;

function msSince(start: number) {
  return Math.round(performance.now() - start);
}

function loadClickySessionId() {
  try {
    const existing = sessionStorage.getItem(CLICKY_SESSION_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID?.() || `clicky-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(CLICKY_SESSION_ID_KEY, next);
    return next;
  } catch {
    return `clicky-${Date.now()}`;
  }
}

// ── DOM inventory helpers (preserved from old path) ──────────────────────────

function elementLabel(el: HTMLElement) {
  const aria = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || "";
  const text = aria || el.innerText || el.textContent || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function elementRole(el: HTMLElement) {
  return el.getAttribute("role") || el.tagName.toLowerCase();
}

function isActionableElement(el: HTMLElement) {
  if (el.getAttribute("aria-disabled") === "true") return false;
  if ("disabled" in el && Boolean((el as HTMLButtonElement).disabled)) return false;
  return el.matches([
    "button", "a[href]", "input", "textarea", "select", "[role='button']", "[role='link']",
    "[role='tab']", "[role='menuitem']", "[data-clicky-target]",
  ].join(","));
}

function collectDomTargets(): { targets: DomTarget[]; elementsById: Map<string, HTMLElement> } {
  const selector = [
    "button", "a[href]", "input", "textarea", "select", "[role='button']", "[role='link']",
    "[role='tab']", "[role='menuitem']", "[data-clicky-target]", "h1", "h2", "h3", "label",
  ].join(",");
  const targets: DomTarget[] = [];
  const elementsById = new Map<string, HTMLElement>();
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const el of elements) {
    if (el.closest("[data-global-clicky='true']")) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) continue;
    const text = elementLabel(el);
    if (!text && !el.matches("input,textarea,select,[data-clicky-target]")) continue;
    const id = `dom-${targets.length}`;
    targets.push({
      id,
      role: elementRole(el),
      text: text || elementRole(el),
      actionable: isActionableElement(el),
      rect: {
        x: Math.max(0, rect.left),
        y: Math.max(0, rect.top),
        width: Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)),
        height: Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)),
      },
    });
    elementsById.set(id, el);
    if (targets.length >= 100) break;
  }
  return { targets, elementsById };
}

function clickDomElement(el: HTMLElement) {
  if (!isActionableElement(el)) return false;
  el.focus({ preventScroll: true });
  el.click();
  return true;
}

// ── Capture a frame from the getDisplayMedia stream as a JPEG data URL ───────

async function captureFrameFromStream(
  stream: MediaStream,
  maxW = 1600,
  maxH = 1000,
): Promise<{ data: string; mimeType: string; width: number; height: number } | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;
  try {
    // ImageCapture is unreliably supported; we use a hidden <video> + canvas
    // + MediaStreamTrackProcessor would be cleaner, but a video element is
    // the simplest portable path.
    const video = document.createElement("video");
    video.srcObject = new MediaStream([track]);
    video.muted = true;
    video.playsInline = true;
    await video.play();
    // Wait a single frame so the video has the latest pixel buffer.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const vw = video.videoWidth || window.innerWidth;
    const vh = video.videoHeight || window.innerHeight;
    const scale = Math.min(1, maxW / vw, maxH / vh);
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    video.pause();
    video.srcObject = null;
    const b64 = dataUrl.split(",")[1] || "";
    return { data: b64, mimeType: "image/jpeg", width: w, height: h };
  } catch (err) {
    console.warn(CLICKY_LOG, "captureFrame failed", err);
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GlobalClickyAssistant() {
  const { user, getToken } = useAuth();
  const { enabled, setEnabled, status, setStatus, trainingOpen } = useClicky();
  const pathname = usePathname();
  const isLanding = pathname === "/";
  // Decorative cursor visible on the landing page (no auth/WS) and wherever
  // Clicky is actually enabled. Functionality (voice, pointing) only kicks in
  // when `enabled && user`. Clicky's Realtime WS now connects once and stays
  // connected across all authed page navigations — no per-page gating.
  const showCursor = enabled || isLanding;

  const [mounted, setMounted] = useState(false);
  const [bubble, setBubble] = useState("");
  const [mode, setMode] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [wakeTemplate, setWakeTemplate] = useState<WakeTemplate | null>(null);
  const [trainingStatus, setTrainingStatus] = useState("Train Clicky with your pronunciation.");
  const [trainingPhraseIndex, setTrainingPhraseIndex] = useState(0);
  const [debugLine, setDebugLine] = useState("clicky debug: idle");

  // Cursor RAF refs
  const cursorRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 90, y: 90 });
  const mouseRef = useRef({ x: 90, y: 90 });
  const activePointRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  // Realtime refs
  const audioHook = useAudio();
  const wsHook = useWebSocket();
  const screenStreamRef = useRef<MediaStream | null>(null);
  // Last-sent screenshot dimensions, so we can scale the model's vision fallback
  // {x,y} back to the live viewport when no DOM targetId was matched.
  const lastScreenDimRef = useRef<{ width: number; height: number } | null>(null);
  // Map of dom-N id → live HTMLElement captured at the most recent screen push.
  // Used to resolve `targetId` to a fresh rect for sub-pixel flyTo.
  const domIdToElementRef = useRef<Map<string, HTMLElement>>(new Map());
  // Session id reused across reconnects within a single tab session.
  const sessionIdRef = useRef<string>(loadClickySessionId());

  // Push-to-talk gating (Ctrl held = unmute upstream mic)
  const ctrlHeldRef = useRef(false);
  const upstreamMutedRef = useRef(true); // start muted; Ctrl unmutes
  const speechTailUntilRef = useRef(0);
  const speechStatsRef = useRef({ startedAt: 0, chunks: 0, bytes: 0, peak: 0, rmsSum: 0 });
  const replyAudioStatsRef = useRef({ chunks: 0, bytes: 0 });
  // Last clicky_point id processed, to avoid double-handling the same event.
  const lastPointIdRef = useRef<string | null>(null);
  const trainingRecordingRef = useRef(false);
  const enabledRef = useRef(false);
  const trainingOpenRef = useRef(false);

  // ── Cursor positioning & flight ────────────────────────────────────────
  // Matches the real Clicky macOS overlay (OverlayWindow.swift). The buddy:
  //   - sits +35px right / +25px below the real pointer (a "helper" buddy)
  //   - defaults to a -35° tilt (cursor-like arrow)
  //   - springs toward the mouse with SwiftUI spring(response:0.2, damping:0.6)
  //   - flies to targets along a quadratic bezier, smoothstep easeInOut,
  //     duration = clamp(dist/800, 0.6s, 1.4s), arc height = min(dist*0.2, 80)
  const BUDDY_OFFSET_X = 35;
  const BUDDY_OFFSET_Y = 25;
  const BUDDY_DEFAULT_ROT = -35;
  // Spring constants for response=0.2, dampingFraction=0.6 (SwiftUI critically-ish damped).
  // ω = 2π/response; k = ω²; c = 2·dampingFraction·√k (mass=1).
  const SPRING_K = (2 * Math.PI / 0.2) ** 2;            // ≈ 986.96
  const SPRING_C = 2 * 0.6 * Math.sqrt(SPRING_K);       // ≈ 37.7
  // Velocity carried across frames for the idle spring follower.
  const velRef = useRef({ x: 0, y: 0 });
  // Last timestamp for the spring RAF loop (dt in seconds).
  const lastSpringTsRef = useRef<number | null>(null);

  const setCursor = useCallback((x: number, y: number, rot: number, scale: number, opacity: number) => {
    const el = cursorRef.current;
    if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
    el?.style.setProperty("opacity", String(opacity));
    posRef.current = { x, y };
  }, []);

  const flyTo = useCallback((point: Point) => {
    activePointRef.current = true;
    const from = posRef.current;
    const to = { x: point.x, y: point.y };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    // Match real Clicky: duration = clamp(dist/800, 0.6s, 1.4s)
    const duration = Math.min(Math.max(dist / 800, 0.6), 1.4) * 1000;
    const arc = Math.min(dist * 0.2, 80);
    const c = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc };
    const start = performance.now();
    const step = (now: number) => {
      const raw = Math.min((now - start) / duration, 1);
      // Smoothstep easeInOut: 3t² - 2t³ (Hermite) — matches real Clicky
      const t = raw * raw * (3 - 2 * raw);
      const m = 1 - t;
      const x = m * m * from.x + 2 * m * t * c.x + t * t * to.x;
      const y = m * m * from.y + 2 * m * t * c.y + t * t * to.y;
      const tx = 2 * m * (c.x - from.x) + 2 * t * (to.x - c.x);
      const ty = 2 * m * (c.y - from.y) + 2 * t * (to.y - c.y);
      // sin pulse peaks at midpoint, +0.3 → 1.3x scale (matches real Clicky)
      setCursor(x, y, (Math.atan2(ty, tx) * 180) / Math.PI + 90, 1 + Math.sin(raw * Math.PI) * 0.3, 1);
      if (raw < 1) requestAnimationFrame(step);
      else {
        setBubble(point.label || "right here");
        window.setTimeout(() => {
          activePointRef.current = false;
          setBubble("");
        }, 2600);
      }
    };
    requestAnimationFrame(step);
  }, [setCursor]);

  // ── Idle spring-follow loop ──────────────────────────────────────────────
  // Replicates SwiftUI `.animation(.spring(response: 0.2, dampingFraction: 0.6),
  // value: cursorPosition)` updated at 60fps. We integrate a spring toward the
  // last mouse position + offset; the buddy trails the real cursor with the
  // same lag-and-overshoot feel as the real macOS Clicky.
  useEffect(() => {
    if (!showCursor) return;
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);
    const raf = (ts: number) => {
      if (lastSpringTsRef.current == null) lastSpringTsRef.current = ts;
      const dtMs = Math.min(ts - lastSpringTsRef.current, 64);
      lastSpringTsRef.current = ts;
      const dt = dtMs / 1000;
      if (!activePointRef.current) {
        const target = {
          x: mouseRef.current.x + BUDDY_OFFSET_X,
          y: mouseRef.current.y + BUDDY_OFFSET_Y,
        };
        // Semi-implicit Euler spring (stable for the chosen k/c).
        const dx = posRef.current.x - target.x;
        const dy = posRef.current.y - target.y;
        velRef.current.x += (-SPRING_K * dx - SPRING_C * velRef.current.x) * dt;
        velRef.current.y += (-SPRING_K * dy - SPRING_C * velRef.current.y) * dt;
        posRef.current.x += velRef.current.x * dt;
        posRef.current.y += velRef.current.y * dt;
        setCursor(posRef.current.x, posRef.current.y, BUDDY_DEFAULT_ROT, 1, 1);
      }
      rafIdRef.current = requestAnimationFrame(raf);
    };
    rafIdRef.current = requestAnimationFrame(raf);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      lastSpringTsRef.current = null;
      velRef.current = { x: 0, y: 0 };
    };
  }, [showCursor, setCursor]);

  // ── Capture a screenshot + DOM inventory and push to Realtime turn ────────
  const pushScreenContext = useCallback(
    async (intentText?: string) => {
      const stream = screenStreamRef.current;
      if (!stream) return;
      const frame = await captureFrameFromStream(stream);
      if (!frame) return;
      const { targets, elementsById } = collectDomTargets();
      domIdToElementRef.current = elementsById;
      lastScreenDimRef.current = { width: frame.width, height: frame.height };
      // Note: we send the DOM inventory *without* the rect — the model only
      // needs id + role + text + actionable for matching. The frontend holds
      // the live rect mapping (sub-pixel exact) on its end.
      const slim = targets.map((t) => ({
        id: t.id,
        role: t.role,
        text: t.text,
        actionable: t.actionable,
      }));
      wsHook.sendClickyScreen(frame.data, frame.mimeType, {
        width: frame.width,
        height: frame.height,
        elements: slim,
        intentText: intentText,
      });
      console.info(CLICKY_LOG, "screen context pushed", {
        width: frame.width,
        height: frame.height,
        targets: targets.length,
        intent: !!intentText,
      });
    },
    [wsHook.sendClickyScreen],
  );

  // ── Screen-share lifecycle: persisted across page navigations ────────────
  // The getDisplayMedia capture lives until Clicky is disabled or the user logs
  // out — navigating between pages (including onto tutor pages where Clicky
  // voice is paused) MUST NOT tear it down. Only the WS connection toggles,
  // so switching pages doesn't re-prompt for tab share.
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled || !user) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      return;
    }
    let cancelled = false;
    if (screenStreamRef.current) return; // already capturing — reuse across navigations
    void (async () => {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "browser", frameRate: 2 } as MediaTrackConstraints,
          audio: false,
        });
        if (cancelled) {
          displayStream.getTracks().forEach((t) => t.stop());
          return;
        }
        displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
          setEnabled(false);
        });
        screenStreamRef.current = displayStream;
      } catch (err) {
        console.warn(CLICKY_LOG, "getDisplayMedia failed", err);
        if (!cancelled) {
          setStatus("Tab share needed for Clicky vision");
          setEnabled(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      // Only stop the capture stream when Clicky is fully disabled or user
      // logged out — handled in the early-return branch above.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user]);

  // ── Realtime WS connection: independent of current page ─────────────────
  // Clicky stays connected on every authed page (including /learn and
  // /board where the Tutor companion also operates). The two sessions run in
  // parallel — they use independent useAudio/useWebSocket hook instances.
  useEffect(() => {
    if (!enabled || !user || trainingOpen) {
      if (wsHook.status !== "disconnected") wsHook.disconnect();
      if (audioHook.isRecording) audioHook.stopRecording();
      audioHook.clearPlayback();
      ctrlHeldRef.current = false;
      upstreamMutedRef.current = true;
      setMode("idle");
      if (enabled && !user) {
        setStatus("Sign in to use Clicky");
      } else if (enabled && trainingOpen) {
        setStatus("Clicky training mode");
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (cancelled) return;
      const url = `${WS_URL}/ws/${user.uid}/${sessionIdRef.current}?agent=clicky${token ? `&token=${encodeURIComponent(token)}` : ""}`;
      await audioHook.initPlayer();
      if (cancelled) return;
      wsHook.connect(url, {
        onAudio: (pcm) => {
          audioHook.playAudioChunk(pcm);
          replyAudioStatsRef.current.chunks += 1;
          replyAudioStatsRef.current.bytes += pcm.byteLength;
          setDebugLine(
            `reply audio chunks=${replyAudioStatsRef.current.chunks} bytes=${replyAudioStatsRef.current.bytes} player=${audioHook.getPlaybackState()}`,
          );
        },
        onInterrupt: () => audioHook.clearPlayback(),
      });
    })();
    return () => {
      cancelled = true;
      if (wsHook.status !== "disconnected") wsHook.disconnect();
      if (audioHook.isRecording) audioHook.stopRecording();
      audioHook.clearPlayback();
      ctrlHeldRef.current = false;
      upstreamMutedRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user, trainingOpen]);

  // ── When the server-side Realtime session is ready, start mic capture & push
  //    initial screen context. The browser WS can open before OpenAI Realtime is
  //    entered server-side; waiting for `realtime_ready` prevents dropped mic
  //    chunks / "send_audio failed: Not connected".
  useEffect(() => {
    if (!enabled || !user || trainingOpen) return;
    if (wsHook.status !== "connected") return;
    if (!wsHook.realtimeReady) return;
    if (audioHook.isRecording) return;
    audioHook.startRecording((pcm) => {
      if (!upstreamMutedRef.current) {
        const samples = new Int16Array(pcm);
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const abs = Math.abs(samples[i]);
          if (abs > peak) peak = abs;
          sumSquares += samples[i] * samples[i];
        }
        const rms = samples.length ? Math.sqrt(sumSquares / samples.length) / 32768 : 0;
        speechStatsRef.current.chunks += 1;
        speechStatsRef.current.bytes += pcm.byteLength;
        speechStatsRef.current.peak = Math.max(speechStatsRef.current.peak, peak / 32768);
        speechStatsRef.current.rmsSum += rms;
        wsHook.sendAudio(pcm);
        return;
      }
      // Preserve a short silence tail so the manually committed buffer does
      // not end on a clipped phoneme. After the tail we go fully quiet.
      if (performance.now() < speechTailUntilRef.current) {
        wsHook.sendAudio(new ArrayBuffer(pcm.byteLength));
      }
    });
    setStatus("Clicky ready — hold Ctrl to talk");
    setMode("idle");
    // Initial screen context so the model isn't blind at start. Subsequent
    // context is pushed after Ctrl release so it follows the user's spoken turn.
    void pushScreenContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsHook.status, wsHook.realtimeReady, enabled, user, trainingOpen]);

  // ── Push-to-talk gating: Ctrl held = unmute upstream mic ────────────────────
  useEffect(() => {
    if (!enabled || !user || trainingOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Control" || event.metaKey || event.altKey) return;
      if (ctrlHeldRef.current) return;
      // This runs inside a real user gesture, which is required to unlock a
      // suspended AudioContext under Chrome/Safari autoplay policies.
      void audioHook.initPlayer();
      audioHook.resumeContexts();
      replyAudioStatsRef.current = { chunks: 0, bytes: 0 };
      ctrlHeldRef.current = true;
      speechTailUntilRef.current = 0;
      speechStatsRef.current = { startedAt: performance.now(), chunks: 0, bytes: 0, peak: 0, rmsSum: 0 };
      upstreamMutedRef.current = false;
      setMode("listening");
      setStatus("Clicky listening — release Ctrl when done");
      // Capture waits until key-up so it reflects the screen the user spoke
      // about and can be inserted immediately before the audio turn commits.
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Control") return;
      ctrlHeldRef.current = false;
      speechTailUntilRef.current = performance.now() + CLICKY_SPEECH_TAIL_MS;
      upstreamMutedRef.current = true;
      const stats = speechStatsRef.current;
      const avgRms = stats.chunks ? stats.rmsSum / stats.chunks : 0;
      const statsLine = `mic ${Math.round(performance.now() - stats.startedAt)}ms chunks=${stats.chunks} peak=${stats.peak.toFixed(3)} rms=${avgRms.toFixed(3)}`;
      console.info(CLICKY_LOG, "mic turn captured", {
        durationMs: Math.round(performance.now() - stats.startedAt),
        chunks: stats.chunks,
        bytes: stats.bytes,
        peak: Number(stats.peak.toFixed(4)),
        avgRms: Number(avgRms.toFixed(4)),
      });
      setDebugLine(statsLine);
      setMode("speaking");
      setStatus("Clicky ready — hold Ctrl to talk");
      // Wait for the trailing silence, then insert visual context and commit.
      window.setTimeout(async () => {
        if (ctrlHeldRef.current) return;
        // Insert the latest visual context before committing audio. The server
        // adds this as context without starting a separate response, so the
        // one response.create below sees both the speech and current screen.
        await pushScreenContext("user just spoke");
        if (ctrlHeldRef.current) return;
        wsHook.sendClickyCommitAudio();
        setDebugLine(`${statsLine} · committed`);
      }, CLICKY_SPEECH_TAIL_MS);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      ctrlHeldRef.current = false;
      upstreamMutedRef.current = true;
      speechTailUntilRef.current = 0;
    };
  }, [
    enabled,
    user,
    trainingOpen,
    pushScreenContext,
    audioHook.initPlayer,
    audioHook.resumeContexts,
    wsHook.sendClickyCommitAudio,
  ]);

  // ── Handle incoming Clicky `point_at` envelope ─────────────────────────────
  useEffect(() => {
    if (!wsHook.clickyAgentPoint) return;
    const pt = wsHook.clickyAgentPoint;
    if (pt.id === lastPointIdRef.current) return;
    lastPointIdRef.current = pt.id;
    console.info(CLICKY_LOG, "point_at received", pt);

    // Cascade: DOM-exact first, vision fallback second.
    if (pt.targetId) {
      const el = domIdToElementRef.current.get(pt.targetId);
      if (el) {
        const rect = el.getBoundingClientRect();
        flyTo({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          label: pt.label,
        });
        if (pt.action === "click") {
          window.setTimeout(() => {
            if (clickDomElement(el)) console.info(CLICKY_LOG, "clicked", pt.targetId);
          }, 750);
        }
        return;
      }
      // Element no longer in DOM — fall through to vision if possible.
      console.warn(CLICKY_LOG, "targetId not found in DOM map", pt.targetId);
    }

    if (typeof pt.x === "number" && typeof pt.y === "number" && lastScreenDimRef.current) {
      const { width: imgW, height: imgH } = lastScreenDimRef.current;
      const x = (pt.x / imgW) * window.innerWidth;
      const y = (pt.y / imgH) * window.innerHeight;
      flyTo({ x, y, label: pt.label });
      return;
    }

    // No usable coordinate — leave the cursor where it is.
  }, [wsHook.clickyAgentPoint, flyTo]);

  // ── Mode transitions from WS events ───────────────────────────────────────
  useEffect(() => {
    if (!enabled || !user) return;
    // When the assistant starts streaming audio response, set mode to speaking.
    if (wsHook.messages.length > 0) {
      const last = wsHook.messages[wsHook.messages.length - 1];
      if (last.role === "user") {
        setDebugLine(`heard: ${last.text || "..."}${last.partial ? "" : " ✓"}`);
      }
      if (last.role === "agent" && last.partial) {
        setMode("speaking");
      }
    }
  }, [wsHook.messages, enabled, user]);

  useEffect(() => {
    if (!enabled || !user) return;
    // When upstream mic is unmuted (Ctrl held), we're listening.
    if (!ctrlHeldRef.current && wsHook.status === "connected") {
      setMode("idle");
    }
  }, [wsHook.status, enabled, user]);

  // ── Training panel: still preserved for the settings page affordance ───────
  useEffect(() => {
    try {
      setWakeTemplate(loadWakeTemplate());
    } catch {}
  }, []);

  useEffect(() => {
    trainingOpenRef.current = trainingOpen;
  }, [trainingOpen]);

  const recordWakeSample = useCallback(async () => {
    trainingRecordingRef.current = true;
    const phrase = WAKE_TRAINING_PHRASES[trainingPhraseIndex % WAKE_TRAINING_PHRASES.length];
    setTrainingStatus(`Recording now. Say "${phrase}" once.`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      await audioContext.resume();
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      source.disconnect();
      processor.disconnect();
      silentGain.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close();

      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const samples = new Float32Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      const vector = extractWakeVector(samples, audioContext.sampleRate);
      if (!vector) {
        setTrainingStatus("I couldn't hear enough. Try again a little louder.");
        return;
      }
      const next = saveWakeTemplate([...(wakeTemplate?.vectors ?? []), vector]);
      setWakeTemplate(next);
      const nextPhrase = WAKE_TRAINING_PHRASES[(trainingPhraseIndex + 1) % WAKE_TRAINING_PHRASES.length];
      setTrainingPhraseIndex((index) => index + 1);
      setTrainingStatus(`Saved "${phrase}". Next say "${nextPhrase}". Aim for 4-6 samples total.`);
    } catch {
      setTrainingStatus("Microphone access failed. Allow mic access and try again.");
    } finally {
      trainingRecordingRef.current = false;
    }
  }, [trainingPhraseIndex, wakeTemplate]);

  const resetWakeTraining = useCallback(() => {
    const next = saveWakeTemplate([]);
    setWakeTemplate(next);
    setTrainingPhraseIndex(0);
    setTrainingStatus("Train Clicky with your pronunciation.");
  }, []);

  // ── Mount gate (Next hydration) ────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!user && !isLanding) {
    return (
      <div data-global-clicky="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000 }} />
    );
  }

  // On the landing page we may have no `user` — render the cursor wrapper so
  // the decorative pointer is visible. The inner cursor itself is gated on
  // `showCursor` (true when on landing OR when Clicky is enabled).
  const renderCursor = showCursor;

  return (
    <div data-global-clicky="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000 }}>
      {renderCursor && (
        <div
          ref={cursorRef}
          style={{ position: "fixed", left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: "transform, opacity" }}
        >
          <div style={{ position: "absolute", left: 0, top: 0, opacity: mode === "idle" || mode === "speaking" ? 1 : 0, transition: "opacity 0.15s ease" }}>
            <div style={{ width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: "16px solid #6366f1", filter: "drop-shadow(0 0 8px rgba(99,102,241,0.55))" }} />
          </div>
          <div style={{ position: "absolute", left: -6, top: -8, display: "flex", alignItems: "center", gap: 2, opacity: mode === "listening" ? 1 : 0, transition: "opacity 0.15s ease", filter: "drop-shadow(0 0 6px rgba(99,102,241,0.6))" }}>
            {[0.4, 0.7, 1, 0.7, 0.4].map((profile, i) => (
              <span key={i} style={{ width: 2, height: 3 + profile * 10, borderRadius: 2, background: mode === "speaking" ? "#14b8a6" : "#6366f1", animation: `clicky-wave 0.72s ease-in-out ${i * 0.08}s infinite alternate` }} />
            ))}
          </div>
          <div style={{ position: "absolute", left: -7, top: -7, width: 14, height: 14, borderRadius: 999, border: "2.5px solid rgba(99,102,241,0.12)", borderTopColor: "#6366f1", opacity: mode === "thinking" ? 1 : 0, transition: "opacity 0.15s ease", animation: "clicky-spin 0.8s linear infinite", filter: "drop-shadow(0 0 6px rgba(99,102,241,0.6))" }} />
          {SHOW_CLICKY_BUBBLE && !!bubble && (
            <div style={{ position: "absolute", left: 18, top: -8, maxWidth: 280, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.96)", border: "1px solid rgba(0,0,0,0.12)", color: "#1f2937", fontSize: 13, lineHeight: 1.35, pointerEvents: "none" }}>
              {bubble}
            </div>
          )}
        </div>
      )}
      {!isLanding && user && trainingOpen && (
        <div style={{ pointerEvents: "auto", position: "fixed", right: 18, bottom: 108, width: 286, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.98)", borderRadius: 14, padding: 14, color: "#1f2937", fontSize: 13, lineHeight: 1.35 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Train your wake phrases</div>
          <div style={{ color: "#64748b", marginBottom: 10 }}>
            Record your pronunciation of <strong>chat</strong> and <strong>hey chat</strong>. Stored locally, no raw audio saved.
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", marginBottom: 10, background: "#f8fafc" }}>
            Say now: <strong>"{WAKE_TRAINING_PHRASES[trainingPhraseIndex % WAKE_TRAINING_PHRASES.length]}"</strong>
          </div>
          <div style={{ color: "#475569", marginBottom: 10 }}>{trainingStatus}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={recordWakeSample} style={{ flex: 1, border: "none", background: "#6366f1", color: "#fff", borderRadius: 10, padding: "9px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              Record sample
            </button>
            <button type="button" onClick={resetWakeTraining} style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#475569", borderRadius: 10, padding: "9px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Reset
            </button>
          </div>
          <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
            Samples saved: {wakeTemplate?.vectors.length ?? 0}
          </div>
        </div>
      )}
      {enabled && user && (
        <div style={{ pointerEvents: "none", position: "fixed", left: 14, bottom: 14, maxWidth: "min(560px, calc(100vw - 28px))", padding: "7px 9px", borderRadius: 10, background: "rgba(15,23,42,0.82)", color: "#dbeafe", fontSize: 11, lineHeight: 1.35, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", boxShadow: "0 8px 24px rgba(15,23,42,0.18)", zIndex: 2147483001 }}>
          {debugLine}
        </div>
      )}
      <style jsx global>{`
        @keyframes clicky-wave { from { transform: scaleY(0.65); opacity: 0.7; } to { transform: scaleY(1.22); opacity: 1; } }
        @keyframes clicky-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
