"use client";

/**
 * LabCoach — Ctrl+Teach's pixel-precise visual coaching overlay.
 *
 * This is the hero feature, inspired by Clicky's "[POINT:x,y:label]" + bezier-arc
 * flight, reimagined for the browser:
 *
 *  - Targets are CSS selectors, resolved to live element rects on every animation
 *    frame (so annotations stay pixel-accurate through scroll / reflow — the
 *    equivalent of Clicky's coordinate→monitor mapping, but DOM-relative).
 *  - A glowing "coach cursor" flies between targets along a quadratic-bezier arc
 *    (ported from Clicky's `animateBezierFlightArc` — smoothstep easing, tangent
 *    rotation, midpoint scale pulse).
 *  - Annotations: arrow, circle, pulsing hotspot, label, hint card, focus/dim
 *    scrim with a target cutout, and a success celebration.
 *
 * The overlay is fixed + pointer-events-none so it never blocks the practice
 * surface beneath it. It plays a `LabScene` step-by-step.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LabScene, LabStep, Annotation } from "@/lib/types";

const COACH_COLOR = "#6366f1"; // indigo-500 — vivid against the warm palette
const COACH_GLOW = "rgba(99,102,241,0.55)";

interface Rect { x: number; y: number; w: number; h: number; }

function rectOf(selector: string): Rect | null {
  const el =
    document.querySelector(selector) as HTMLElement | null ??
    (selector ? document.getElementById(selector.replace(/^#/, "")) as HTMLElement | null : null);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function centerOf(r: Rect) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// ── Bezier flight (ported from Clicky's animateBezierFlightArc) ──────────────

function bezierPoint(t: number, p0: number, p1: number, p2: number) {
  const m = 1 - t;
  return m * m * p0 + 2 * m * t * p1 + t * t * p2;
}

/**
 * Animate a value along a quadratic-bezier arc over `dur` ms, calling `onFrame`
 * with {x,y,rot,scale} each frame. Returns a cancel function.
 *
 *   - smoothstep easing (3t²-2t³)
 *   - tangent rotation so the cursor "faces" travel
 *   - sin-pulse scale peaking at the arc midpoint (swooping feel)
 */
function flight(
  from: { x: number; y: number },
  to: { x: number; y: number },
  dur: number | undefined,
  onFrame: (p: { x: number; y: number; rot: number; scale: number }) => void,
  onDone: () => void
) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const D = Math.min(Math.max(dist / 800, 0.5), 1.1) * 1000; // ms
  const total = dur ?? D;
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

// ── Coach cursor (glowing triangle that flies between targets) ───────────────

const CoachCursor: React.FC<{ pos: { x: number; y: number }; rot: number; scale: number; visible: boolean }> = ({
  pos, rot, scale, visible,
}) => (
  <motion.div
    style={{
      position: "fixed",
      left: pos.x,
      top: pos.y,
      width: 0,
      height: 0,
      zIndex: 10001,
      pointerEvents: "none",
      transform: `translate(-50%,-50%) rotate(${rot}deg) scale(${scale})`,
      opacity: visible ? 1 : 0,
    }}
    transition={{ duration: 0.05 }}
  >
    <div
      style={{
        width: 0,
        height: 0,
        borderLeft: "9px solid transparent",
        borderRight: "9px solid transparent",
        borderBottom: `16px solid ${COACH_COLOR}`,
        filter: `drop-shadow(0 0 8px ${COACH_GLOW})`,
      }}
    />
  </motion.div>
);

// ── A resolved annotation renderer ───────────────────────────────────────────

const toneColor: Record<string, string> = {
  neutral: COACH_COLOR,
  success: "#16a34a",
  warning: "#e8590c",
  info: "#0ea5e9",
};

