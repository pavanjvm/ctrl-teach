"use client";

/**
 * WhiteboardCanvas — wraps Excalidraw with canvas-command handling.
 *
 * Receives canvas commands as a prop and applies them to Excalidraw.
 * Uses `convertToExcalidrawElements` (official Excalidraw utility) to
 * create properly-formed elements from minimal AI-generated skeletons.
 * Also exposes getSnapshot via ref for canvas export.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import "@excalidraw/excalidraw/index.css";
import html2canvas from "html2canvas";
import type { CanvasCommand, AnimationGroup } from "@/hooks/useWebSocket";
import {
  compileStructuredDiagrams,
  isStructuredDiagramElement,
} from "@/lib/diagramLayout";
import { layoutClassroomViewportText } from "@/lib/classroomTextLayout";

// Corner radius applied to AI-generated images (px)
const IMAGE_CORNER_RADIUS = 20;

// ── Tars cursor (bezier-arc coach pointer) ─────────────────────────────────
// Tars is the platform's virtual assistant. On the whiteboard it follows the
// tutor's pen as it draws — flying a quadratic-bezier arc to each freshly
// started element, then tracking the live "draw tip" (line tip / text cursor /
// element center) frame-by-frame so it always points at what is being drawn.

const TARS_COLOR = "#79a925";
const TARS_GLOW = "rgba(99,102,241,0.55)";

function bezierPoint(t: number, p0: number, p1: number, p2: number) {
  const m = 1 - t;
  return m * m * p0 + 2 * m * t * p1 + t * t * p2;
}

/**
 * Fly Tars's cursor along a quadratic-bezier arc from `from` to `to` over
 * `dur` ms. Smoothstep easing, tangent rotation, midpoint scale pulse — ported
 * from LabCoach's flight() (originally Tars's animateBezierFlightArc).
 */
function tarsFlight(
  from: { x: number; y: number },
  to: { x: number; y: number },
  onFrame: (p: { x: number; y: number; rot: number; scale: number }) => void,
  onDone: () => void
) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const total = Math.min(Math.max(dist / 800, 0.45), 1.0) * 1000; // ms
  const arc = Math.min(dist * 0.18, 70);
  const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc };
  const start = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const tRaw = Math.min((now - start) / total, 1);
    const t = tRaw * tRaw * (3 - 2 * tRaw); // smoothstep
    const x = bezierPoint(t, from.x, control.x, to.x);
    const y = bezierPoint(t, from.y, control.y, to.y);
    const tx = 2 * (1 - t) * (control.x - from.x) + 2 * t * (to.x - control.x);
    const ty = 2 * (1 - t) * (control.y - from.y) + 2 * t * (to.y - control.y);
    const rot = (Math.atan2(ty, tx) * 180) / Math.PI + 90;
    const scale = 1 + Math.sin(tRaw * Math.PI) * 0.3;
    onFrame({ x, y, rot, scale });
    if (tRaw < 1) {
      raf = requestAnimationFrame(step);
    } else {
      onDone();
    }
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * Draw the image onto an offscreen canvas with rounded-rect clipping,
 * returning a new data URL with smooth corners baked into the pixels.
 */
async function roundImageCorners(dataURL: string, radius = IMAGE_CORNER_RADIUS): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;

      // Clip to a rounded rectangle
      ctx.beginPath();
      ctx.roundRect(0, 0, img.width, img.height, radius);
      ctx.clip();

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataURL); // fallback: return original
    img.src = dataURL;
  });
}

