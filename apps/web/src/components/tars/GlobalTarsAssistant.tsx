"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTars } from "@/lib/tars/provider";
import { useLearner } from "@/lib/learning/provider";
import { WS_URL } from "@/lib/constants";
import { useAudio } from "@/hooks/useAudio";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  TARS_BOARD_DRAW_EVENT,
  type TarsDrawCommand,
} from "@/lib/tars/boardBridge";
import {
  extractWakeVector,
  loadWakeTemplate,
  saveWakeTemplate,
  type WakeTemplate,
} from "@/lib/tars/wakeTemplate";
import { TEACHING_PROFILE_CHANGED_EVENT } from "@/lib/tars/teachingProfiles";
import { isEmbeddedTarsRoute } from "@/lib/tars/routes";

// ── Types ────────────────────────────────────────────────────────────────────

type Point = { x: number; y: number; label?: string };
type DomTarget = {
  id: string;
  role: string;
  text: string;
  actionable: boolean;
  rect: { x: number; y: number; width: number; height: number };
};
type ViewportCalibration = {
  signature: string;
  sourceWidth: number;
  sourceHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type CapturedViewportFrame = {
  data: string;
  mimeType: string;
  width: number;
  height: number;
  calibrated: boolean;
  calibration: ViewportCalibration | null;
};
type ScreenAnnotation = {
  id: string;
  shape: "circle" | "rectangle" | "triangle" | "highlight" | "underline" | "arrow" | "line" | "text";
  style: "solid" | "dashed" | "dotted";
  color: "blue" | "teal" | "red" | "amber" | "purple";
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  provisional?: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TARS_LOG = "[GlobalTars]";
const TARS_SESSION_ID_KEY = "ctrlteach_tars_session_id";
const WAKE_TRAINING_PHRASES = ["chat", "hey chat"];
const SHOW_TARS_BUBBLE = false;
const TARS_SPEECH_TAIL_MS = 700;
const MAX_DOM_TARGETS = 220;
const ANNOTATION_COLORS: Record<ScreenAnnotation["color"], string> = {
  blue: "#3380ff",
  teal: "#14b8a6",
  red: "#ef4444",
  amber: "#f59e0b",
  purple: "#8b5cf6",
};

function msSince(start: number) {
  return Math.round(performance.now() - start);
}

function loadTarsSessionId() {
  try {
    const existing = sessionStorage.getItem(TARS_SESSION_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID?.() || `tars-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(TARS_SESSION_ID_KEY, next);
    return next;
  } catch {
    return `tars-${Date.now()}`;
  }
}

// ── DOM inventory helpers (preserved from old path) ──────────────────────────

function elementLabel(el: HTMLElement) {
  const semanticLabel =
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.getAttribute("placeholder") ||
    el.getAttribute("alt") ||
    ("value" in el && typeof (el as HTMLInputElement).value === "string"
      ? (el as HTMLInputElement).value
      : "");
  const text = semanticLabel || el.innerText || el.textContent || "";
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
    "[role='tab']", "[role='menuitem']", "[data-tars-target]",
  ].join(","));
}

function collectDomTargets(): { targets: DomTarget[]; elementsById: Map<string, HTMLElement> } {
  const selector = [
    "button", "a[href]", "input", "textarea", "select", "[role='button']", "[role='link']",
    "[role='tab']", "[role='menuitem']", "[role='option']", "[role='switch']", "[role='checkbox']",
    "[aria-label]", "[title]", "[data-tars-target]", "h1", "h2", "h3", "h4", "h5", "h6",
    "label", "summary", "p", "li", "td", "th", "code",
  ].join(",");
  const candidateElements = new Set<HTMLElement>(
    Array.from(document.querySelectorAll<HTMLElement>(selector)),
  );

  // Include leaf text nodes (for example, a word inside a styled span). The
  // old inventory omitted these, forcing the model to guess raw pixels even
  // though the browser already knows their exact rectangles.
  const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode = textWalker.nextNode();
  while (textNode) {
    const text = textNode.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const parent = textNode.parentElement;
    if (
      text.length >= 2 &&
      parent &&
      !parent.matches("script,style,noscript,textarea") &&
      parent.childElementCount === 0
    ) {
      candidateElements.add(parent);
    }
    textNode = textWalker.nextNode();
  }

  const rankedElements = Array.from(candidateElements).sort((first, second) => {
    const priority = (element: HTMLElement) => {
      let score = 0;
      if (element.hasAttribute("data-tars-target")) score += 1000;
      if (isActionableElement(element)) score += 800;
      if (element.hasAttribute("aria-label") || element.hasAttribute("title")) score += 500;
      if (element.childElementCount === 0) score += 250;
      return score;
    };
    return priority(second) - priority(first);
  });

  const targets: DomTarget[] = [];
  const elementsById = new Map<string, HTMLElement>();
  const seenTargets = new Set<string>();
  for (const el of rankedElements) {
    if (el.closest("[data-global-tars='true']")) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) continue;
    const text = elementLabel(el);
    if (!text && !el.matches("input,textarea,select,[data-tars-target]")) continue;
    const clippedLeft = Math.max(0, rect.left);
    const clippedTop = Math.max(0, rect.top);
    const clippedRight = Math.min(window.innerWidth, rect.right);
    const clippedBottom = Math.min(window.innerHeight, rect.bottom);
    const dedupeKey = `${elementRole(el)}|${text.toLowerCase()}|${Math.round(clippedLeft)}|${Math.round(clippedTop)}|${Math.round(clippedRight)}|${Math.round(clippedBottom)}`;
    if (seenTargets.has(dedupeKey)) continue;
    seenTargets.add(dedupeKey);

    const id = `dom-${targets.length}`;
    targets.push({
      id,
      role: elementRole(el),
      text: text || elementRole(el),
      actionable: isActionableElement(el),
      rect: {
        x: clippedLeft,
        y: clippedTop,
        width: clippedRight - clippedLeft,
        height: clippedBottom - clippedTop,
      },
    });
    elementsById.set(id, el);
    if (targets.length >= MAX_DOM_TARGETS) break;
  }
  return { targets, elementsById };
}

function clickDomElement(el: HTMLElement) {
  if (!isActionableElement(el)) return false;
  el.focus({ preventScroll: true });
  el.click();
  return true;
}

function pointForElement(el: HTMLElement, label?: string) {
  const quotedText = label?.match(/['\"]([^'\"]+)['\"]/)?.[1]?.trim();
  const cleanedLabel = (label ?? "")
    .replace(/['\"]/g, "")
    .replace(/\b(the|word|text|button|link|field|icon|right|here)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const textNeedles = [quotedText, cleanedLabel]
    .filter((value): value is string => Boolean(value && value.length >= 2))
    .sort((first, second) => second.length - first.length);

  if (textNeedles.length) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const rawText = node.textContent ?? "";
      const lowerText = rawText.toLowerCase();
      for (const needle of textNeedles) {
        const start = lowerText.indexOf(needle.toLowerCase());
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + needle.length);
        const textRect = range.getBoundingClientRect();
        if (textRect.width >= 1 && textRect.height >= 1) {
          return {
            x: textRect.left + textRect.width / 2,
            y: textRect.top + textRect.height / 2,
          };
        }
      }
      node = walker.nextNode();
    }
  }

  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function findClosestDomTarget(
  x: number,
  y: number,
  elementsById: Map<string, HTMLElement>,
): HTMLElement | null {
  let best: { element: HTMLElement; score: number } | null = null;
  const seen = new Set<HTMLElement>();
  for (const element of elementsById.values()) {
    if (!element.isConnected || seen.has(element)) continue;
    seen.add(element);
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const deltaX = Math.max(rect.left - x, 0, x - rect.right);
    const deltaY = Math.max(rect.top - y, 0, y - rect.bottom);
    const distance = Math.hypot(deltaX, deltaY);
    if (distance > 28) continue;
    // Prefer the smallest element containing the point. This turns a visual
    // estimate anywhere inside a button into the browser's exact button center.
    const area = rect.width * rect.height;
    const score = distance * 1_000_000 + area;
    if (!best || score < best.score) best = { element, score };
  }
  return best?.element ?? null;
}

function findDomTargetByLabel(
  label: string | undefined,
  elementsById: Map<string, HTMLElement>,
): HTMLElement | null {
  const normalizedLabel = (label ?? "")
    .toLowerCase()
    .replace(/['\"]/g, "")
    .replace(/\b(the|word|button|link|field|icon|right|here)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalizedLabel.length < 2) return null;
  let best: { element: HTMLElement; score: number } | null = null;
  for (const element of elementsById.values()) {
    if (!element.isConnected) continue;
    const text = elementLabel(element).toLowerCase();
    if (!text) continue;
    const exact = text === normalizedLabel;
    const contained = text.includes(normalizedLabel) || normalizedLabel.includes(text);
    if (!exact && !contained) continue;
    const rect = element.getBoundingClientRect();
    const score = (exact ? 0 : 1_000_000) + rect.width * rect.height;
    if (!best || score < best.score) best = { element, score };
  }
  return best?.element ?? null;
}

// ── Calibrated viewport capture ─────────────────────────────────────────────

const CALIBRATION_MARKERS = [
  { key: "tl", color: [255, 0, 255] as const, style: { left: "0", top: "0" } },
  { key: "tr", color: [0, 255, 255] as const, style: { right: "0", top: "0" } },
  { key: "bl", color: [255, 128, 0] as const, style: { left: "0", bottom: "0" } },
  { key: "br", color: [128, 0, 255] as const, style: { right: "0", bottom: "0" } },
] as const;

function createCalibrationOverlay() {
  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
  });
  for (const marker of CALIBRATION_MARKERS) {
    const element = document.createElement("div");
    element.dataset.tarsCalibrationMarker = marker.key;
    Object.assign(element.style, {
      position: "absolute",
      width: "14px",
      height: "14px",
      background: `rgb(${marker.color.join(",")})`,
      ...marker.style,
    });
    overlay.appendChild(element);
  }
  document.body.appendChild(overlay);
  return overlay;
}

function captureSignature(track: MediaStreamTrack, video: HTMLVideoElement) {
  const settings = track.getSettings();
  return [
    settings.displaySurface ?? "unknown",
    video.videoWidth,
    video.videoHeight,
    window.screenX,
    window.screenY,
    window.outerWidth,
    window.outerHeight,
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
  ].join(":");
}

function detectViewportCalibration(
  canvas: HTMLCanvasElement,
  signature: string,
  expectedMarkerSize: number,
): ViewportCalibration | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const labels = new Uint8Array(canvas.width * canvas.height);
  const toleranceSquared = 75 * 75;

  for (let pixelIndex = 0; pixelIndex < labels.length; pixelIndex++) {
    const dataIndex = pixelIndex * 4;
    const red = pixels[dataIndex];
    const green = pixels[dataIndex + 1];
    const blue = pixels[dataIndex + 2];
    for (let markerIndex = 0; markerIndex < CALIBRATION_MARKERS.length; markerIndex++) {
      const color = CALIBRATION_MARKERS[markerIndex].color;
      const distance =
        (red - color[0]) ** 2 +
        (green - color[1]) ** 2 +
        (blue - color[2]) ** 2;
      if (distance <= toleranceSquared) {
        labels[pixelIndex] = markerIndex + 1;
        break;
      }
    }
  }

  type Bounds = { count: number; minX: number; minY: number; maxX: number; maxY: number; score: number };
  const bestBounds: Array<Bounds | null> = CALIBRATION_MARKERS.map(() => null);
  const stack: number[] = [];
  for (let start = 0; start < labels.length; start++) {
    const label = labels[start];
    if (!label) continue;
    labels[start] = 0;
    stack.push(start);
    let count = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    while (stack.length) {
      const current = stack.pop()!;
      const x = current % canvas.width;
      const y = Math.floor(current / canvas.width);
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbours = [current - 1, current + 1, current - canvas.width, current + canvas.width];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= labels.length || labels[neighbour] !== label) continue;
        const neighbourX = neighbour % canvas.width;
        if (Math.abs(neighbourX - x) > 1) continue;
        labels[neighbour] = 0;
        stack.push(neighbour);
      }
    }
    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const density = count / (componentWidth * componentHeight);
    const minimumSize = Math.max(2, expectedMarkerSize * 0.4);
    const maximumSize = expectedMarkerSize * 2.2;
    const score =
      Math.abs(componentWidth - expectedMarkerSize) +
      Math.abs(componentHeight - expectedMarkerSize) +
      (1 - density) * expectedMarkerSize * 4;
    const existing = bestBounds[label - 1];
    if (
      count >= 8 &&
      componentWidth >= minimumSize &&
      componentHeight >= minimumSize &&
      componentWidth <= maximumSize &&
      componentHeight <= maximumSize &&
      density >= 0.45 &&
      (!existing || score < existing.score)
    ) {
      bestBounds[label - 1] = { count, minX, minY, maxX, maxY, score };
    }
  }

  const [topLeft, topRight, bottomLeft, bottomRight] = bestBounds;
  if (!topLeft || !topRight || !bottomLeft || !bottomRight) return null;
  const x = Math.min(topLeft.minX, bottomLeft.minX);
  const y = Math.min(topLeft.minY, topRight.minY);
  const right = Math.max(topRight.maxX, bottomRight.maxX) + 1;
  const bottom = Math.max(bottomLeft.maxY, bottomRight.maxY) + 1;
  const width = right - x;
  const height = bottom - y;
  if (width < 240 || height < 180 || right > canvas.width || bottom > canvas.height) return null;
  const detectedAspectRatio = width / height;
  const viewportAspectRatio = window.innerWidth / Math.max(1, window.innerHeight);
  const rowTolerance = Math.max(4, expectedMarkerSize * 1.5);
  if (
    Math.abs(topLeft.minY - topRight.minY) > rowTolerance ||
    Math.abs(bottomLeft.maxY - bottomRight.maxY) > rowTolerance ||
    Math.abs(topLeft.minX - bottomLeft.minX) > rowTolerance ||
    Math.abs(topRight.maxX - bottomRight.maxX) > rowTolerance ||
    Math.abs(detectedAspectRatio - viewportAspectRatio) > 0.08
  ) {
    return null;
  }

  return {
    signature,
    sourceWidth: canvas.width,
    sourceHeight: canvas.height,
    x,
    y,
    width,
    height,
  };
}

async function captureFrameFromStream(
  stream: MediaStream,
  cachedCalibration: ViewportCalibration | null,
  maxW = 1600,
  maxH = 1000,
): Promise<CapturedViewportFrame | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;
  let calibrationOverlay: HTMLElement | null = null;
  const hiddenTarsOverlays: Array<{ element: HTMLElement; visibility: string }> = [];
  const video = document.createElement("video");
  try {
    // ImageCapture is unreliably supported; we use a hidden <video> + canvas
    // + MediaStreamTrackProcessor would be cleaner, but a video element is
    // the simplest portable path.
    video.srcObject = new MediaStream([track]);
    video.muted = true;
    video.playsInline = true;
    await video.play();
    const vw = video.videoWidth || window.innerWidth;
    const vh = video.videoHeight || window.innerHeight;
    const sourceScale = Math.min(1, 1920 / vw, 1200 / vh);
    const sourceWidth = Math.max(1, Math.round(vw * sourceScale));
    const sourceHeight = Math.max(1, Math.round(vh * sourceScale));
    const signature = captureSignature(track, video);
    const canReuseCalibration =
      cachedCalibration?.signature === signature &&
      cachedCalibration.sourceWidth === sourceWidth &&
      cachedCalibration.sourceHeight === sourceHeight;

    if (!canReuseCalibration) {
      document.querySelectorAll<HTMLElement>("[data-global-tars='true']").forEach((element) => {
        hiddenTarsOverlays.push({ element, visibility: element.style.visibility });
        element.style.visibility = "hidden";
      });
      calibrationOverlay = createCalibrationOverlay();
      const frameRate = track.getSettings().frameRate || 5;
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(650, Math.max(180, 1000 / frameRate + 80))));
    } else {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = sourceWidth;
    sourceCanvas.height = sourceHeight;
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) return null;
    sourceContext.drawImage(video, 0, 0, sourceWidth, sourceHeight);

    const detectedCalibration = canReuseCalibration
      ? cachedCalibration
      : detectViewportCalibration(
          sourceCanvas,
          signature,
          14 * window.devicePixelRatio * sourceScale,
        );
    const crop = detectedCalibration ?? {
      x: 0,
      y: 0,
      width: sourceWidth,
      height: sourceHeight,
    };
    const outputScale = Math.min(1, maxW / crop.width, maxH / crop.height);
    const outputWidth = Math.max(1, Math.round(crop.width * outputScale));
    const outputHeight = Math.max(1, Math.round(crop.height * outputScale));
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) return null;
    outputContext.drawImage(
      sourceCanvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      outputWidth,
      outputHeight,
    );
    const dataUrl = outputCanvas.toDataURL("image/jpeg", 0.84);
    const b64 = dataUrl.split(",")[1] || "";
    const displaySurface = track.getSettings().displaySurface;
    return {
      data: b64,
      mimeType: "image/jpeg",
      width: outputWidth,
      height: outputHeight,
      calibrated: Boolean(detectedCalibration) || displaySurface === "browser",
      calibration: detectedCalibration,
    };
  } catch (err) {
    console.warn(TARS_LOG, "captureFrame failed", err);
    return null;
  } finally {
    calibrationOverlay?.remove();
    for (const { element, visibility } of hiddenTarsOverlays) {
      element.style.visibility = visibility;
    }
    video.pause();
    video.srcObject = null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GlobalTarsAssistant() {
  const { user, getToken } = useAuth();
  const { enabled, setEnabled, extensionAvailable, status, setStatus, trainingOpen } = useTars();
  const { activeCourseId, activeLessonId } = useLearner();
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const isAdmin = pathname.startsWith("/admin");
  const isWhiteboardSession = isEmbeddedTarsRoute(pathname);
  const isTarsSuppressed = isWhiteboardSession || isAdmin;
  const globalTarsActive = enabled && !isTarsSuppressed && extensionAvailable === false;
  const showCursor = globalTarsActive;

  const [mounted, setMounted] = useState(false);
  const [bubble, setBubble] = useState("");
  const [mode, setMode] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [wakeTemplate, setWakeTemplate] = useState<WakeTemplate | null>(null);
  const [trainingStatus, setTrainingStatus] = useState("Train Tars with your pronunciation.");
  const [trainingPhraseIndex, setTrainingPhraseIndex] = useState(0);
  const [debugLine, setDebugLine] = useState("tars debug: idle");
  const [screenAnnotations, setScreenAnnotations] = useState<ScreenAnnotation[]>([]);
  const [boardDrawCommands, setBoardDrawCommands] = useState<TarsDrawCommand[]>([]);
  const [teachingProfileRevision, setTeachingProfileRevision] = useState(0);

  // Cursor RAF refs
  const cursorRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const bubbleAnchorRef = useRef<HTMLDivElement>(null);
  const cursorRotationRef = useRef(-35);
  const posRef = useRef({ x: 90, y: 90 });
  const mouseRef = useRef({ x: 90, y: 90 });
  const activePointRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  // Realtime refs
  const audioHook = useAudio();
  const wsHook = useWebSocket();
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenCapturePromiseRef = useRef<Promise<CapturedViewportFrame | null> | null>(null);
  // Last-sent screenshot dimensions, so we can scale the model's vision fallback
  // {x,y} back to the live viewport when no DOM targetId was matched.
  const lastScreenDimRef = useRef<{ width: number; height: number; calibrated: boolean } | null>(null);
  const viewportCalibrationRef = useRef<ViewportCalibration | null>(null);
  // Map of dom-N id → live HTMLElement captured at the most recent screen push.
  // Used to resolve `targetId` to a fresh rect for sub-pixel flyTo.
  const domIdToElementRef = useRef<Map<string, HTMLElement>>(new Map());
  // Session id reused across reconnects within a single tab session.
  const sessionIdRef = useRef<string>(loadTarsSessionId());

  useEffect(() => {
    const handleTeachingProfileChange = () => {
      setTeachingProfileRevision((revision) => revision + 1);
      setStatus("Teaching profile updated");
    };
    window.addEventListener(TEACHING_PROFILE_CHANGED_EVENT, handleTeachingProfileChange);
    return () => {
      window.removeEventListener(TEACHING_PROFILE_CHANGED_EVENT, handleTeachingProfileChange);
    };
  }, [setStatus]);

  const currentPageContext = useCallback(() => {
    const generatedMatch = pathname.match(/^\/learn\/(generated-[^/]+)(?:\/([^/]+))?/);
    const routeLesson = generatedMatch?.[2] && generatedMatch[2] !== "classroom"
      ? generatedMatch[2]
      : null;
    return {
      route: pathname,
      url: typeof window !== "undefined" ? window.location.href : pathname,
      title: typeof document !== "undefined" ? document.title : "Ctrl+Teach",
      courseId: generatedMatch?.[1] ?? activeCourseId,
      lessonId: routeLesson ?? activeLessonId,
    };
  }, [activeCourseId, activeLessonId, pathname]);

  // Push-to-talk gating (Ctrl held = unmute upstream mic)
  const ctrlHeldRef = useRef(false);
  const upstreamMutedRef = useRef(true); // start muted; Ctrl unmutes
  const speechTailUntilRef = useRef(0);
  const ambientNoiseRef = useRef({ rms: 0.004, flux: 0.0025, peak: 0.012 });
  const previousMicSampleRef = useRef(0);
  const speechStatsRef = useRef({
    startedAt: 0,
    chunks: 0,
    bytes: 0,
    peak: 0,
    rmsSum: 0,
    voicedSamples: 0,
    currentVoiceSamples: 0,
    maxContinuousVoiceSamples: 0,
    noiseRms: 0.004,
    noiseFlux: 0.0025,
    noisePeak: 0.012,
  });
  const replyAudioStatsRef = useRef({ chunks: 0, bytes: 0 });
  // Last tars_point id processed, to avoid double-handling the same event.
  const lastPointIdRef = useRef<string | null>(null);
  const processedDrawIdsRef = useRef<Set<string>>(new Set());
  const trainingRecordingRef = useRef(false);
  const trainingOpenRef = useRef(false);

  // ── Cursor positioning & flight ────────────────────────────────────────
  // Matches the real Tars macOS overlay (OverlayWindow.swift). The buddy:
  //   - sits +35px right / +25px below the real pointer (a "helper" buddy)
  //   - defaults to a -35° tilt (cursor-like arrow)
  //   - springs toward the mouse with a deliberately visible follow-through
  //   - flies to targets along a quadratic bezier, smoothstep easeInOut,
  //     duration = clamp(dist/800, 0.6s, 1.4s), arc height = min(dist*0.2, 80)
  const BUDDY_OFFSET_X = 35;
  const BUDDY_OFFSET_Y = 25;
  const BUDDY_DEFAULT_ROT = -35;
  // A slower response with stronger damping keeps a smooth visible trail while
  // avoiding excessive bounce around the real cursor.
  const SPRING_RESPONSE = 0.38;
  const SPRING_DAMPING = 0.68;
  // ω = 2π/response; k = ω²; c = 2·dampingFraction·√k (mass=1).
  const SPRING_K = (2 * Math.PI / SPRING_RESPONSE) ** 2;
  const SPRING_C = 2 * SPRING_DAMPING * Math.sqrt(SPRING_K);
  // Velocity carried across frames for the idle spring follower.
  const velRef = useRef({ x: 0, y: 0 });
  // Last timestamp for the spring RAF loop (dt in seconds).
  const lastSpringTsRef = useRef<number | null>(null);

  const setCursor = useCallback((x: number, y: number, rot: number, scale: number, opacity: number) => {
    const el = cursorRef.current;
    if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
    el?.style.setProperty("opacity", String(opacity));
    cursorRotationRef.current = rot;
    if (waveformRef.current) waveformRef.current.style.transform = `rotate(${-rot}deg)`;
    if (bubbleAnchorRef.current) bubbleAnchorRef.current.style.transform = `rotate(${-rot}deg)`;
    posRef.current = { x, y };
  }, []);

  const flyTo = useCallback((point: Point) => {
    activePointRef.current = true;
    const from = posRef.current;
    const to = { x: point.x, y: point.y };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    // Match real Tars: duration = clamp(dist/800, 0.6s, 1.4s)
    const duration = Math.min(Math.max(dist / 800, 0.6), 1.4) * 1000;
    const arc = Math.min(dist * 0.2, 80);
    const c = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc };
    const start = performance.now();
    const step = (now: number) => {
      const raw = Math.min((now - start) / duration, 1);
      // Smoothstep easeInOut: 3t² - 2t³ (Hermite) — matches real Tars
      const t = raw * raw * (3 - 2 * raw);
      const m = 1 - t;
      const x = m * m * from.x + 2 * m * t * c.x + t * t * to.x;
      const y = m * m * from.y + 2 * m * t * c.y + t * t * to.y;
      const tx = 2 * m * (c.x - from.x) + 2 * t * (to.x - c.x);
      const ty = 2 * m * (c.y - from.y) + 2 * t * (to.y - c.y);
      // sin pulse peaks at midpoint, +0.3 → 1.3x scale (matches real Tars)
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

  const clearScreenAnnotations = useCallback(() => {
    setScreenAnnotations([]);
  }, []);

  const addScreenAnnotation = useCallback((annotation: ScreenAnnotation) => {
    // Keep the visual explanation intact until Tars explicitly clears it or
    // the viewport moves and invalidates its coordinates.
    setScreenAnnotations((current) => [
      ...current.filter((item) => item.id !== annotation.id),
      annotation,
    ].slice(-32));
  }, []);

  useEffect(() => clearScreenAnnotations, [clearScreenAnnotations]);

  useEffect(() => {
    window.addEventListener("resize", clearScreenAnnotations);
    window.addEventListener("scroll", clearScreenAnnotations, true);
    return () => {
      window.removeEventListener("resize", clearScreenAnnotations);
      window.removeEventListener("scroll", clearScreenAnnotations, true);
    };
  }, [clearScreenAnnotations]);

  useEffect(() => {
    if (!isWhiteboardSession) {
      setBoardDrawCommands([]);
      return;
    }
    clearScreenAnnotations();
    const handleBoardDraw = (event: Event) => {
      const command = (event as CustomEvent<TarsDrawCommand>).detail;
      if (!command?.id) return;
      setBoardDrawCommands((current) => [...current.slice(-31), command]);
    };
    window.addEventListener(TARS_BOARD_DRAW_EVENT, handleBoardDraw);
    return () => {
      window.removeEventListener(TARS_BOARD_DRAW_EVENT, handleBoardDraw);
      clearScreenAnnotations();
    };
  }, [isWhiteboardSession, clearScreenAnnotations]);

  // ── Idle spring-follow loop ──────────────────────────────────────────────
  // Integrates a spring toward the last mouse position + offset at 60fps.
  useEffect(() => {
    if (!showCursor) return;
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);
    const raf = (ts: number) => {
      if (lastSpringTsRef.current == null) lastSpringTsRef.current = ts;
      const dtMs = Math.min(ts - lastSpringTsRef.current, 32);
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
      if (screenCapturePromiseRef.current) {
        await screenCapturePromiseRef.current;
      }
      const capturePromise = captureFrameFromStream(stream, viewportCalibrationRef.current);
      screenCapturePromiseRef.current = capturePromise;
      let frame: CapturedViewportFrame | null;
      try {
        frame = await capturePromise;
      } finally {
        if (screenCapturePromiseRef.current === capturePromise) {
          screenCapturePromiseRef.current = null;
        }
      }
      if (!frame) return;
      viewportCalibrationRef.current = frame.calibration;
      const { targets, elementsById } = collectDomTargets();
      domIdToElementRef.current = elementsById;
      lastScreenDimRef.current = {
        width: frame.width,
        height: frame.height,
        calibrated: frame.calibrated,
      };
      const screenshotScaleX = frame.width / Math.max(1, window.innerWidth);
      const screenshotScaleY = frame.height / Math.max(1, window.innerHeight);
      const slim = targets.map((t) => ({
        id: t.id,
        role: t.role,
        text: t.text,
        actionable: t.actionable,
        rect: {
          x: Math.round(t.rect.x * screenshotScaleX),
          y: Math.round(t.rect.y * screenshotScaleY),
          width: Math.max(1, Math.round(t.rect.width * screenshotScaleX)),
          height: Math.max(1, Math.round(t.rect.height * screenshotScaleY)),
        },
      }));
      wsHook.sendTarsScreen(frame.data, frame.mimeType, {
        width: frame.width,
        height: frame.height,
        elements: slim,
        intentText: intentText,
        calibrated: frame.calibrated,
        page: currentPageContext(),
      });
      console.info(TARS_LOG, "screen context pushed", {
        width: frame.width,
        height: frame.height,
        targets: targets.length,
        intent: !!intentText,
        calibrated: frame.calibrated,
      });
    },
    [currentPageContext, wsHook.sendTarsScreen],
  );

  // Keep one long-lived companion session while its verified page mode changes.
  // This updates route/course grounding without reconnecting or starting a turn.
  useEffect(() => {
    if (!globalTarsActive || !wsHook.realtimeReady) return;
    wsHook.sendCompanionContext(currentPageContext());
  }, [currentPageContext, globalTarsActive, wsHook.realtimeReady, wsHook.sendCompanionContext]);

  // ── Screen-share lifecycle: persisted across page navigations ────────────
  // The getDisplayMedia capture lives until Tars is disabled or the user logs
  // out — navigating between pages (including onto tutor pages where Tars
  // voice is paused) MUST NOT tear it down. Only the WS connection toggles,
  // so switching pages doesn't re-prompt for tab share.
  useEffect(() => {
    if (!enabled || !user) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      viewportCalibrationRef.current = null;
      return;
    }
    // The board tutor owns the active session. Preserve an existing capture so
    // leaving the board does not prompt again, but never start one on /board.
    if (isTarsSuppressed) return;
    let cancelled = false;
    if (screenStreamRef.current) return; // already capturing — reuse across navigations
    void (async () => {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "browser", frameRate: 5 } as MediaTrackConstraints,
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
        console.warn(TARS_LOG, "getDisplayMedia failed", err);
        if (!cancelled) {
          setStatus("Tab share needed for Tars vision");
          setEnabled(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      // Only stop the capture stream when Tars is fully disabled or user
      // logged out — handled in the early-return branch above.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user, isTarsSuppressed]);

  // ── Realtime WS connection ───────────────────────────────────────────────
  // The board owns a single tutor Realtime session. Global Tars disconnects
  // there to prevent duplicate microphones, replies, and audio playback.
  useEffect(() => {
    if (!globalTarsActive || !user || trainingOpen) {
      if (wsHook.status !== "disconnected") wsHook.disconnect();
      if (audioHook.isRecording) audioHook.stopRecording();
      audioHook.clearPlayback();
      ctrlHeldRef.current = false;
      upstreamMutedRef.current = true;
      setMode("idle");
      if (enabled && isWhiteboardSession) {
        setStatus("Tars is controlled by the whiteboard tutor");
      } else if (enabled && !user) {
        setStatus("Sign in to use Tars");
      } else if (enabled && trainingOpen) {
        setStatus("Tars training mode");
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (cancelled) return;
      const url = `${WS_URL}/ws/${user.uid}/${sessionIdRef.current}?mode=page`;
      await audioHook.initPlayer();
      if (cancelled) return;
      wsHook.connect(url, {
        authToken: token ?? undefined,
        onAudio: (pcm) => {
          // The first response audio chunk is the authoritative transition out
          // of the thinking spinner and back to the normal Tars pointer.
          setMode("speaking");
          audioHook.playAudioChunk(pcm);
          replyAudioStatsRef.current.chunks += 1;
          replyAudioStatsRef.current.bytes += pcm.byteLength;
          setDebugLine(
            `reply audio chunks=${replyAudioStatsRef.current.chunks} bytes=${replyAudioStatsRef.current.bytes} player=${audioHook.getPlaybackState()}`,
          );
        },
        onInterrupt: () => audioHook.clearPlayback(),
        onError: (message) => setStatus(`Tars unavailable — ${message}`),
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
  }, [globalTarsActive, enabled, isWhiteboardSession, user, trainingOpen, teachingProfileRevision]);

  // ── When the server-side Realtime session is ready, start mic capture & push
  //    initial screen context. The browser WS can open before OpenAI Realtime is
  //    entered server-side; waiting for `realtime_ready` prevents dropped mic
  //    chunks / "send_audio failed: Not connected".
  useEffect(() => {
    if (!globalTarsActive || !user || trainingOpen) return;
    if (wsHook.status !== "connected") return;
    if (!wsHook.realtimeReady) return;
    if (audioHook.isRecording) return;
    audioHook.startRecording((pcm) => {
      const samples = new Int16Array(pcm);
      let sumSquares = 0;
      let differenceSquares = 0;
      let peak = 0;
      let previous = previousMicSampleRef.current;
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sumSquares += sample * sample;
        const difference = sample - previous;
        differenceSquares += difference * difference;
        previous = sample;
      }
      previousMicSampleRef.current = previous;
      const rms = samples.length ? Math.sqrt(sumSquares / samples.length) / 32768 : 0;
      const flux = samples.length ? Math.sqrt(differenceSquares / samples.length) / 32768 : 0;
      const normalizedPeak = peak / 32768;

      if (!upstreamMutedRef.current) {
        const stats = speechStatsRef.current;
        const speechLike = rms >= Math.max(0.007, stats.noiseRms * 1.85)
          && flux >= Math.max(0.0035, stats.noiseFlux * 1.65)
          && normalizedPeak >= Math.max(0.022, stats.noisePeak * 1.5);
        stats.chunks += 1;
        stats.bytes += pcm.byteLength;
        stats.peak = Math.max(stats.peak, normalizedPeak);
        stats.rmsSum += rms;
        if (speechLike) {
          stats.voicedSamples += samples.length;
          stats.currentVoiceSamples += samples.length;
          stats.maxContinuousVoiceSamples = Math.max(stats.maxContinuousVoiceSamples, stats.currentVoiceSamples);
        } else {
          stats.currentVoiceSamples = 0;
        }
        wsHook.sendAudio(pcm);
        return;
      }

      const ambient = ambientNoiseRef.current;
      const smooth = (current: number, next: number) => current + (next - current) * (next < current ? 0.08 : 0.012);
      ambient.rms = smooth(ambient.rms, Math.min(rms, 0.08));
      ambient.flux = smooth(ambient.flux, Math.min(flux, 0.08));
      ambient.peak = smooth(ambient.peak, Math.min(normalizedPeak, 0.2));
      // Preserve a short silence tail so the manually committed buffer does
      // not end on a clipped phoneme. After the tail we go fully quiet.
      if (performance.now() < speechTailUntilRef.current) {
        wsHook.sendAudio(new ArrayBuffer(pcm.byteLength));
      }
    });
    setStatus("Tars ready — hold Ctrl to talk");
    setMode("idle");
    // Initial screen context so the model isn't blind at start. Subsequent
    // context is pushed after Ctrl release so it follows the user's spoken turn.
    void pushScreenContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsHook.status, wsHook.realtimeReady, globalTarsActive, user, trainingOpen]);

  // ── Push-to-talk gating: Ctrl held = unmute upstream mic ────────────────────
  useEffect(() => {
    if (!globalTarsActive || !user || trainingOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Control" || event.metaKey || event.altKey) return;
      if (ctrlHeldRef.current) return;
      // This runs inside a real user gesture, which is required to unlock a
      // suspended AudioContext under Chrome/Safari autoplay policies.
      void audioHook.initPlayer();
      audioHook.resumeContexts();
      clearScreenAnnotations();
      replyAudioStatsRef.current = { chunks: 0, bytes: 0 };
      ctrlHeldRef.current = true;
      speechTailUntilRef.current = 0;
      speechStatsRef.current = {
        startedAt: performance.now(),
        chunks: 0,
        bytes: 0,
        peak: 0,
        rmsSum: 0,
        voicedSamples: 0,
        currentVoiceSamples: 0,
        maxContinuousVoiceSamples: 0,
        noiseRms: ambientNoiseRef.current.rms,
        noiseFlux: ambientNoiseRef.current.flux,
        noisePeak: ambientNoiseRef.current.peak,
      };
      upstreamMutedRef.current = false;
      setMode("listening");
      setStatus("Tars listening — release Ctrl when done");
      // Capture waits until key-up so it reflects the screen the user spoke
      // about and can be inserted immediately before the audio turn commits.
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Control") return;
      ctrlHeldRef.current = false;
      speechTailUntilRef.current = performance.now() + TARS_SPEECH_TAIL_MS;
      upstreamMutedRef.current = true;
      const stats = speechStatsRef.current;
      const avgRms = stats.chunks ? stats.rmsSum / stats.chunks : 0;
      const voicedMs = (stats.voicedSamples / 16_000) * 1000;
      const continuousVoiceMs = (stats.maxContinuousVoiceSamples / 16_000) * 1000;
      const hasSpeech = voicedMs >= 72 && continuousVoiceMs >= 32;
      const statsLine = `mic ${Math.round(performance.now() - stats.startedAt)}ms chunks=${stats.chunks} peak=${stats.peak.toFixed(3)} rms=${avgRms.toFixed(3)} voiced=${Math.round(voicedMs)}ms continuous=${Math.round(continuousVoiceMs)}ms`;
      console.info(TARS_LOG, "mic turn captured", {
        durationMs: Math.round(performance.now() - stats.startedAt),
        chunks: stats.chunks,
        bytes: stats.bytes,
        peak: Number(stats.peak.toFixed(4)),
        avgRms: Number(avgRms.toFixed(4)),
      });
      setDebugLine(statsLine);
      if (!hasSpeech) {
        speechTailUntilRef.current = 0;
        wsHook.sendTarsCancelAudio();
        setMode("idle");
        setStatus("Tars ready — hold Ctrl to talk");
        return;
      }
      setMode("thinking");
      setStatus("Tars thinking");
      // Wait for the trailing silence, then insert visual context and commit.
      window.setTimeout(async () => {
        if (ctrlHeldRef.current) return;
        // Insert the latest visual context before committing audio. The server
        // adds this as context without starting a separate response, so the
        // one response.create below sees both the speech and current screen.
        await pushScreenContext("user just spoke");
        if (ctrlHeldRef.current) return;
        wsHook.sendTarsCommitAudio();
        setDebugLine(`${statsLine} · committed`);
      }, TARS_SPEECH_TAIL_MS);
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
    globalTarsActive,
    user,
    trainingOpen,
    pushScreenContext,
    audioHook.initPlayer,
    audioHook.resumeContexts,
    clearScreenAnnotations,
    wsHook.sendTarsCommitAudio,
    wsHook.sendTarsCancelAudio,
  ]);

  // ── Handle incoming Tars `point_at` envelope ─────────────────────────────
  useEffect(() => {
    const pending = wsHook.tarsPointPending;
    if (!pending || pending.status !== "started") return;
    setMode("thinking");
    setStatus(`Tars locating ${pending.label}`);
  }, [wsHook.tarsPointPending, setStatus]);

  useEffect(() => {
    if (!wsHook.tarsAgentPoint) return;
    const pt = wsHook.tarsAgentPoint;
    if (pt.id === lastPointIdRef.current) return;
    lastPointIdRef.current = pt.id;
    console.info(TARS_LOG, "point_at received", pt);

    // Cascade: DOM-exact first, vision fallback second.
    if (pt.targetId) {
      const el = domIdToElementRef.current.get(pt.targetId);
      if (el?.isConnected) {
        const point = pointForElement(el, pt.label);
        flyTo({
          ...point,
          label: pt.label,
        });
        if (pt.action === "click") {
          window.setTimeout(() => {
            if (clickDomElement(el)) console.info(TARS_LOG, "clicked", pt.targetId);
          }, 750);
        }
        return;
      }
      // Element no longer in DOM — fall through to vision if possible.
      console.warn(TARS_LOG, "targetId not found in DOM map", pt.targetId);
    }

    // A React rerender can replace an element between capture and response.
    // Recover by matching the model's short label against the current targets.
    const labelMatchedElement = findDomTargetByLabel(pt.label, domIdToElementRef.current);
    if (labelMatchedElement) {
      flyTo({ ...pointForElement(labelMatchedElement, pt.label), label: pt.label });
      if (pt.action === "click") {
        window.setTimeout(() => clickDomElement(labelMatchedElement), 750);
      }
      return;
    }

    if (
      typeof pt.x === "number" &&
      typeof pt.y === "number" &&
      lastScreenDimRef.current?.calibrated
    ) {
      const { width: imgW, height: imgH } = lastScreenDimRef.current;
      const x = (pt.x / imgW) * window.innerWidth;
      const y = (pt.y / imgH) * window.innerHeight;
      const snappedElement = findClosestDomTarget(x, y, domIdToElementRef.current);
      if (snappedElement) {
        flyTo({ ...pointForElement(snappedElement, pt.label), label: pt.label });
        if (pt.action === "click") {
          window.setTimeout(() => clickDomElement(snappedElement), 750);
        }
      } else {
        flyTo({ x, y, label: pt.label });
      }
      return;
    }

    // Never apply a raw vision coordinate from an uncalibrated full-screen
    // capture; a confidently wrong pointer is worse than not pointing.
  }, [wsHook.tarsAgentPoint, flyTo]);

  // ── Handle Tars screen-drawing tools ───────────────────────────────────
  useEffect(() => {
    const processDraw = (draw: TarsDrawCommand) => {
      if (draw.tool === "clear_screen_drawings") {
        clearScreenAnnotations();
        return;
      }

      if (draw.coordinateSource === "sol_missing") {
        setStatus(`Sol missed ${draw.label || "a target"}; annotation skipped`);
      }

      if (draw.remove === true) {
        const annotationId = draw.annotationId;
        if (annotationId) {
          setScreenAnnotations((current) => current.filter((item) => item.id !== annotationId));
        }
        return;
      }

      const shape = draw.shape ?? "rectangle";
      const color = draw.color ?? "blue";
      const style = draw.style ?? "solid";
      const elementRect = (targetId?: string | null) => {
        const element = targetId ? domIdToElementRef.current.get(targetId) : null;
        return element?.isConnected ? element.getBoundingClientRect() : null;
      };
      const screenshotPoint = (x?: number | null, y?: number | null) => {
        if (draw.coordinateSpace === "viewport") {
          return typeof x === "number" && typeof y === "number" ? { x, y } : null;
        }
        const dimensions = lastScreenDimRef.current;
        if (typeof x !== "number" || typeof y !== "number" || !dimensions?.calibrated) return null;
        return {
          x: (x / dimensions.width) * window.innerWidth,
          y: (y / dimensions.height) * window.innerHeight,
        };
      };

      let x1: number;
      let y1: number;
      let x2: number;
      let y2: number;
      const targetRect = elementRect(draw.targetId);
      const fromRect = elementRect(draw.fromTargetId);
      const toRect = elementRect(draw.toTargetId);

      if (shape === "text") {
        const anchor = targetRect
          ? { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 }
          : screenshotPoint(draw.x, draw.y);
        if (!anchor || !draw.label) return;
        x1 = anchor.x;
        y1 = anchor.y;
        x2 = anchor.x;
        y2 = anchor.y;
      } else if ((shape === "arrow" || shape === "line") && (fromRect || toRect)) {
        const start = fromRect
          ? { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 }
          : posRef.current;
        const endRect = toRect ?? targetRect;
        if (!endRect) return;
        const end = { x: endRect.left + endRect.width / 2, y: endRect.top + endRect.height / 2 };
        ({ x: x1, y: y1 } = start);
        ({ x: x2, y: y2 } = end);
      } else if (targetRect) {
        const padding = shape === "triangle" ? 0 : shape === "highlight" ? 3 : 8;
        x1 = targetRect.left - padding;
        y1 = targetRect.top - padding;
        x2 = targetRect.right + padding;
        y2 = targetRect.bottom + padding;
        if (shape === "underline") {
          y1 = targetRect.bottom + 5;
          y2 = y1;
        } else if (shape === "arrow" || shape === "line") {
          x1 = posRef.current.x;
          y1 = posRef.current.y;
          x2 = targetRect.left + targetRect.width / 2;
          y2 = targetRect.top + targetRect.height / 2;
        }
      } else {
        const start = screenshotPoint(draw.x, draw.y);
        const end = screenshotPoint(draw.endX, draw.endY);
        if (!start) return;
        if (end) {
          ({ x: x1, y: y1 } = start);
          ({ x: x2, y: y2 } = end);
        } else {
          x1 = start.x - 34;
          y1 = start.y - 34;
          x2 = start.x + 34;
          y2 = start.y + 34;
          if (shape === "underline") {
            y1 = start.y;
            y2 = start.y;
          }
        }
      }

      addScreenAnnotation({
        id: draw.annotationId ?? draw.id,
        shape,
        style,
        color,
        label: draw.label ?? "",
        x1,
        y1,
        x2,
        y2,
        provisional: draw.provisional,
      });
    };

    const pendingDraws = [...wsHook.tarsAgentDraws, ...boardDrawCommands];
    for (const draw of pendingDraws) {
      if (processedDrawIdsRef.current.has(draw.id)) continue;
      processedDrawIdsRef.current.add(draw.id);
      processDraw(draw);
    }
    if (processedDrawIdsRef.current.size > 128) {
      processedDrawIdsRef.current = new Set(pendingDraws.map((draw) => draw.id));
    }
  }, [wsHook.tarsAgentDraws, boardDrawCommands, addScreenAnnotation, clearScreenAnnotations]);

  // ── Mode transitions from WS events ───────────────────────────────────────
  useEffect(() => {
    if (!globalTarsActive || !user) return;
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
  }, [wsHook.messages, globalTarsActive, user]);

  useEffect(() => {
    if (!globalTarsActive || !user) return;
    // When upstream mic is unmuted (Ctrl held), we're listening.
    if (!ctrlHeldRef.current && wsHook.status === "connected") {
      setMode("idle");
    }
  }, [wsHook.status, globalTarsActive, user]);

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
    setTrainingStatus("Train Tars with your pronunciation.");
  }, []);

  // ── Mount gate (Next hydration) ────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!user || isLanding || isAdmin) return null;

  const renderCursor = showCursor;

  return (
    <div data-global-tars="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000 }}>
      {screenAnnotations.length > 0 && (
        <svg
          aria-hidden="true"
          style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", overflow: "visible" }}
        >
          <defs>
            {(Object.keys(ANNOTATION_COLORS) as ScreenAnnotation["color"][]).map((color) => (
              <marker
                key={color}
                id={`tars-arrow-${color}`}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={ANNOTATION_COLORS[color]} />
              </marker>
            ))}
          </defs>
          {screenAnnotations.map((annotation) => {
            const stroke = ANNOTATION_COLORS[annotation.color];
            const left = Math.min(annotation.x1, annotation.x2);
            const top = Math.min(annotation.y1, annotation.y2);
            const width = Math.max(2, Math.abs(annotation.x2 - annotation.x1));
            const height = Math.max(2, Math.abs(annotation.y2 - annotation.y1));
            const strokeDasharray = annotation.style === "dashed"
              ? "8 6"
              : annotation.style === "dotted"
                ? "2 5"
                : undefined;
            const commonStroke = {
              fill: "none",
              stroke,
              strokeWidth: 4,
              strokeLinecap: "round" as const,
              strokeLinejoin: "round" as const,
              vectorEffect: "non-scaling-stroke" as const,
              ...(strokeDasharray
                ? { strokeDasharray }
                : { pathLength: 1, className: "tars-annotation-stroke" }),
              style: { filter: `drop-shadow(0 2px 4px ${stroke}55)` },
            };
            return (
              <g key={annotation.id} opacity={annotation.provisional ? 0.42 : 1}>
                {annotation.shape === "circle" && (
                  <ellipse
                    {...commonStroke}
                    cx={left + width / 2}
                    cy={top + height / 2}
                    rx={width / 2}
                    ry={height / 2}
                  />
                )}
                {annotation.shape === "rectangle" && (
                  <rect {...commonStroke} x={left} y={top} width={width} height={height} rx={9} />
                )}
                {annotation.shape === "triangle" && (
                  <polygon
                    {...commonStroke}
                    points={`${left + width / 2},${top} ${left + width},${top + height} ${left},${top + height}`}
                  />
                )}
                {annotation.shape === "highlight" && (
                  <rect
                    x={left}
                    y={top}
                    width={width}
                    height={height}
                    rx={8}
                    fill={stroke}
                    stroke={stroke}
                    strokeWidth={2}
                    className="tars-annotation-highlight"
                  />
                )}
                {(annotation.shape === "underline" || annotation.shape === "line" || annotation.shape === "arrow") && (
                  <line
                    {...commonStroke}
                    x1={annotation.x1}
                    y1={annotation.y1}
                    x2={annotation.x2}
                    y2={annotation.y2}
                    markerEnd={annotation.shape === "arrow" ? `url(#tars-arrow-${annotation.color})` : undefined}
                  />
                )}
                {annotation.shape === "text" && !!annotation.label && (
                  <text
                    x={annotation.x1}
                    y={annotation.y1}
                    fill={stroke}
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={4}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    dominantBaseline="hanging"
                    fontSize={13}
                    fontWeight={600}
                    className="tars-annotation-label"
                  >
                    {annotation.label.slice(0, 200)}
                  </text>
                )}
                {annotation.shape !== "text" && !!annotation.label && (
                  <text
                    x={annotation.x2 + 8}
                    y={annotation.y2 - 8}
                    fill={stroke}
                    stroke="white"
                    strokeWidth={4}
                    paintOrder="stroke"
                    fontSize={13}
                    fontWeight={800}
                    className="tars-annotation-label"
                  >
                    {annotation.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {renderCursor && (
        <div
          ref={cursorRef}
          style={{ position: "fixed", left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: "transform, opacity" }}
        >
          <div style={{ position: "absolute", left: 0, top: 0, opacity: mode === "idle" || mode === "speaking" ? 1 : 0, transition: "opacity 0.13s ease" }}>
            <div style={{ position: "absolute", left: -8, top: 0, width: 16, height: 13.856, background: "#79a925", clipPath: "polygon(50% 0, 100% 100%, 0 100%)", filter: "drop-shadow(0 0 7px rgba(121,169,37,0.42))" }} />
          </div>
          <div ref={waveformRef} style={{ position: "absolute", left: -7, top: -6, height: 18, display: "flex", alignItems: "center", gap: 1, opacity: mode === "listening" ? 1 : 0, transformOrigin: "7px 6px", transition: "opacity 0.16s ease", filter: "drop-shadow(0 0 5px rgba(20,184,166,0.6))" }}>
            {[0.25, 0.55, 1, 0.55, 0.25].map((profile, i) => (
              <span key={i} style={{ width: 2, height: 4 + profile * 9, borderRadius: 2, background: "#14b8a6", animation: `tars-wave 0.78s ease-in-out ${i * 0.09}s infinite alternate` }} />
            ))}
          </div>
          <div style={{ position: "absolute", left: -8, top: -8, width: 12, height: 12, borderRadius: 999, border: "2px solid rgba(121,169,37,0.14)", borderTopColor: "#79a925", borderRightColor: "rgba(121,169,37,0.72)", opacity: mode === "thinking" ? 1 : 0, transition: "opacity 0.16s ease", animation: "tars-spin 0.9s linear infinite", filter: "drop-shadow(0 0 5px rgba(121,169,37,0.42))" }} />
          {SHOW_TARS_BUBBLE && !!bubble && (
            <div
              ref={bubbleAnchorRef}
              style={{ position: "absolute", left: 18, top: -8, transform: `rotate(${-cursorRotationRef.current}deg)`, transformOrigin: "0 0" }}
            >
              <div style={{ maxWidth: 280, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.96)", border: "1px solid rgba(0,0,0,0.12)", color: "#1f2937", fontSize: 13, fontStyle: "normal", letterSpacing: 0, lineHeight: 1.35, textAlign: "left", pointerEvents: "none" }}>
                {bubble}
              </div>
            </div>
          )}
        </div>
      )}
      {!isLanding && !isWhiteboardSession && user && trainingOpen && (
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
            <button type="button" onClick={recordWakeSample} style={{ flex: 1, border: "none", background: "#b7ec52", color: "#26320f", borderRadius: 6, padding: "9px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
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
      {globalTarsActive && user && (
        <div style={{ pointerEvents: "none", position: "fixed", left: 14, bottom: 14, maxWidth: "min(560px, calc(100vw - 28px))", padding: "7px 9px", borderRadius: 10, background: "rgba(15,23,42,0.82)", color: "#dbeafe", fontSize: 11, lineHeight: 1.35, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", boxShadow: "0 8px 24px rgba(15,23,42,0.18)", zIndex: 2147483001 }}>
          {debugLine}
        </div>
      )}
      <style jsx global>{`
        @keyframes tars-wave { from { transform: scaleY(0.65); opacity: 0.7; } to { transform: scaleY(1.22); opacity: 1; } }
        @keyframes tars-spin { to { transform: rotate(360deg); } }
        @keyframes tars-draw-stroke { from { stroke-dashoffset: 1; opacity: 0.35; } to { stroke-dashoffset: 0; opacity: 1; } }
        @keyframes tars-draw-highlight { from { opacity: 0; } to { opacity: 0.2; } }
        @keyframes tars-draw-label { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .tars-annotation-stroke { stroke-dasharray: 1; stroke-dashoffset: 1; animation: tars-draw-stroke 0.6s cubic-bezier(.22,.8,.24,1) forwards; }
        .tars-annotation-highlight { opacity: 0; animation: tars-draw-highlight 0.35s ease-out forwards; }
        .tars-annotation-label { animation: tars-draw-label 0.3s ease-out 0.35s both; }
      `}</style>
    </div>
  );
}
