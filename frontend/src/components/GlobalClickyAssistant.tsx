"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { usePathname } from "next/navigation";
import html2canvas from "html2canvas";
import { API_URL } from "@/lib/constants";
import { useAuth } from "@/components/AuthProvider";
import {
  bestWakeSimilarity,
  clearWakeTemplate,
  extractWakeVector,
  loadWakeTemplate,
  saveWakeTemplate,
  type WakeTemplate,
} from "@/lib/clickyWakeTemplate";

type Point = { x: number; y: number; label?: string };
type DomTarget = {
  id: string;
  role: string;
  text: string;
  actionable: boolean;
  rect: { x: number; y: number; width: number; height: number };
};

type ClickyApiResponse = {
  answer?: string;
  targetId?: string | null;
  action?: "none" | "click";
  point?: Point | null;
  audio_b64?: string | null;
  audio_mime?: string | null;
};

type ClickyTurn = { user: string; assistant: string };

type PageSnapshot = {
  image: string;
  width: number;
  height: number;
  domTargets: DomTarget[];
  elementsById: Map<string, HTMLElement>;
  capturedAt: number;
};

const CLICKY_LOG = "[GlobalClicky]";

const CLICKY_ENABLED_KEY = "ctrlteach_clicky_enabled";
const CLICKY_SESSION_ID_KEY = "ctrlteach_clicky_session_id";
const CLICKY_SESSION_HISTORY_KEY = "ctrlteach_clicky_session_history";
const CLICKY_MAX_HISTORY_TURNS = 2;
const WAKE_RE = /\b(?:hey\s+)?(?:clicky|clickie|cliquey|klicky|kliky|clickey|quickly|chat)\b/i;
const WAKE_TRAINING_PHRASES = ["chat", "hey chat"];
const SHOW_CLICKY_BUBBLE = false;

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

function loadClickyHistory(): ClickyTurn[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CLICKY_SESSION_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((turn) => ({ user: String(turn?.user || ""), assistant: String(turn?.assistant || "") }))
      .filter((turn) => turn.user || turn.assistant)
      .slice(-CLICKY_MAX_HISTORY_TURNS);
  } catch {
    return [];
  }
}