const AnnotationView: React.FC<{ ann: Annotation; rect: Rect | null; coachPos: { x: number; y: number } }> = ({
  ann, rect, coachPos,
}) => {
  const color = toneColor[ann.tone ?? "neutral"] ?? COACH_COLOR;
  if (!rect) {
    if (ann.kind === "dim") return <DimScrim target={null} />;
    return null;
  }
  const c = centerOf(rect);

  switch (ann.kind) {
    case "dim":
    case "focus":
      return <DimScrim target={rect} />;

    case "circle":
      return (
        <motion.svg
          key={ann.selector + rect.x}
          width={rect.w + 40}
          height={rect.h + 40}
          style={{ position: "fixed", left: rect.x - 20, top: rect.y - 20, zIndex: 10000, pointerEvents: "none" }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 16 }}
        >
          <motion.ellipse
            cx={(rect.w + 40) / 2}
            cy={(rect.h + 40) / 2}
            rx={(rect.w + 40) / 2 - 6}
            ry={(rect.h + 40) / 2 - 6}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeDasharray="7 7"
            animate={{ rotate: 360 }}
            transition={{ rotate: { duration: 14, repeat: Infinity, ease: "linear" } }}
            style={{ transformOrigin: "center" }}
          />
        </motion.svg>
      );

    case "hotspot":
      return (
        <motion.div
          style={{ position: "fixed", left: c.x, top: c.y, zIndex: 10000, pointerEvents: "none", transform: "translate(-50%,-50%)" }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 12 }}
        >
          <motion.div
            style={{
              width: 16, height: 16, borderRadius: "50%", background: color,
              boxShadow: `0 0 0 0 ${color}`,
            }}
            animate={{ boxShadow: [`0 0 0 0 ${color}88`, `0 0 0 22px ${color}00`] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        </motion.div>
      );

    case "arrow": {
      const from = ann.fromSelector ? centerOf(rectOf(ann.fromSelector) ?? rect) : coachPos;
      return (
        <Arrow from={from} to={c} color={color} />
      );
    }

    case "label":
    case "hint": {
      const above = rect.y > 90;
      return (
        <motion.div
          key={ann.selector + rect.y}
          style={{ position: "fixed", left: rect.x + rect.w + 14, top: above ? rect.y : rect.y + rect.h + 10, zIndex: 10002, pointerEvents: "none", maxWidth: 280 }}
          initial={{ opacity: 0, x: -16, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 18, delay: (ann.delay ?? 0) / 1000 }}
        >
          <div
            style={{
              background: ann.kind === "hint" ? "#111827" : "#fff",
              color: ann.kind === "hint" ? "#fff" : color,
              border: ann.kind === "hint" ? "none" : `1.5px solid ${color}`,
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.35,
              boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {ann.kind === "hint" && <span style={{ opacity: 0.7, fontSize: 10, letterSpacing: 0.08, textTransform: "uppercase", display: "block", marginBottom: 2 }}>Coach</span>}
            {ann.text}
          </div>
        </motion.div>
      );
    }

    case "celebrate":
      return <Celebrate at={c} />;
  }
};

// Arrow with an animated "grow" line + arrowhead (the fly-in effect).
const Arrow: React.FC<{ from: { x: number; y: number }; to: { x: number; y: number }; color: string }> = ({ from, to }) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const headLen = 12;
  const tipX = to.x - ux * 4;
  const tipY = to.y - uy * 4;
  // shorten the start so it begins at the coach edge
  const startX = from.x + ux * 18;
  const startY = from.y + uy * 18;
  return (
    <motion.svg
      style={{ position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", zIndex: 10000, pointerEvents: "none" }}
    >
      <motion.line
        x1={startX} y1={startY} x2={startX} y2={startY}
        stroke={COACH_COLOR} strokeWidth={2.5} strokeLinecap="round"
        initial={false}
        animate={{ x2: tipX, y2: tipY }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
      <motion.polygon
        points={`${tipX},${tipY} ${tipX - ux * headLen - uy * 6},${tipY - uy * headLen + ux * 6} ${tipX - ux * headLen + uy * 6},${tipY - uy * headLen - ux * 6}`}
        fill={COACH_COLOR}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.15 }}
      />
    </motion.svg>
  );
};

// Dim scrim with a rounded cutout around the target (focus attention).
const DimScrim: React.FC<{ target: Rect | null }> = ({ target }) => {
  return (
    <svg
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 9998, pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <mask id="lab-focus-mask">
          <rect width="100%" height="100%" fill="white" />
          {target && (
            <rect
              x={target.x - 10}
              y={target.y - 10}
              width={target.w + 20}
              height={target.h + 20}
              rx={12}
              fill="black"
            />
          )}
        </mask>
      </defs>
      <motion.rect
        width="100%" height="100%" fill="rgba(20,20,30,0.42)"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
        mask="url(#lab-focus-mask)"
      />
      {target && (
        <motion.rect
          x={target.x - 10} y={target.y - 10}
          width={target.w + 20} height={target.h + 20} rx={12}
          fill="none" stroke={COACH_COLOR} strokeWidth={2}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
        />
      )}
    </svg>
  );
};

const Celebrate: React.FC<{ at: { x: number; y: number } }> = ({ at }) => {
  const pieces = useMemo(
    () => Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      a: (Math.PI * 2 * i) / 18 + Math.random(),
      d: 40 + Math.random() * 60,
      c: ["#6366f1", "#16a34a", "#f59e0b", "#ec4899", "#0ea5e9"][i % 5],
    })),
    []
  );
  return (
    <div style={{ position: "fixed", left: at.x, top: at.y, zIndex: 10003, pointerEvents: "none", transform: "translate(-50%,-50%)" }}>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 12 }}
        style={{ width: 56, height: 56, borderRadius: "50%", background: "#16a34a", display: "grid", placeItems: "center", boxShadow: "0 0 24px rgba(22,163,74,0.5)" }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </motion.div>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: Math.cos(p.a) * p.d, y: Math.sin(p.a) * p.d, opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{ position: "absolute", left: 0, top: 0, width: 8, height: 8, borderRadius: 2, background: p.c }}
        />
      ))}
    </div>
  );
};