function normalizePoints(points: unknown): number[][] {
  if (!Array.isArray(points)) return [];
  return points
    .map((p) => {
      if (Array.isArray(p) && p.length >= 2) {
        const x = Number(p[0]);
        const y = Number(p[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      if (p && typeof p === "object") {
        const obj = p as { x?: unknown; y?: unknown };
        const x = Number(obj.x);
        const y = Number(obj.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      }
      return null;
    })
    .filter((p): p is number[] => Boolean(p));
}

export interface WhiteboardCanvasRef {
  getSnapshot: () => Promise<string | null>;
  getViewportSnapshot: () => Promise<{
    base64: string;
    imageWidth: number;
    imageHeight: number;
    viewWidth: number;
    viewHeight: number;
    generatedImageBounds: GeneratedImageViewportBounds | null;
  } | null>;
  getGeneratedImageViewportBounds: () => GeneratedImageViewportBounds | null;
  getViewportRect: () => { left: number; top: number; width: number; height: number } | null;
  getSceneElements: () => any[];
}

export interface GeneratedImageViewportBounds {
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WhiteboardCanvasProps {
  canvasCommands: CanvasCommand[];
  onCanvasChange?: () => void;
  /** Releases Realtime audio waiting for this rendered board/Tars action. */
  onVisualSettled?: (syncId: string) => void;
  isGeneratingImage?: boolean;
  isSavingProgress?: boolean;
  /** Whether Tars's cursor should be visible (default true once mounted). */
  tarsActive?: boolean;
  /** Optional external point target from Tars-style [POINT:x,y:label] tags. */
  tarsPointTarget?: { x: number; y: number; label?: string; id: string } | null;
}

const WhiteboardCanvas = forwardRef<WhiteboardCanvasRef, WhiteboardCanvasProps>(
  ({ canvasCommands, onCanvasChange, onVisualSettled, isGeneratingImage = false, isSavingProgress = false, tarsActive = true, tarsPointTarget = null }, ref) => {
    const [ready, setReady] = useState(false);
    const apiRef = useRef<any>(null);
    const [ExcalidrawComp, setExcalidrawComp] = useState<any>(null);
    const convertRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const lastAppliedRef = useRef(0);

    // ── Tars cursor refs ──────────────────────────────────────────────────
    // All updated imperatively inside the animation tick so we never trigger a
    // React re-render per frame.
    const appStateRef = useRef<any>(null); // { scrollX, scrollY, zoom:{value} }
    const tarsElRef = useRef<HTMLDivElement>(null); // overlay triangle
    const tarsBubbleAnchorRef = useRef<HTMLDivElement>(null);
    const tarsRotationRef = useRef(-35);
    const tarsCancelRef = useRef<(() => void) | null>(null); // active flight cancel fn
    const tarsCurPos = useRef<{ x: number; y: number } | null>(null); // last cursor pos (container px)
    const tarsFocusId = useRef<string | null>(null); // element id we're currently attached to
    const tarsIdleRaf = useRef<number>(0); // idle-bob rAF id
    const tarsIdleStart = useRef<number>(0); // idle bob t0
    const tarsMousePos = useRef<{ x: number; y: number } | null>(null); // local mouse position
    const tarsMouseInside = useRef<boolean>(false); // only follow inside whiteboard
    const tarsDrawing = useRef<boolean>(false); // currently tracking a live tip
    const tarsPointTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // hold timer for external pointing
    const tarsExternalPointing = useRef<boolean>(false); // true while honoring a model [POINT]
    const tarsSpringVelocity = useRef({ x: 0, y: 0 });
    const tarsSpringTimestamp = useRef<number | null>(null);
    const [tarsBubbleText, setTarsBubbleText] = useState("");
    const animFrameRef = useRef<number>(0);
    const animTracksRef = useRef<AnimTrack[]>([]);
    const animFrameCountRef = useRef<number>(0);

    const setTarsTransform = useCallback((x: number, y: number, rot: number, scale: number, opacity = 1) => {
      const el = tarsElRef.current;
      if (!el) return;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;
      el.style.opacity = String(opacity);
      tarsRotationRef.current = rot;
      const bubbleAnchor = tarsBubbleAnchorRef.current;
      if (bubbleAnchor) {
        const opensLeft = x > (containerRef.current?.clientWidth ?? 0) - 260;
        bubbleAnchor.style.left = opensLeft ? "-16px" : "16px";
        bubbleAnchor.style.transform = `${opensLeft ? "translateX(-100%) " : ""}rotate(${-rot}deg)`;
        bubbleAnchor.style.transformOrigin = opensLeft ? "100% 0" : "0 0";
      }
    }, []);

    // ── Tars idle follow — real Tars-style cursor trailing ──────────────
    // When Tars is not drawing or pointing, it trails the user's cursor inside
    // the whiteboard with a small lag. It does not follow outside the board.
    useEffect(() => {
      if (!tarsActive) {
        // Hide + stop idle when deactivated.
        if (tarsIdleRaf.current) cancelAnimationFrame(tarsIdleRaf.current);
        tarsIdleRaf.current = 0;
        if (tarsCancelRef.current) tarsCancelRef.current();
        tarsCancelRef.current = null;
        tarsDrawing.current = false;
        tarsFocusId.current = null;
        tarsCurPos.current = null;
        tarsSpringVelocity.current = { x: 0, y: 0 };
        tarsSpringTimestamp.current = null;
        const el = tarsElRef.current;
        if (el) el.style.opacity = "0";
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      const updateMouse = (event: PointerEvent) => {
        const r = container.getBoundingClientRect();
        tarsMouseInside.current = true;
        tarsMousePos.current = {
          x: event.clientX - r.left,
          y: event.clientY - r.top,
        };
      };
      const leaveMouse = () => {
        tarsMouseInside.current = false;
      };
      container.addEventListener("pointermove", updateMouse);
      container.addEventListener("pointerenter", updateMouse);
      container.addEventListener("pointerleave", leaveMouse);

      const tickIdle = (now: number) => {
        // Pause the bob while we're actively drawing (flying/tracking).
        if (tarsDrawing.current || tarsCancelRef.current || tarsExternalPointing.current) {
          tarsIdleStart.current = now; // hold phase; resume smoothly later
          tarsSpringTimestamp.current = now;
          tarsSpringVelocity.current = { x: 0, y: 0 };
          tarsIdleRaf.current = requestAnimationFrame(tickIdle);
          return;
        }
        if (!tarsIdleStart.current) tarsIdleStart.current = now;
        const target = tarsMousePos.current;
        const current = tarsCurPos.current;

        // If the user has not moved inside the board yet, seed near center
        // instead of pinning Tars to a corner.
        const r = container.getBoundingClientRect();
        const seededTarget = target ?? { x: r.width / 2, y: r.height / 2 };
        const desired = {
          x: seededTarget.x + 35,
          y: seededTarget.y + 25,
        };
        const from = current ?? desired;
        if (!current) tarsSpringVelocity.current = { x: 0, y: 0 };
        if (tarsSpringTimestamp.current == null) tarsSpringTimestamp.current = now;
        const dt = Math.min(32, now - tarsSpringTimestamp.current) / 1000;
        tarsSpringTimestamp.current = now;
        const response = 0.38;
        const damping = tarsMouseInside.current ? 0.68 : 0.76;
        const omega = (2 * Math.PI) / response;
        const stiffness = omega ** 2;
        const drag = 2 * damping * omega;
        tarsSpringVelocity.current.x += (-stiffness * (from.x - desired.x) - drag * tarsSpringVelocity.current.x) * dt;
        tarsSpringVelocity.current.y += (-stiffness * (from.y - desired.y) - drag * tarsSpringVelocity.current.y) * dt;
        const x = from.x + tarsSpringVelocity.current.x * dt;
        const y = from.y + tarsSpringVelocity.current.y * dt;
        const dx = x - from.x;
        const dy = y - from.y;
        const speed = Math.hypot(dx, dy);
        const rot = speed > 0.2 ? (Math.atan2(dy, dx) * 180) / Math.PI + 90 : -35;
        const scale = 1 + Math.min(speed / 90, 0.08);
        const el = tarsElRef.current;
        if (el) el.style.transition = "opacity 0.25s ease";
        setTarsTransform(x, y, rot, scale, tarsMouseInside.current ? 1 : 0.55);
        tarsCurPos.current = { x, y };
        tarsIdleRaf.current = requestAnimationFrame(tickIdle);
      };
      tarsIdleRaf.current = requestAnimationFrame(tickIdle);

      return () => {
        if (tarsIdleRaf.current) cancelAnimationFrame(tarsIdleRaf.current);
        tarsIdleRaf.current = 0;
        container.removeEventListener("pointermove", updateMouse);
        container.removeEventListener("pointerenter", updateMouse);
        container.removeEventListener("pointerleave", leaveMouse);
        tarsSpringTimestamp.current = null;
        tarsSpringVelocity.current = { x: 0, y: 0 };
      };
    }, [tarsActive, setTarsTransform]);

    // ── External Tars point target (true Tars-style [POINT:x,y:label]) ──
    useEffect(() => {
      if (!tarsActive || !tarsPointTarget) return;

      if (tarsPointTimerRef.current) {
        clearTimeout(tarsPointTimerRef.current);
        tarsPointTimerRef.current = null;
      }
      tarsExternalPointing.current = true;
      tarsDrawing.current = true;
      tarsFocusId.current = `point:${tarsPointTarget.id}`;

      const target = { x: tarsPointTarget.x, y: tarsPointTarget.y };
      if (tarsCancelRef.current) tarsCancelRef.current();
      const from = tarsCurPos.current ?? target;

      tarsCancelRef.current = tarsFlight(
        from,
        target,
        (p) => {
          tarsCurPos.current = { x: p.x, y: p.y };
          setTarsTransform(p.x, p.y, p.rot, p.scale, 1);
        },
        () => {
          tarsCancelRef.current = null;
          tarsCurPos.current = target;
          const label = (tarsPointTarget.label || "right here").trim();
          setTarsBubbleText(label);
          onVisualSettled?.(tarsPointTarget.id);
          tarsPointTimerRef.current = setTimeout(() => {
            tarsExternalPointing.current = false;
            tarsDrawing.current = false;
            tarsFocusId.current = null;
            tarsIdleStart.current = 0;
            setTarsBubbleText("");
            tarsPointTimerRef.current = null;
          }, 2600);
        }
      );

      return () => {
        if (tarsPointTimerRef.current) {
          clearTimeout(tarsPointTimerRef.current);
          tarsPointTimerRef.current = null;
        }
      };
    }, [tarsActive, tarsPointTarget, onVisualSettled, setTarsTransform]);

    // Load Excalidraw + convertToExcalidrawElements once
    useEffect(() => {
      const timer = setTimeout(() => {
        setMounted(true);
        import("@excalidraw/excalidraw").then((mod) => {
          setExcalidrawComp(() => mod.Excalidraw);
          convertRef.current = mod.convertToExcalidrawElements;
          console.log(
            "[Canvas] Excalidraw module loaded, convertToExcalidrawElements available:",
            typeof mod.convertToExcalidrawElements === "function"
          );
        });
      }, 100);
      return () => clearTimeout(timer);
    }, []);

    // ── Convert AI element descriptors → Excalidraw element skeletons ─────
    //    Then pass through convertToExcalidrawElements for proper creation

    const toExcalidrawElements = useCallback((aiElements: any[]) => {
      const convert = convertRef.current;
      const availableDiagramWidth = Math.max(
        340,
        (containerRef.current?.clientWidth || 900) - 144,
      );
      const expandedElements = compileStructuredDiagrams(aiElements, {
        maxWidth: availableDiagramWidth,
      });
      const appState = appStateRef.current;
      const zoom = Math.max(0.1, Number(appState?.zoom?.value) || 1);
      const scrollX = Number(appState?.scrollX) || 0;
      const visibleSceneRight = (containerRef.current?.clientWidth || 900) / zoom - scrollX;
      const viewportElements = layoutClassroomViewportText(expandedElements, {
        rightBoundary: visibleSceneRight,
        rightMargin: 48 / zoom,
      });

      // Separate image elements (handled manually) from standard elements
      const imageElements: any[] = [];
      const standardElements: any[] = [];

      for (const el of viewportElements) {
        if (el.type === "image") {
          imageElements.push(el);
        } else {
          standardElements.push(el);
        }
      }

      // Build skeletons for standard elements
      // Excalidraw only knows: text, rectangle, diamond, ellipse, line, arrow,
      // freedraw, image, iframe. Any other `type` from the AI (e.g. "arc",
      // "circle") trips `assertNever` inside convertToExcalidrawElements, so we
      // coerce unknowns into the closest supported primitive.
      const SUPPORTED = new Set([
        "text", "rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "image", "iframe",
      ]);
      const TYPE_ALIASES: Record<string, string> = {
        arc: "line",
        circle: "ellipse",
        vector: "line",
        path: "freedraw",
      };

      const skeletons = standardElements.map((el: any) => {
        const rawType = el.type || "text";
        const type = SUPPORTED.has(rawType)
          ? rawType
          : TYPE_ALIASES[rawType] ?? "line";
        const base: any = {
          type,
          x: el.x ?? 0,
          y: el.y ?? 0,
          strokeColor: el.strokeColor ?? "#1e1e1e",
          backgroundColor: el.backgroundColor ?? "transparent",
          fillStyle: el.fillStyle ?? "hachure",
          opacity: el.opacity ?? 100,
        };

        if (el.id) base.id = el.id;
        if (el.strokeWidth != null) base.strokeWidth = el.strokeWidth;
        if (el.roughness != null) base.roughness = el.roughness;
        if (el.label) base.label = el.label;

        if (el.width != null) base.width = el.width;
        if (el.height != null) base.height = el.height;

        // Text elements
        if (base.type === "text") {
          base.text = el.text ?? "";
          base.fontSize = el.fontSize ?? 20;
          base.fontFamily = el.fontFamily ?? 1;
          // Diagram labels provide a measured box and must stay bounded while
          // animating. Free-standing classroom text must be measured by the
          // browser because the backend cannot know Excalidraw's font metrics.
          const autoResize = el.autoResize ?? el.width == null;
          base.autoResize = autoResize;
          if (autoResize) {
            delete base.width;
            delete base.height;
          }
          if (el.textAlign != null) base.textAlign = el.textAlign;
          if (el.verticalAlign != null) base.verticalAlign = el.verticalAlign;
        }

        // Arrow/line elements (includes coerced arc/vector → line)
        if (base.type === "arrow" || base.type === "line") {
          const pts = normalizePoints(el.points);
          base.points = pts.length >= 2 ? pts : [
            [0, 0],
            [el.width ?? 100, el.height ?? 50],
          ];
          if (el.start) base.start = el.start;
          if (el.end) base.end = el.end;
        }

        // Freedraw
        if (base.type === "freedraw") {
          // Excalidraw's generateFreeDrawShape requires >= 2 valid [x,y] points;
          // a single-point or empty array crashes exportToBlob.
          const pts = normalizePoints(el.points);
          base.points = pts.length >= 2 ? pts : [[0, 0], [1, 0]];
        }

        return base;
      });

      // Convert standard elements via Excalidraw's official converter
      let convertedStandard: any[] = [];
      if (skeletons.length > 0) {
        if (convert) {
          try {
            const out = convert(skeletons, { regenerateIds: true });
            // The converter can emit `undefined` slots for skeletons it
            // silently rejected (assertNever logs + returns undefined for
            // novel types). Filter those out so they don't end up in the
            // scene and trip Excalidraw's hit-testing later.
            convertedStandard = Array.isArray(out) ? out.filter((el) => el && typeof el.type === "string") : [];
            console.log(`[Canvas] convertToExcalidrawElements: ${skeletons.length} skeletons → ${convertedStandard.length} elements`);
          } catch (err) {
            console.warn("[Canvas] convertToExcalidrawElements failed, falling back:", err);
            convertedStandard = skeletons.filter((el) => el && typeof el.type === "string");
          }
        } else {
          convertedStandard = skeletons;
        }

        // The converter may supply its own autoResize default. Restore the
        // source sizing mode so measured diagram labels do not expand into
        // adjacent nodes.
        const freeTextModes = standardElements
          .filter((source) => source.type === "text")
          .map((source) => source.autoResize ?? source.width == null);
        let freeTextIndex = 0;
        convertedStandard = convertedStandard.map((el) => {
          if (el.type === "text") {
            if (el.containerId) {
              return { ...el, autoResize: false };
            }
            const autoResize = freeTextModes[freeTextIndex] ?? el.autoResize ?? true;
            freeTextIndex += 1;
            return {
              ...el,
              autoResize,
            };
          }
          return el;
        });
      }

      // Build image elements manually (convertToExcalidrawElements doesn't support images)
      let nextId = Date.now();
      const convertedImages = imageElements.map((el: any) => ({
        type: "image" as const,
        id: `ai-img-${nextId++}`,
        x: el.x ?? 0,
        y: el.y ?? 0,
        width: el.width ?? 400,
        height: el.height ?? 300,
        fileId: el.fileId,
        status: "saved",
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        groupIds: [],
        boundElements: null,
        link: null,
        locked: false,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 0,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
      }));

      if (convertedImages.length > 0) {
        console.log(`[Canvas] Created ${convertedImages.length} image element(s)`);
      }

      return [...convertedStandard, ...convertedImages];
    }, []);

    // ── Helper: compute bottom edge of existing scene content ─────────
    //    Returns the Y coordinate just past the lowest visible element.
    //    Used to push new tutor content below student drawings.

    const getContentBottomY = useCallback((api: any): number => {
      const activeAnimationElements = animTracksRef.current.flatMap((track) => track.allConverted);
      const elements = [...api.getSceneElements(), ...activeAnimationElements];
      let maxBottom = 0;
      for (const el of elements) {
        if (el.isDeleted) continue;
        let bottom = (el.y ?? 0) + (el.height ?? 0);
        // For freedraw / line / arrow, height might be 0; compute from points
        if (el.points && Array.isArray(el.points) && el.points.length > 0) {
          const pts = normalizePoints(el.points);
          if (pts.length === 0) continue;
          const maxPtY = Math.max(...pts.map((p) => p[1] ?? 0));
          const minPtY = Math.min(...pts.map((p) => p[1] ?? 0));
          bottom = Math.max(bottom, (el.y ?? 0) + maxPtY);
          // Also account for negative points (drawing upward from anchor)
          bottom = Math.max(bottom, (el.y ?? 0) + Math.abs(maxPtY - minPtY));
        }
        maxBottom = Math.max(maxBottom, bottom);
      }
      return maxBottom;
    }, []);

    // ── Helper: shift new elements below existing content ────────────
    const TUTOR_CONTENT_MARGIN = 40; // px gap between student & tutor content

    const shiftElementsBelowContent = useCallback(
      (api: any, newElements: any[]): any[] => {
        if (!newElements || newElements.length === 0) return newElements;

        const contentBottom = getContentBottomY(api);
        if (contentBottom <= 0) return newElements; // canvas is empty

        // Find the top-most Y of incoming new elements
        let minNewY = Infinity;
        for (const el of newElements) {
          minNewY = Math.min(minNewY, el.y ?? 0);
        }

        // If the new elements would land inside/above existing content, push down
        const targetY = contentBottom + TUTOR_CONTENT_MARGIN;
        if (minNewY < targetY) {
          const offsetY = targetY - minNewY;
          console.log(
            `[Canvas] Shifting ${newElements.length} new elements down by ${Math.round(offsetY)}px (contentBottom=${Math.round(contentBottom)}, minNewY=${Math.round(minNewY)})`
          );
          return newElements.map((el: any) => ({
            ...el,
            y: (el.y ?? 0) + offsetY,
          }));
        }

        return newElements;
      },
      [getContentBottomY]
    );

    // ── Apply canvas commands when they arrive or API becomes ready ───────
    // For commands with animation metadata, elements are drawn smoothly
    // using requestAnimationFrame — lines grow progressively and text
    // fades in, creating an immersive "tutor is drawing" effect.

    // ── Multi-track animation engine ─────────────────────────────────────
    // Each animated canvas command becomes an independent "track".
    // Multiple tracks play **concurrently** so consecutive commands
    // (e.g. write_text → draw_diagram) all animate without cancelling
    // each other.  A single requestAnimationFrame tick loop processes
    // every active track each frame.

    interface AnimTrack {
      visualSyncId?: string;
      allConverted: any[];
      groupMeta: {
        start: number;
        end: number;
        delay: number;
        drawDuration: number;
        duration?: number;
        elements: any[];
      }[];
      fullData: Map<string, { points?: number[][]; opacity: number; fullText?: string }>;
      startTs: number;
      elementIds: Set<string>;
    }

    useEffect(() => {
      const api = apiRef.current;
      if (!api || !ready) {
        if (canvasCommands.length > lastAppliedRef.current) {
          console.log(
            `[Canvas] ${canvasCommands.length - lastAppliedRef.current} commands queued, waiting for API (ready=${ready})`
          );
        }
        return;
      }

      // Cancel running tick — will be restarted at the end if tracks exist.
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }

      // ── Tars helper: convert scene coords → container px ─────────────
      const tarsToScreen = (sx: number, sy: number) => {
        const as = appStateRef.current;
        const zoom = as?.zoom?.value ?? 1;
        const scrollX = as?.scrollX ?? 0;
        const scrollY = as?.scrollY ?? 0;
        return { x: (sx + scrollX) * zoom, y: (sy + scrollY) * zoom };
      };
      // The "live tip" of the element currently being drawn. We pick the most
      // recently-started group that is still animating and off this update we
      // fly/follow Tars's cursor.
      let liveTip: { x: number; y: number; id: string; startedAt: number } | null = null;
      const settleAfterPaint = (syncId?: string, delayMs = 0) => {
        if (!syncId) return;
        window.setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => onVisualSettled?.(syncId));
          });
        }, delayMs);
      };

      // ── Shared tick function — processes ALL active animation tracks ──
      const tick = (now: number) => {
        const tracks = animTracksRef.current;
        if (tracks.length === 0) {
          animFrameRef.current = 0;
          return;
        }

        animFrameCountRef.current++;
        const frame = animFrameCountRef.current;
        const allAnimated: any[] = [];
        const completedIndices: number[] = [];

        for (let ti = 0; ti < tracks.length; ti++) {
          const track = tracks[ti];
          let trackDone = true;

          for (const gm of track.groupMeta) {
            const elapsed = now - track.startTs;
            if (elapsed < gm.delay) {
              trackDone = false;
              continue; // group hasn't started yet
            }

            const rawT = Math.min(
              (elapsed - gm.delay) / gm.drawDuration,
              1.0
            );
            // Ease-out cubic for a natural deceleration feel
            const t = 1 - Math.pow(1 - rawT, 3);

            for (const el of gm.elements) {
              const fd = track.fullData.get(el.id);
              if (!fd) continue;

              if (
                (el.type === "line" || el.type === "arrow") &&
                fd.points &&
                fd.points.length >= 2
              ) {
                // ── Smooth line growth ──
                const pts = fd.points;
                let partial: number[][];

                if (pts.length === 2) {
                  const [sx, sy] = pts[0];
                  const [ex, ey] = pts[1];
                  partial = [
                    [sx, sy],
                    [sx + (ex - sx) * t, sy + (ey - sy) * t],
                  ];
                } else {
                  const segs = pts.length - 1;
                  const pos = t * segs;
                  const idx = Math.floor(pos);
                  const frac = pos - idx;

                  partial = pts.slice(0, idx + 1);
                  if (frac > 0 && idx + 1 < pts.length) {
                    const a = pts[idx];
                    const b = pts[idx + 1];
                    partial.push([
                      a[0] + (b[0] - a[0]) * frac,
                      a[1] + (b[1] - a[1]) * frac,
                    ]);
                  }
                }

                const tip = partial[partial.length - 1] ?? [0, 0];
                allAnimated.push({
                  ...el,
                  points: partial,
                  width: tip[0],
                  height: tip[1],
                  version: (el.version ?? 1) + frame,
                  versionNonce: Math.floor(Math.random() * 1e9),
                });
                if (rawT < 1.0) {
                  const startedAt = track.startTs + gm.delay;
                  if (!liveTip || startedAt >= liveTip.startedAt) {
                    liveTip = {
                      x: (el.x ?? 0) + tip[0],
                      y: (el.y ?? 0) + tip[1],
                      id: el.id,
                      startedAt,
                    };
                  }
                }
              } else if (el.type === "text" && fd.fullText) {
                // ── Text element → typewriter reveal ──
                const full = fd.fullText;
                const charCount = Math.max(1, Math.ceil(full.length * t));
                const revealed = full.slice(0, charCount);
                allAnimated.push({
                  ...el,
                  text: revealed,
                  opacity: fd.opacity,
                  autoResize: el.autoResize ?? true,
                  version: (el.version ?? 1) + frame,
                  versionNonce: Math.floor(Math.random() * 1e9),
                });
                if (rawT < 1.0) {
                  // The text cursor ≈ right edge of revealed glyphs.
                  const fs = el.fontSize || 16;
                  const cx = (el.x ?? 0) + Math.min(
                    charCount * fs * 0.55,
                    el.width || Infinity
                  );
                  const startedAt = track.startTs + gm.delay;
                  if (!liveTip || startedAt >= liveTip.startedAt) {
                    liveTip = { x: cx, y: (el.y ?? 0) + fs * 0.5, id: el.id, startedAt };
                  }
                }
              } else {
                // ── Non-line, non-text element → opacity fade-in ──
                allAnimated.push({
                  ...el,
                  opacity: Math.round(fd.opacity * t),
                  version: (el.version ?? 1) + frame,
                  versionNonce: Math.floor(Math.random() * 1e9),
                });
                if (rawT < 1.0) {
                  const startedAt = track.startTs + gm.delay;
                  if (!liveTip || startedAt >= liveTip.startedAt) {
                    liveTip = {
                      x: (el.x ?? 0) + (el.width || 40) / 2,
                      y: (el.y ?? 0) + (el.height || 40) / 2,
                      id: el.id,
                      startedAt,
                    };
                  }
                }
              }
            }

            if (rawT < 1.0) trackDone = false;
          }

          if (trackDone) completedIndices.push(ti);
        }

        // Base = current scene elements that are NOT owned by any track
        const allAnimIds = new Set<string>();
        for (const track of tracks) {
          for (const id of track.elementIds) allAnimIds.add(id);
        }
        const baseElements = api
          .getSceneElements()
          .filter((el: any) => !allAnimIds.has(el.id));

        api.updateScene({ elements: [...baseElements, ...allAnimated] });

        // ── Tars cursor: fly / follow the live draw tip ──────────────
        if (liveTip && !tarsExternalPointing.current) {
          tarsDrawing.current = true;
          const screen = tarsToScreen(liveTip.x, liveTip.y);
          const isFocus = tarsFocusId.current === liveTip.id;
          if (!isFocus) {
            // New element started drawing — fly a bezier arc to it.
            if (tarsCancelRef.current) tarsCancelRef.current();
            const from = tarsCurPos.current ?? screen;
            tarsFocusId.current = liveTip.id;
            tarsCancelRef.current = tarsFlight(
              from,
              screen,
              (p) => {
                tarsCurPos.current = { x: p.x, y: p.y };
                setTarsTransform(p.x, p.y, p.rot, p.scale, 1);
              },
              () => {
                tarsCancelRef.current = null;
              }
            );
          } else if (!tarsCancelRef.current) {
            // Same element still drawing — smoothly track the live tip.
            tarsCurPos.current = screen;
            setTarsTransform(screen.x, screen.y, 0, 1, 1);
          }
        } else if (tarsDrawing.current && !tarsCancelRef.current) {
          // Drawing just ended — release focus so the idle bob resumes.
          tarsDrawing.current = false;
          tarsFocusId.current = null;
          tarsIdleStart.current = 0; // restart bob phase
        }

        // Remove completed tracks — their final-state elements are in
        // allAnimated this frame; next frame they'll be part of baseElements.
        if (completedIndices.length > 0) {
          const completedSyncIds = completedIndices
            .map((index) => tracks[index]?.visualSyncId)
            .filter((syncId): syncId is string => Boolean(syncId));
          const removed = new Set(completedIndices);
          animTracksRef.current = tracks.filter((_, i) => !removed.has(i));
          completedSyncIds.forEach((syncId) => settleAfterPaint(syncId));
          console.log(
            `[Canvas Anim] ${completedIndices.length} track(s) complete, ` +
              `${animTracksRef.current.length} remaining, ` +
              `total elements: ${api.getSceneElements().length}`
          );
        }

        if (animTracksRef.current.length > 0) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          animFrameRef.current = 0;
          console.log("[Canvas Anim] All animation tracks finished");
          if (tarsCancelRef.current) tarsCancelRef.current();
          tarsCancelRef.current = null;
          tarsDrawing.current = false;
          tarsFocusId.current = null;
          tarsIdleStart.current = 0;
        }
      };

      // ── Process new commands ───────────────────────────────────────────
      for (let i = lastAppliedRef.current; i < canvasCommands.length; i++) {
        const cmd = canvasCommands[i];
        console.log(
          `[Canvas] Applying cmd #${i}: tool=${cmd.tool} action=${cmd.action} elements=${cmd.elements?.length} animated=${!!cmd.animation}`
        );

        if (cmd.action === "clear") {
          // Clear everything including active animations
          animTracksRef.current.forEach((track) => settleAfterPaint(track.visualSyncId));
          animTracksRef.current = [];
          if (tarsCancelRef.current) tarsCancelRef.current();
          tarsCancelRef.current = null;
          tarsDrawing.current = false;
          tarsFocusId.current = null;
          tarsIdleStart.current = 0;
          api.updateScene({ elements: [] });
          settleAfterPaint(cmd.visualSyncId);
          continue;
        }

        // Register image files BEFORE adding elements so Excalidraw can resolve fileIds
        if (cmd.files && typeof cmd.files === "object") {
          const rawEntries = Object.values(cmd.files).map((f: any) => ({
            id: f.id,
            dataURL: f.dataURL as string,
            mimeType: f.mimeType,
            created: f.created || Date.now(),
          }));

          if (rawEntries.length > 0) {
            (async () => {
              const fileEntries = await Promise.all(
                rawEntries.map(async (entry) => ({
                  ...entry,
                  dataURL: await roundImageCorners(entry.dataURL),
                }))
              );
              try {
                api.addFiles(fileEntries);
                console.log(`[Canvas] Registered ${fileEntries.length} file(s) with rounded corners`);
              } catch (err) {
                console.warn("[Canvas] addFiles failed:", err);
              }
            })();
          }
        }

        const containsStructuredDiagram = cmd.elements.some(isStructuredDiagramElement);
        const convertedCommandElements = toExcalidrawElements(cmd.elements);
        const effectiveAnimation = cmd.animation && cmd.animation.length > 0
          ? cmd.animation
          : containsStructuredDiagram
            ? [{
                start: 0,
                end: convertedCommandElements.length,
                delay: 0,
                duration: 650,
              }]
            : undefined;

        // ── Animated rendering path ──────────────────────────────────
        // Create a new animation track — runs concurrently with any
        // existing tracks (no finalization / cancellation).
        if (effectiveAnimation && effectiveAnimation.length > 0) {
          const groups = effectiveAnimation;
          const allConverted =
            cmd.action === "add"
              ? shiftElementsBelowContent(api, convertedCommandElements)
              : convertedCommandElements;

          // Scroll to show the incoming content
          try {
            api.scrollToContent(allConverted, {
              fitToContent: true,
              animate: true,
              duration: 300,
            });
          } catch {
            /* ignore */
          }

          // Pre-compute per-group draw duration
          const groupMeta = groups.map((g: any, idx: number) => {
            let drawDuration: number;
            if (typeof g.duration === "number" && g.duration > 0) {
              drawDuration = g.duration;
            } else {
              const nextDelay =
                idx < groups.length - 1
                  ? groups[idx + 1].delay
                  : g.delay + 400;
              drawDuration = Math.max(nextDelay - g.delay, 120);
            }
            return {
              ...g,
              drawDuration,
              elements: allConverted.slice(g.start, g.end),
            };
          });

          // Cache full data for interpolation
          const fullData = new Map<
            string,
            { points?: number[][]; opacity: number; fullText?: string }
          >();
          for (const gm of groupMeta) {
            for (const el of gm.elements) {
              fullData.set(el.id, {
                points: normalizePoints(el.points),
                opacity: el.opacity ?? 100,
                fullText:
                  el.type === "text" && el.text
                    ? String(el.text)
                    : undefined,
              });
            }
          }

          const track: AnimTrack = {
            visualSyncId: cmd.visualSyncId,
            allConverted,
            groupMeta,
            fullData,
            startTs: performance.now(),
            elementIds: new Set(allConverted.map((el: any) => el.id as string)),
          };
          animTracksRef.current = [...animTracksRef.current, track];
          console.log(
            `[Canvas] New animation track: ${groupMeta.length} groups, ` +
              `${allConverted.length} elements (total tracks: ${animTracksRef.current.length})`
          );
          continue; // skip non-animated path
        }

        // ── Standard (non-animated) rendering path ───────────────────
        const rawElements = convertedCommandElements;
        const newElements =
          cmd.action === "add"
            ? shiftElementsBelowContent(api, rawElements)
            : rawElements;

        if (cmd.action === "replace") {
          animTracksRef.current.forEach((track) => settleAfterPaint(track.visualSyncId));
          animTracksRef.current = []; // clear animations on replace
          if (tarsCancelRef.current) tarsCancelRef.current();
          tarsCancelRef.current = null;
          tarsDrawing.current = false;
          tarsFocusId.current = null;
          tarsIdleStart.current = 0;
          api.updateScene({ elements: newElements });
        } else {
          const existing = api.getSceneElements();
          api.updateScene({
            elements: [...existing, ...newElements],
          });
        }

        try {
          api.scrollToContent(newElements, {
            fitToContent: true,
            animate: true,
            duration: 300,
          });
        } catch {
          // scrollToContent may fail if elements are empty
        }

        console.log(
          `[Canvas] Scene updated, total elements: ${api.getSceneElements().length}`
        );
        settleAfterPaint(cmd.visualSyncId, 320);
      }
      lastAppliedRef.current = canvasCommands.length;

      // (Re-)start the tick loop if there are active animation tracks
      if (animTracksRef.current.length > 0 && !animFrameRef.current) {
        animFrameRef.current = requestAnimationFrame(tick);
      }

      // Cleanup on unmount or dependency change
      return () => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = 0;
        }
      };
    }, [canvasCommands, ready, toExcalidrawElements, shiftElementsBelowContent, setTarsTransform, onVisualSettled]);

    // ── Get canvas snapshot as base64 JPEG ────────────────────────────────

    const getSnapshot = useCallback(async (): Promise<string | null> => {
      const api = apiRef.current;
      if (!api) return null;

      try {
        const { exportToBlob } = await import("@excalidraw/excalidraw");
        // Sanitize: drop freedraw elements with < 2 points — they crash
        // getFreeDrawSvgPath during export (known Excalidraw issue).
        const rawElements = api.getSceneElements();
        const safeElements = rawElements.filter((el: any) => {
          if (el.type === "freedraw") {
            return Array.isArray(el.points) && el.points.length >= 2;
          }
          return true;
        });
        const blob = await exportToBlob({
          elements: safeElements,
          appState: api.getAppState(),
          files: api.getFiles(),
          mimeType: "image/jpeg",
          quality: 0.85,
        });

        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(",")[1]);
          };
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.error("Failed to export canvas snapshot", err);
        return null;
      }
    }, []);

    /**
     * Resolve the generated course image from Excalidraw scene coordinates to
     * local viewport pixels. Excalidraw's transform is exact:
     *   viewport = (scene + scroll) * zoom + offset
     *
     * The returned rectangle is clipped to the visible whiteboard because the
     * viewport screenshot contains only that intersection.
     */
    const getGeneratedImageViewportBounds = useCallback((): GeneratedImageViewportBounds | null => {
      const api = apiRef.current;
      const container = containerRef.current;
      if (!api || !container) return null;

      const image = api.getSceneElements().find((element: any) => (
        !element.isDeleted
        && element.type === "image"
        && String(element.fileId || "").startsWith("course-visual-")
      ));
      if (!image) return null;

      const appState = api.getAppState();
      const zoom = Number(appState.zoom?.value) || 1;
      const scrollX = Number(appState.scrollX) || 0;
      const scrollY = Number(appState.scrollY) || 0;
      const offsetLeft = Number(appState.offsetLeft) || 0;
      const offsetTop = Number(appState.offsetTop) || 0;
      const containerRect = container.getBoundingClientRect();
      const width = Math.abs(Number(image.width) || 0);
      const height = Math.abs(Number(image.height) || 0);
      if (width < 1 || height < 1) return null;

      const sceneX = Number(image.x) || 0;
      const sceneY = Number(image.y) || 0;
      const angle = Number(image.angle) || 0;
      const centerX = sceneX + width / 2;
      const centerY = sceneY + height / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners = [
        [sceneX, sceneY],
        [sceneX + width, sceneY],
        [sceneX + width, sceneY + height],
        [sceneX, sceneY + height],
      ].map(([x, y]) => {
        const dx = x - centerX;
        const dy = y - centerY;
        const rotatedX = centerX + dx * cos - dy * sin;
        const rotatedY = centerY + dx * sin + dy * cos;
        return {
          x: (rotatedX + scrollX) * zoom + offsetLeft - containerRect.left,
          y: (rotatedY + scrollY) * zoom + offsetTop - containerRect.top,
        };
      });

      const left = Math.max(0, Math.min(...corners.map((corner) => corner.x)));
      const top = Math.max(0, Math.min(...corners.map((corner) => corner.y)));
      const right = Math.min(container.clientWidth, Math.max(...corners.map((corner) => corner.x)));
      const bottom = Math.min(container.clientHeight, Math.max(...corners.map((corner) => corner.y)));
      if (right - left < 2 || bottom - top < 2) return null;

      return {
        fileId: String(image.fileId),
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    }, []);

    const getViewportSnapshot = useCallback(async (): Promise<{
      base64: string;
      imageWidth: number;
      imageHeight: number;
      viewWidth: number;
      viewHeight: number;
      generatedImageBounds: GeneratedImageViewportBounds | null;
    } | null> => {
      const container = containerRef.current;
      if (!container) return null;
      try {
        const localImageBounds = getGeneratedImageViewportBounds();
        const canvas = await html2canvas(container, {
          backgroundColor: "#ffffff",
          scale: Math.min(window.devicePixelRatio || 1, 2),
          logging: false,
          useCORS: true,
          ignoreElements: (el) => el instanceof HTMLElement && el.dataset.tarsOverlay === "true",
        });
        return {
          base64: canvas.toDataURL("image/jpeg", 0.88).split(",")[1],
          imageWidth: canvas.width,
          imageHeight: canvas.height,
          viewWidth: container.clientWidth,
          viewHeight: container.clientHeight,
          generatedImageBounds: localImageBounds ? {
            ...localImageBounds,
            x: localImageBounds.x * canvas.width / Math.max(1, container.clientWidth),
            y: localImageBounds.y * canvas.height / Math.max(1, container.clientHeight),
            width: localImageBounds.width * canvas.width / Math.max(1, container.clientWidth),
            height: localImageBounds.height * canvas.height / Math.max(1, container.clientHeight),
          } : null,
        };
      } catch (err) {
        console.error("Failed to capture whiteboard viewport", err);
        return null;
      }
    }, [getGeneratedImageViewportBounds]);

    // Expose getSnapshot and getSceneElements via ref
    useImperativeHandle(ref, () => ({
      getSnapshot,
      getViewportSnapshot,
      getGeneratedImageViewportBounds,
      getViewportRect: () => {
        const rect = containerRef.current?.getBoundingClientRect();
        return rect
          ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
          : null;
      },
      getSceneElements: () => apiRef.current?.getSceneElements() ?? [],
    }), [getGeneratedImageViewportBounds, getSnapshot, getViewportSnapshot]);

    if (!ExcalidrawComp || !mounted) {
      return (
        <div
          ref={containerRef}
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#868e96",
          }}
        >
          Loading whiteboard…
        </div>
      );
    }

    const tarsBubbleOpensLeft =
      (tarsCurPos.current?.x ?? 0) > (containerRef.current?.clientWidth ?? 0) - 260;

    return (
      <div
        ref={containerRef}
        style={{ height: "100%", width: "100%", position: "relative" }}
      >
        <ExcalidrawComp
          excalidrawAPI={(api: any) => {
            apiRef.current = api;
            console.log("[Canvas] Excalidraw API ready");
            setReady(true);
          }}
          onChange={(_elements: any, appState: any) => {
            appStateRef.current = appState;
            onCanvasChange?.();
          }}
          theme="light"
          initialData={{
            appState: {
              viewBackgroundColor: "#ffffff",
            },
            libraryItems: [],
          }}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
            },
          }}
        />

        {/* ── Image-generation loading overlay ────────────────────── */}
        {isGeneratingImage && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255, 255, 255, 0.78)",
              backdropFilter: "blur(4px)",
              zIndex: 50,
              gap: "16px",
              pointerEvents: "none",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/video_loading.gif"
              alt="Generating image…"
              style={{ width: 120, height: 120, objectFit: "contain" }}
            />
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#495057",
                letterSpacing: "0.01em",
              }}
            >
              Generating image…
            </span>
          </div>
        )}

        {/* ── Save-progress loading overlay ─────────────────────── */}
        {isSavingProgress && (
          <div
            style={{
              position: "absolute",
              bottom: 24,
              right: 24,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "rgba(16, 18, 15, 0.94)",
              backdropFilter: "blur(8px)",
              borderRadius: "6px",
              padding: "12px 20px",
              zIndex: 50,
              boxShadow: "0 8px 28px rgba(16, 18, 15, 0.18)",
              animation: "fadeInUp 0.3s ease",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/save_progress_loading.gif"
              alt="Saving progress…"
              style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 8 }}
            />
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "white",
                letterSpacing: "0.01em",
              }}
            >
              Saving progress…
            </span>
          </div>
        )}

        {/* ── Tars cursor overlay — follows the tutor's pen ────── */}
        <div
          ref={tarsElRef}
          aria-hidden
          data-tars-overlay="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            zIndex: 60,
            pointerEvents: "none",
            opacity: 0,
            willChange: "transform, opacity",
            transition: "opacity 0.18s ease",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: -8,
              top: 0,
              width: 16,
              height: 13.856,
              background: TARS_COLOR,
              clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
              filter: `drop-shadow(0 0 8px ${TARS_GLOW})`,
            }}
          />
          {!!tarsBubbleText && (
            <div
              ref={tarsBubbleAnchorRef}
              style={{
                position: "absolute",
                left: tarsBubbleOpensLeft ? -16 : 16,
                top: -6,
                transform: `${tarsBubbleOpensLeft ? "translateX(-100%) " : ""}rotate(${-tarsRotationRef.current}deg)`,
                transformOrigin: tarsBubbleOpensLeft ? "100% 0" : "0 0",
              }}
            >
              <div
                style={{
                  width: "max-content",
                  maxWidth: "min(240px, calc(100vw - 32px))",
                  padding: "6px 9px",
                  borderRadius: 8,
                  background: "rgba(99,102,241,0.94)",
                  color: "#fff",
                  fontSize: 12,
                  fontStyle: "normal",
                  fontWeight: 600,
                  letterSpacing: 0,
                  textAlign: "left",
                  lineHeight: 1.35,
                  overflowWrap: "anywhere",
                  whiteSpace: "normal",
                }}
              >
                {tarsBubbleText}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

WhiteboardCanvas.displayName = "WhiteboardCanvas";
export default WhiteboardCanvas;