function saveClickyTurn(user: string, assistant: string) {
  try {
    const next = [...loadClickyHistory(), { user, assistant }].slice(-CLICKY_MAX_HISTORY_TURNS);
    sessionStorage.setItem(CLICKY_SESSION_HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

function isPushToTalkShortcut(event: KeyboardEvent) {
  return event.ctrlKey && (event.key === "t" || event.key === "T" || event.code === "KeyT") && !event.metaKey && !event.altKey && !event.shiftKey;
}

function isWakePhrase(text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z]/g, "");
  return (
    WAKE_RE.test(text) ||
    normalized.includes("heyclicky") ||
    normalized.includes("clicky") ||
    normalized.includes("clickie") ||
    normalized.includes("cliquey") ||
    normalized.includes("klicky") ||
    normalized.includes("kliky") ||
    normalized.includes("heychat") ||
    normalized === "chat" ||
    normalized.includes("heyquickly")
  );
}

function removeWakePhrase(text: string) {
  return text.replace(WAKE_RE, "").trim();
}

function isUsableCommand(text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  if (isWakePhrase(trimmed) && !removeWakePhrase(trimmed)) return false;
  const normalized = trimmed.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
  return normalized !== "i can help with that";
}

function startAwaitingCommand(
  awaitingCommandRef: MutableRefObject<boolean>,
  awaitingTimerRef: MutableRefObject<number | null>,
  setMode: Dispatch<SetStateAction<"idle" | "listening" | "thinking" | "speaking">>,
  setStatus: Dispatch<SetStateAction<string>>,
  setBubble: Dispatch<SetStateAction<string>>,
) {
  awaitingCommandRef.current = true;
  setMode("listening");
  setStatus("Clicky listening...");
  setBubble("");
  if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
  awaitingTimerRef.current = window.setTimeout(() => {
    if (awaitingCommandRef.current) {
      awaitingCommandRef.current = false;
      setMode("idle");
      setStatus("Listening for Hey Clicky");
      setBubble("");
    }
    awaitingTimerRef.current = null;
  }, 8000);
}

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

function collectDomTargets() {
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

function parsePcmRate(mime?: string | null) {
  const match = mime?.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

async function playPcm16Audio(
  audioB64: string,
  mime: string | null | undefined,
  playbackRef: MutableRefObject<{ context: AudioContext; source: AudioBufferSourceNode } | null>,
  requestId: number,
) {
  const audioStart = performance.now();
  console.info(CLICKY_LOG, "audio:stop_previous", { requestId });
  try {
    playbackRef.current?.source.stop();
  } catch {}
  try {
    void playbackRef.current?.context.close();
  } catch {}
  playbackRef.current = null;

  const binary = atob(audioB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const sampleRate = parsePcmRate(mime);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  console.info(CLICKY_LOG, "audio:play_pcm16:start", {
    requestId,
    mime,
    sampleRate,
    bytes: bytes.byteLength,
    durationMs: Math.round((sampleCount / sampleRate) * 1000),
  });
  const audioContext = new AudioContext({ sampleRate });
  const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
  const channel = buffer.getChannelData(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < sampleCount; i++) {
    channel[i] = Math.max(-1, Math.min(1, view.getInt16(i * 2, true) / 32768));
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  playbackRef.current = { context: audioContext, source };
  await audioContext.resume();
  source.start();
  await new Promise<void>((resolve) => {
    source.onended = () => {
      console.info(CLICKY_LOG, "audio:play_pcm16:end", { requestId });
      console.info(CLICKY_LOG, "timing:audio_complete", { requestId, audioMs: msSince(audioStart) });
      if (playbackRef.current?.source === source) playbackRef.current = null;
      void audioContext.close();
      resolve();
    };
  });
}

function clickDomElement(el: HTMLElement) {
  if (!isActionableElement(el)) return false;
  el.focus({ preventScroll: true });
  el.click();
  return true;
}

export default function GlobalClickyAssistant() {
  const { user, getToken } = useAuth();
  const pathname = usePathname();
  const pageHasRealtimeTutor = pathname?.startsWith("/board") || pathname?.startsWith("/learn");
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Clicky asleep");
  const [bubble, setBubble] = useState("");
  const [mode, setMode] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [wakeTemplate, setWakeTemplate] = useState<WakeTemplate | null>(null);
  const [trainingStatus, setTrainingStatus] = useState("Train Clicky with your pronunciation.");
  const [trainingPhraseIndex, setTrainingPhraseIndex] = useState(0);
  const cursorRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 90, y: 90 });
  const mouseRef = useRef({ x: 90, y: 90 });
  const activePointRef = useRef(false);
  const awaitingCommandRef = useRef(false);
  const awaitingTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchTimerRef = useRef<number | null>(null);
  const pushToTalkFinalizeTimerRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const audioPlaybackRef = useRef<{ context: AudioContext; source: AudioBufferSourceNode } | null>(null);
  const busyRef = useRef(false);
  const requestIdRef = useRef(0);
  const recognizerSessionRef = useRef(0);
  const recognitionShouldRunRef = useRef(false);
  const currentFetchControllerRef = useRef<AbortController | null>(null);
  const lastTemplateWakeRef = useRef(0);
  const enabledRef = useRef(false);
  const pushToTalkActiveRef = useRef(false);
  const pushToTalkFinalizingRef = useRef(false);
  const pushToTalkTranscriptRef = useRef("");
  const prefetchedSnapshotRef = useRef<Promise<PageSnapshot> | null>(null);
  const trainingOpenRef = useRef(false);
  const trainingRecordingRef = useRef(false);

  const capturePageSnapshot = useCallback(async (): Promise<PageSnapshot> => {
    const canvas = await html2canvas(document.body, {
      backgroundColor: "#ffffff",
      scale: 1,
      logging: false,
      useCORS: true,
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      ignoreElements: (el) => el instanceof HTMLElement && el.dataset.globalClicky === "true",
    });
    const { targets: domTargets, elementsById } = collectDomTargets();
    return {
      image: canvas.toDataURL("image/jpeg", 0.68).split(",")[1],
      width: canvas.width,
      height: canvas.height,
      domTargets,
      elementsById,
      capturedAt: Date.now(),
    };
  }, []);

  const prefetchSnapshot = useCallback(() => {
    if (!enabledRef.current || trainingOpenRef.current || trainingRecordingRef.current) return;
    prefetchedSnapshotRef.current = capturePageSnapshot().catch((error) => {
      if (prefetchedSnapshotRef.current) prefetchedSnapshotRef.current = null;
      throw error;
    });
  }, [capturePageSnapshot]);

  const scheduleSnapshotPrefetch = useCallback(() => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchTimerRef.current = null;
      if (!enabledRef.current || trainingOpenRef.current || trainingRecordingRef.current || busyRef.current) return;
      prefetchSnapshot();
    }, 900);
  }, [prefetchSnapshot]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis as SpeechSynthesis & { __clickyPatched?: boolean; __clickyOriginalSpeak?: typeof window.speechSynthesis.speak };
    if (synth.__clickyPatched) return;
    const originalSpeak = synth.speak.bind(synth);
    synth.__clickyOriginalSpeak = originalSpeak;
    synth.__clickyPatched = true;
    synth.speak = (utterance: SpeechSynthesisUtterance) => {
      console.warn(CLICKY_LOG, "browser_speechSynthesis:speak_called", {
        text: utterance.text,
        voice: utterance.voice?.name,
        stack: new Error().stack,
      });
      return originalSpeak(utterance);
    };
  }, []);

  const startRecognition = useCallback(() => {
    if (!enabledRef.current || pageHasRealtimeTutor || busyRef.current || trainingOpenRef.current || trainingRecordingRef.current || pushToTalkActiveRef.current || pushToTalkFinalizingRef.current || !recognitionShouldRunRef.current) return;
    try { recognitionRef.current?.start(); } catch {}
  }, [pageHasRealtimeTutor]);

  const stopCurrentResponse = useCallback(() => {
    console.info(CLICKY_LOG, "response:stop_current", { previousRequestId: requestIdRef.current });
    requestIdRef.current += 1;
    currentFetchControllerRef.current?.abort();
    currentFetchControllerRef.current = null;
    try { audioPlaybackRef.current?.source.stop(); } catch {}
    try { void audioPlaybackRef.current?.context.close(); } catch {}
    audioPlaybackRef.current = null;
    busyRef.current = false;
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    try {
      setEnabled(localStorage.getItem(CLICKY_ENABLED_KEY) === "1");
      setWakeTemplate(loadWakeTemplate());
    } catch {}
  }, []);

  useEffect(() => {
    trainingOpenRef.current = trainingOpen;
    if (!trainingOpen) return;
    awaitingCommandRef.current = false;
    pushToTalkActiveRef.current = false;
    pushToTalkFinalizingRef.current = false;
    pushToTalkTranscriptRef.current = "";
    prefetchedSnapshotRef.current = null;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    if (pushToTalkFinalizeTimerRef.current) clearTimeout(pushToTalkFinalizeTimerRef.current);
    restartTimerRef.current = null;
    awaitingTimerRef.current = null;
    prefetchTimerRef.current = null;
    pushToTalkFinalizeTimerRef.current = null;
    try { recognitionRef.current?.stop(); } catch {}
    setMode("idle");
    setStatus("Clicky training mode");
    setBubble("");
  }, [trainingOpen]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) return;
    recognitionShouldRunRef.current = false;
    recognizerSessionRef.current += 1;
    awaitingCommandRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    if (pushToTalkFinalizeTimerRef.current) clearTimeout(pushToTalkFinalizeTimerRef.current);
    restartTimerRef.current = null;
    awaitingTimerRef.current = null;
    prefetchTimerRef.current = null;
    pushToTalkFinalizeTimerRef.current = null;
    pushToTalkActiveRef.current = false;
    pushToTalkFinalizingRef.current = false;
    pushToTalkTranscriptRef.current = "";
    prefetchedSnapshotRef.current = null;
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    stopCurrentResponse();
    setMode("idle");
    setStatus("Clicky asleep");
    setBubble("");
  }, [enabled, stopCurrentResponse]);

  const recordWakeSample = useCallback(async () => {
    trainingRecordingRef.current = true;
    const phrase = WAKE_TRAINING_PHRASES[trainingPhraseIndex % WAKE_TRAINING_PHRASES.length];
    setTrainingStatus(`Recording now. Say "${phrase}" once.`);
    try {
      try { recognitionRef.current?.stop(); } catch {}
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
      if (enabledRef.current && !trainingOpenRef.current) window.setTimeout(startRecognition, 300);
    }
  }, [startRecognition, trainingPhraseIndex, wakeTemplate]);

  const resetWakeTraining = useCallback(() => {
    clearWakeTemplate();
    setWakeTemplate(null);
    setTrainingPhraseIndex(0);
    setTrainingStatus("Training cleared. Start with 'chat'.");
  }, []);

  const setClickyEnabled = useCallback((next: boolean) => {
    enabledRef.current = next;
    setEnabled(next);
    try {
      localStorage.setItem(CLICKY_ENABLED_KEY, next ? "1" : "0");
    } catch {}
  }, []);

  const setCursor = useCallback((x: number, y: number, rot = -35, scale = 1, opacity = 1) => {
    const el = cursorRef.current;
    if (!el) return;
    posRef.current = { x, y };
    el.style.opacity = String(opacity);
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouseRef.current = { x: e.clientX + 35, y: e.clientY + 25 };
    };
    window.addEventListener("pointermove", onMove);
    const tick = () => {
      if (!activePointRef.current) {
        const cur = posRef.current;
        const tgt = mouseRef.current;
        const x = cur.x + (tgt.x - cur.x) * 0.14;
        const y = cur.y + (tgt.y - cur.y) * 0.14;
        const dx = x - cur.x;
        const dy = y - cur.y;
        const speed = Math.hypot(dx, dy);
        const rot = speed > 0.2 ? (Math.atan2(dy, dx) * 180) / Math.PI + 90 : -35;
        setCursor(x, y, rot, 1 + Math.min(speed / 100, 0.08), 1);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [setCursor]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const flyTo = useCallback((point: Point) => {
    activePointRef.current = true;
    const from = posRef.current;
    const to = { x: point.x, y: point.y };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const duration = Math.min(Math.max(dist / 850, 0.45), 1.2) * 1000;
    const arc = Math.min(dist * 0.18, 80);
    const c = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc };
    const start = performance.now();
    const step = (now: number) => {
      const raw = Math.min((now - start) / duration, 1);
      const t = raw * raw * (3 - 2 * raw);
      const m = 1 - t;
      const x = m * m * from.x + 2 * m * t * c.x + t * t * to.x;
      const y = m * m * from.y + 2 * m * t * c.y + t * t * to.y;
      const tx = 2 * m * (c.x - from.x) + 2 * t * (to.x - c.x);
      const ty = 2 * m * (c.y - from.y) + 2 * t * (to.y - c.y);
      setCursor(x, y, (Math.atan2(ty, tx) * 180) / Math.PI + 90, 1 + Math.sin(raw * Math.PI) * 0.3, 1);
      if (raw < 1) requestAnimationFrame(step);
      else {
        setBubble(point.label || "right here");
        setTimeout(() => {
          activePointRef.current = false;
          setBubble("");
        }, 2600);
      }
    };
    requestAnimationFrame(step);
  }, [setCursor]);

  const askClicky = useCallback(async (prompt: string) => {
    if (!enabledRef.current || pageHasRealtimeTutor || !user || busyRef.current || trainingOpenRef.current || trainingRecordingRef.current) return;
    const command = prompt.trim();
    if (!isUsableCommand(command)) {
      setMode("listening");
      setStatus("Clicky listening...");
      setBubble("What should I help with?");
      startAwaitingCommand(awaitingCommandRef, awaitingTimerRef, setMode, setStatus, setBubble);
      return;
    }
    stopCurrentResponse();
    busyRef.current = true;
    const requestId = ++requestIdRef.current;
    const fetchController = new AbortController();
    currentFetchControllerRef.current = fetchController;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
      try { recognitionRef.current?.stop(); } catch {}
      setMode("thinking");
    setStatus("Clicky looking...");
    setBubble("");
    const totalStart = performance.now();
    console.info(CLICKY_LOG, "request:start", { requestId, command });
    try {
      const snapshotStart = performance.now();
      const prefetched = prefetchedSnapshotRef.current;
      prefetchedSnapshotRef.current = null;
      let snapshot: PageSnapshot | null = null;
      let usedPrefetch = false;
      if (prefetched) {
        try {
          const candidate = await prefetched;
          if (Date.now() - candidate.capturedAt <= 10000) {
            snapshot = candidate;
            usedPrefetch = true;
          }
        } catch {}
      }
      snapshot ??= await capturePageSnapshot();
      console.info(CLICKY_LOG, "timing:snapshot_ready", {
        requestId,
        snapshotMs: msSince(snapshotStart),
        totalMs: msSince(totalStart),
        usedPrefetch,
        ageMs: Date.now() - snapshot.capturedAt,
        bytesB64: snapshot.image.length,
        domTargets: snapshot.domTargets.length,
      });
      const { domTargets, elementsById } = snapshot;
      const rectById = new Map(domTargets.map((t) => [t.id, t]));
      const token = await getToken();
      const fetchStart = performance.now();
      const res = await fetch(`${API_URL}/api/clicky`, {
        method: "POST",
        signal: fetchController.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({
          clientRequestId: `global-clicky-${requestId}`,
          conversationId: loadClickySessionId(),
          prompt: command,
          image: snapshot.image,
          mimeType: "image/jpeg",
          width: snapshot.width,
          height: snapshot.height,
          elements: domTargets,
          history: loadClickyHistory(),
          includeAudio: false,
        }),
      });
      const data = (await res.json()) as ClickyApiResponse;
      const responseMs = msSince(fetchStart);
      console.info(CLICKY_LOG, "request:response", {
        requestId,
        status: res.status,
        responseMs,
        totalMs: msSince(totalStart),
        answer: data.answer,
        targetId: data.targetId,
        action: data.action,
        hasPoint: Boolean(data.point),
        audioBytesB64: data.audio_b64?.length ?? 0,
        audioMime: data.audio_mime,
      });
      if (requestId !== requestIdRef.current) return;
      currentFetchControllerRef.current = null;
      const answer = String(data.answer || "I did not get a useful answer. Try asking again.");
      saveClickyTurn(command, answer);
      setStatus("Clicky ready");
      setMode("speaking");
      setBubble("");
      if (data.targetId && rectById.has(data.targetId)) {
        const target = rectById.get(data.targetId)!;
        flyTo({
          x: target.rect.x + target.rect.width / 2,
          y: target.rect.y + target.rect.height / 2,
          label: data.point?.label || target.text,
        });
        if (data.action === "click") {
          window.setTimeout(() => {
            const el = elementsById.get(data.targetId || "");
            if (el && clickDomElement(el)) {
              console.info(CLICKY_LOG, "timing:action_click", { requestId, totalMs: msSince(totalStart), targetId: data.targetId, target: target.text });
              setBubble(`Clicked ${target.text}`);
            }
          }, 750);
        }
      } else if (data.point) {
        const x = (Number(data.point.x) / snapshot.width) * window.innerWidth;
        const y = (Number(data.point.y) / snapshot.height) * window.innerHeight;
        flyTo({ x, y, label: data.point.label });
      }
      const speakStart = performance.now();
      void (async () => {
        const speakRes = await fetch(`${API_URL}/api/clicky/speak`, {
          method: "POST",
          signal: fetchController.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: token } : {}),
          },
          body: JSON.stringify({
            clientRequestId: `global-clicky-${requestId}-speak`,
            text: answer,
          }),
        });
        const speech = (await speakRes.json()) as Pick<ClickyApiResponse, "audio_b64" | "audio_mime">;
        console.info(CLICKY_LOG, "timing:speech_response", {
          requestId,
          speechMs: msSince(speakStart),
          totalMs: msSince(totalStart),
          audioBytesB64: speech.audio_b64?.length ?? 0,
        });
        if (requestId !== requestIdRef.current) return;
        if (speech.audio_b64) {
          await playPcm16Audio(speech.audio_b64, speech.audio_mime, audioPlaybackRef, requestId);
        }
      })().catch((error) => {
        console.warn(CLICKY_LOG, "speech:error", { requestId, error });
      }).finally(() => {
          if (requestId !== requestIdRef.current) return;
          busyRef.current = false;
          setMode("idle");
          console.info(CLICKY_LOG, "timing:request_complete", { requestId, totalMs: msSince(totalStart), hadAudio: true });
          window.setTimeout(startRecognition, 250);
      });
    } catch {
      if (requestId !== requestIdRef.current) return;
      currentFetchControllerRef.current = null;
      busyRef.current = false;
      console.warn(CLICKY_LOG, "request:error", { requestId, command });
      setStatus("Clicky ready");
      setMode("idle");
      setBubble("I couldn't see the page just now. Try again.");
      window.setTimeout(startRecognition, 250);
    }
  }, [capturePageSnapshot, flyTo, getToken, pageHasRealtimeTutor, startRecognition, stopCurrentResponse, user]);

  const submitPushToTalkTranscript = useCallback(() => {
    if (!enabledRef.current || pageHasRealtimeTutor || busyRef.current || trainingOpenRef.current || trainingRecordingRef.current) return;
    const transcript = pushToTalkTranscriptRef.current.trim();
    pushToTalkFinalizingRef.current = false;
    pushToTalkTranscriptRef.current = "";
    if (!transcript) {
      setMode("idle");
      setStatus("Listening for Hey Clicky");
      window.setTimeout(startRecognition, 200);
      return;
    }
    void askClicky(transcript);
  }, [askClicky, pageHasRealtimeTutor, startRecognition]);

  useEffect(() => {
    if (!enabled || !user || pageHasRealtimeTutor) return;

    const startPushToTalk = (event: KeyboardEvent) => {
      if (!isPushToTalkShortcut(event)) return;
      if (!enabledRef.current || busyRef.current || trainingOpenRef.current || trainingRecordingRef.current || pushToTalkActiveRef.current) return;
      event.preventDefault();
      pushToTalkActiveRef.current = true;
      pushToTalkFinalizingRef.current = false;
      pushToTalkTranscriptRef.current = "";
      awaitingCommandRef.current = false;
      if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
      if (pushToTalkFinalizeTimerRef.current) clearTimeout(pushToTalkFinalizeTimerRef.current);
      awaitingTimerRef.current = null;
      pushToTalkFinalizeTimerRef.current = null;
      stopCurrentResponse();
      recognitionShouldRunRef.current = true;
      setMode("listening");
      setStatus("Hold Control + T, speak, then release");
      scheduleSnapshotPrefetch();
      try { recognitionRef.current?.start(); } catch {}
    };

    const stopPushToTalk = (event: KeyboardEvent) => {
      if (!pushToTalkActiveRef.current) return;
      if (isPushToTalkShortcut(event)) return;
      event.preventDefault();
      pushToTalkActiveRef.current = false;
      pushToTalkFinalizingRef.current = true;
      setMode("thinking");
      setStatus("Clicky transcribing...");
      try { recognitionRef.current?.stop(); } catch {}
      if (pushToTalkFinalizeTimerRef.current) clearTimeout(pushToTalkFinalizeTimerRef.current);
      pushToTalkFinalizeTimerRef.current = window.setTimeout(submitPushToTalkTranscript, 1400);
    };

    window.addEventListener("keydown", startPushToTalk);
    window.addEventListener("keyup", stopPushToTalk);
    return () => {
      window.removeEventListener("keydown", startPushToTalk);
      window.removeEventListener("keyup", stopPushToTalk);
      if (pushToTalkFinalizeTimerRef.current) clearTimeout(pushToTalkFinalizeTimerRef.current);
      pushToTalkFinalizeTimerRef.current = null;
      pushToTalkActiveRef.current = false;
      pushToTalkFinalizingRef.current = false;
      pushToTalkTranscriptRef.current = "";
      prefetchedSnapshotRef.current = null;
    };
  }, [enabled, pageHasRealtimeTutor, scheduleSnapshotPrefetch, stopCurrentResponse, submitPushToTalkTranscript, user]);

  useEffect(() => {
    if (!enabled || !user) return;
    if (trainingOpen) {
      setMode("idle");
      setStatus("Clicky training mode");
      setBubble("");
      return;
    }
    if (pageHasRealtimeTutor) {
      setMode("idle");
      setStatus("Clicky voice paused here");
      setBubble("");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus("Clicky voice unsupported");
      setBubble("Voice wake word is not supported in this browser.");
      return;
    }

    const sessionId = ++recognizerSessionRef.current;
    recognitionShouldRunRef.current = true;
    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onstart = () => setStatus("Listening for Hey Clicky");
    rec.onresult = (event: any) => {
      if (!enabledRef.current || trainingOpenRef.current || trainingRecordingRef.current || sessionId !== recognizerSessionRef.current || !recognitionShouldRunRef.current) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const trimmed = String(event.results[i][0]?.transcript || "").trim();
        if (!event.results[i].isFinal || !trimmed) continue;
        console.info(CLICKY_LOG, "speech_recognition:final", {
          sessionId,
          transcript: trimmed,
          awaitingCommand: awaitingCommandRef.current,
          busy: busyRef.current,
          pushToTalk: pushToTalkActiveRef.current || pushToTalkFinalizingRef.current,
        });

        if (pushToTalkActiveRef.current || pushToTalkFinalizingRef.current) {
          pushToTalkTranscriptRef.current = [pushToTalkTranscriptRef.current, trimmed].filter(Boolean).join(" ").trim();
          if (pushToTalkFinalizingRef.current) {
            if (pushToTalkFinalizeTimerRef.current) clearTimeout(pushToTalkFinalizeTimerRef.current);
            pushToTalkFinalizeTimerRef.current = window.setTimeout(submitPushToTalkTranscript, 450);
          }
          continue;
        }

        if (awaitingCommandRef.current) {
          if (isWakePhrase(trimmed) && !removeWakePhrase(trimmed)) {
            startAwaitingCommand(awaitingCommandRef, awaitingTimerRef, setMode, setStatus, setBubble);
            scheduleSnapshotPrefetch();
            continue;
          }
          awaitingCommandRef.current = false;
          if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
          awaitingTimerRef.current = null;
          setStatus("Clicky thinking...");
          void askClicky(trimmed);
          continue;
        }

        if (!isWakePhrase(trimmed)) continue;
        startAwaitingCommand(awaitingCommandRef, awaitingTimerRef, setMode, setStatus, setBubble);
        scheduleSnapshotPrefetch();
      }
    };
    rec.onerror = (event: any) => {
      if (!enabledRef.current || trainingOpenRef.current || trainingRecordingRef.current || sessionId !== recognizerSessionRef.current || !recognitionShouldRunRef.current) return;
      const err = String(event?.error || "speech error");
      if (err === "not-allowed" || err === "service-not-allowed") {
        setStatus("Mic permission needed");
        setBubble("Click Enable Clicky and allow microphone access.");
        setClickyEnabled(false);
        return;
      }
      setStatus(`Clicky voice: ${err}`);
      console.warn(CLICKY_LOG, "speech_recognition:error", { sessionId, err });
    };
    rec.onend = () => {
      console.info(CLICKY_LOG, "speech_recognition:end", {
        sessionId,
        activeSession: recognizerSessionRef.current,
        shouldRun: recognitionShouldRunRef.current,
        busy: busyRef.current,
      });
      if (sessionId === recognizerSessionRef.current && recognitionShouldRunRef.current && enabledRef.current && !trainingOpenRef.current && !trainingRecordingRef.current && !pageHasRealtimeTutor && !busyRef.current && !pushToTalkActiveRef.current && !pushToTalkFinalizingRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (!enabledRef.current || trainingOpenRef.current || trainingRecordingRef.current || sessionId !== recognizerSessionRef.current || !recognitionShouldRunRef.current || busyRef.current || pushToTalkActiveRef.current || pushToTalkFinalizingRef.current) return;
          try { rec.start(); } catch {}
        }, 350);
      }
    };
    try {
      rec.start();
    } catch {
      setStatus("Clicky voice unavailable");
    }

    return () => {
      recognitionShouldRunRef.current = false;
      recognizerSessionRef.current += 1;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      if (pushToTalkFinalizeTimerRef.current) clearTimeout(pushToTalkFinalizeTimerRef.current);
      restartTimerRef.current = null;
      awaitingTimerRef.current = null;
      prefetchTimerRef.current = null;
      pushToTalkFinalizeTimerRef.current = null;
      awaitingCommandRef.current = false;
      pushToTalkActiveRef.current = false;
      pushToTalkFinalizingRef.current = false;
      pushToTalkTranscriptRef.current = "";
      prefetchedSnapshotRef.current = null;
      try { rec.stop(); } catch {}
      recognitionRef.current = null;
      stopCurrentResponse();
    };
  }, [askClicky, enabled, pageHasRealtimeTutor, setClickyEnabled, stopCurrentResponse, trainingOpen, user]);

  useEffect(() => {
    if (!enabled || !user || trainingOpen || pageHasRealtimeTutor || !wakeTemplate?.vectors.length) return;
    let cancelled = false;
    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;
    let silentGain: GainNode | null = null;
    const rolling: Float32Array[] = [];
    let rollingSamples = 0;
    let lastCheck = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        });
        if (cancelled || !enabledRef.current || trainingOpenRef.current || trainingRecordingRef.current) return;
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(stream);
        processor = audioContext.createScriptProcessor(2048, 1, 1);
        silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        const maxSamples = Math.floor(audioContext.sampleRate * 1.6);
        processor.onaudioprocess = (event) => {
          if (cancelled || !enabledRef.current || trainingOpenRef.current || trainingRecordingRef.current || busyRef.current || awaitingCommandRef.current || pushToTalkActiveRef.current || pushToTalkFinalizingRef.current) return;
          const now = performance.now();
          const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
          rolling.push(chunk);
          rollingSamples += chunk.length;
          while (rollingSamples > maxSamples && rolling.length > 1) {
            const removed = rolling.shift();
            rollingSamples -= removed?.length ?? 0;
          }
          if (now - lastCheck < 260 || now - lastTemplateWakeRef.current < 2800) return;
          lastCheck = now;
          const samples = new Float32Array(rollingSamples);
          let offset = 0;
          for (const part of rolling) {
            samples.set(part, offset);
            offset += part.length;
          }
          const vector = extractWakeVector(samples, audioContext?.sampleRate ?? 44100);
          if (!vector) return;
          const similarity = bestWakeSimilarity(vector, wakeTemplate);
          if (similarity >= 0.72) {
            console.info(CLICKY_LOG, "wake_template:matched", { similarity, samples: wakeTemplate.vectors.length });
            lastTemplateWakeRef.current = now;
            rolling.length = 0;
            rollingSamples = 0;
            startAwaitingCommand(awaitingCommandRef, awaitingTimerRef, setMode, setStatus, setBubble);
            scheduleSnapshotPrefetch();
          }
        };
        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioContext.destination);
        await audioContext.resume();
        console.info(CLICKY_LOG, "wake_template:detector_started", { samples: wakeTemplate.vectors.length });
      } catch (err) {
        console.warn(CLICKY_LOG, "wake_template:detector_failed", err);
      }
    })();

    return () => {
      cancelled = true;
      try { source?.disconnect(); } catch {}
      try { processor?.disconnect(); } catch {}
      try { silentGain?.disconnect(); } catch {}
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext) void audioContext.close();
    };
  }, [enabled, pageHasRealtimeTutor, scheduleSnapshotPrefetch, trainingOpen, user, wakeTemplate]);

  if (!mounted) return null;

  if (!user) {
    return (
      <div data-global-clicky="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000 }}>
        <div
          ref={cursorRef}
          style={{ position: "fixed", left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: "transform, opacity" }}
        >
          <div style={{ position: "absolute", left: 0, top: 0, opacity: mode === "idle" ? 1 : 0, transition: "opacity 0.15s ease" }}>
            <div style={{ width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: "16px solid #6366f1", filter: "drop-shadow(0 0 8px rgba(99,102,241,0.55))" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-global-clicky="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000 }}>
      <div
        ref={cursorRef}
        style={{ position: "fixed", left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: "transform, opacity" }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, opacity: mode === "idle" ? 1 : 0, transition: "opacity 0.15s ease" }}>
          <div style={{ width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: "16px solid #6366f1", filter: "drop-shadow(0 0 8px rgba(99,102,241,0.55))" }} />
        </div>
        <div style={{ position: "absolute", left: -6, top: -8, display: "flex", alignItems: "center", gap: 2, opacity: mode === "listening" || mode === "speaking" ? 1 : 0, transition: "opacity 0.15s ease", filter: "drop-shadow(0 0 6px rgba(99,102,241,0.6))" }}>
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
      <button
        type="button"
        onClick={() => setClickyEnabled(!enabled)}
        style={{ pointerEvents: "auto", position: "fixed", right: 18, bottom: 18, border: "1px solid rgba(99,102,241,0.35)", background: enabled ? "#6366f1" : "#fff", color: enabled ? "#fff" : "#2A2A2A", borderRadius: 999, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        {enabled && pageHasRealtimeTutor ? "Clicky paused for tutor" : enabled ? status : "Enable Clicky"}
      </button>
      <button
        type="button"
        onClick={() => setTrainingOpen((open) => !open)}
        style={{ pointerEvents: "auto", position: "fixed", right: 18, bottom: 64, border: "1px solid rgba(99,102,241,0.25)", background: "#fff", color: "#2A2A2A", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        Train wake phrase
      </button>
      {trainingOpen && (
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
      <style jsx global>{`
        @keyframes clicky-wave { from { transform: scaleY(0.65); opacity: 0.7; } to { transform: scaleY(1.22); opacity: 1; } }
        @keyframes clicky-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