// ── The coach speech bubble (streams `coachLine` char-by-char) ────────────────

const CoachBubble: React.FC<{ text: string; at: { x: number; y: number } }> = ({ text, at }) => {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  return (
    <AnimatePresence>
      <motion.div
        key={text}
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        style={{
          position: "fixed",
          left: Math.min(at.x + 22, window.innerWidth - 300),
          top: Math.max(at.y - 56, 12),
          zIndex: 10002,
          maxWidth: 300,
          background: "#111827",
          color: "#fff",
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.4,
          boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
          pointerEvents: "none",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <span style={{ color: "#818cf8", fontSize: 10, letterSpacing: 0.08, textTransform: "uppercase", display: "block", marginBottom: 2 }}>AI Coach</span>
        {shown}
        <span style={{ opacity: 0.4, animation: "blink 1s steps(2) infinite" }}>|</span>
      </motion.div>
    </AnimatePresence>
  );
};

// ── Stepper (coach step control) ──────────────────────────────────────────────

const Stepper: React.FC<{ scene: LabScene; index: number; total: number; onPrev: () => void; onNext: () => void; done: boolean }> = ({
  scene, index, total, onPrev, onNext, done,
}) => (
  <div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 10004, pointerEvents: "auto" as const, display: "flex", alignItems: "center", gap: 12, background: "rgba(17,24,39,0.92)", backdropFilter: "blur(8px)", borderRadius: 999, padding: "8px 14px", boxShadow: "0 12px 30px rgba(0,0,0,0.25)", fontFamily: "Inter, system-ui, sans-serif" }}>
    <button onClick={onPrev} disabled={index === 0} style={{ color: "#fff", background: "transparent", border: "0px", padding: "4px 8px", borderRadius: 8, cursor: index === 0 ? "not-allowed" : "pointer", opacity: index === 0 ? 0.3 : 1, fontWeight: 600 }}>‹</button>
    <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, minWidth: 64, textAlign: "center" }}>
      {done ? "Session complete" : `Step ${index + 1} / ${total}`}
    </span>
    <button onClick={onNext} disabled={done} style={{ color: done ? "#a7f3d0" : "#fff", background: done ? "rgba(22,163,74,0.25)" : "rgba(99,102,241,0.3)", border: "0px", padding: "4px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>{done ? "Finish" : "Next ›"}</button>
  </div>
);

// ── LabCoach: drives a scene step-by-step ───────────────────────────────────

interface LabCoachProps {
  scene: LabScene;
  onComplete?: () => void;
}

export default function LabCoach({ scene, onComplete }: LabCoachProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [coachPos, setCoachPos] = useState({ x: window.innerWidth / 2, y: 120 });
  const [coachRot, setCoachRot] = useState(-35);
  const [coachScale, setCoachScale] = useState(1);
  const [cursorVisible, setCursorVisible] = useState(true);
  const cancelRef = useRef<(() => void) | null>(null);
  const [rects, setRects] = useState<Record<string, Rect | null>>({});
  const total = scene.steps.length;
  const done = stepIndex >= total;

  // First annotation target of the current step — where the cursor flies to.
  const step: LabStep | null = scene.steps[stepIndex] ?? null;
  const flyTarget = useMemo(() => {
    if (!step) return null;
    const a = step.annotations.find((ann) => ann.selector) ?? null;
    return a?.selector ?? null;
  }, [step]);

  // Live-rect tracking: re-resolve every active selector on each rAF so the
  // annotations track the target through scroll/reflow (the DOM analogue of
  // Clicky's monitor-coordinate mapping, kept pixel-accurate at runtime).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const selectors = new Set<string>();
      for (let i = 0; i <= stepIndex && i < total; i++) {
        for (const ann of scene.steps[i].annotations) {
          if (ann.selector) selectors.add(ann.selector);
          if (ann.fromSelector) selectors.add(ann.fromSelector);
        }
      }
      const next: Record<string, Rect | null> = {};
      selectors.forEach((s) => (next[s] = rectOf(s)));
      setRects((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, stepIndex, total]);

  // Coach cursor bezier flight — fires once per STEP (not per rect update), so
  // the arc flight is stable even if the practice surface scrolls. The target
  // rect is read directly from the DOM at trigger time (the element is mounted),
  // decoupled from the reactive rect-tracking loop used by the annotations.
  useEffect(() => {
    cancelRef.current?.();
    if (!flyTarget) return;
    const target = rectOf(flyTarget);
    if (!target) return;
    const to = centerOf(target);
    const offset = { x: to.x + 14, y: to.y + 14 };
    cancelRef.current = flight(coachPos, offset, undefined, (p) => {
      setCoachPos({ x: p.x, y: p.y });
      setCoachRot(p.rot);
      setCoachScale(p.scale);
    }, () => {
      setCoachRot(-35);
      setCoachScale(1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTarget, stepIndex]);

  // Auto-advance steps that have an autoAdvanceMs.
  useEffect(() => {
    if (!step?.autoAdvanceMs) return;
    const id = setTimeout(() => {
      if (stepIndex + 1 < total) setStepIndex((i) => i + 1);
    }, step.autoAdvanceMs);
    return () => clearTimeout(id);
  }, [step, stepIndex, total]);

  const bubbleAnchor = (() => {
    if (!flyTarget) return coachPos;
    const r = rects[flyTarget];
    return r ? { x: r.x, y: r.y } : coachPos;
  })();

  return (
    <>
      {/* keyframes for caret blink */}
      <style>{`@keyframes blink { 0%,50% {opacity:1} 51%,100% {opacity:0} }`}</style>

      {/* Cursor + bubble */}
      <CoachCursor pos={coachPos} rot={coachRot} scale={coachScale} visible={cursorVisible && !done} />
      {step && !done && <CoachBubble text={step.coachLine} at={bubbleAnchor} />}

      {/* All annotations for every step up to the current one accumulate,
          so earlier hints persist as the coach walks forward. */}
      {scene.steps.slice(0, stepIndex + 1).flatMap((s, si) =>
        s.annotations.map((ann, ai) => (
          <AnnotationView
            key={`${si}-${ai}`}
            ann={ann}
            rect={ann.selector ? rects[ann.selector] ?? null : null}
            coachPos={coachPos}
          />
        ))
      )}

      <Stepper
        scene={scene}
        index={stepIndex}
        total={total}
        onPrev={() => setStepIndex((i) => Math.max(0, i - 1))}
        onNext={() => {
          if (stepIndex + 1 >= total) {
            setStepIndex(total);
            onComplete?.();
          } else {
            setStepIndex((i) => i + 1);
          }
        }}
        done={done}
      />
    </>
  );
}