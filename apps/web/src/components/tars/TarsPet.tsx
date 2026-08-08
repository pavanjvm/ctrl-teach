"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  LaunchSide,
  Perch,
  PetMode,
  Point2,
  RocketGesture,
  RocketPose,
} from "@/lib/tars/petMotion";

type TarsPetProps = {
  perch: Perch;
  gazeTarget: Point2;
  mode: PetMode;
  gesture: RocketGesture;
  rocket: RocketPose | null;
  launchSide: LaunchSide | null;
  label?: string;
  hopping?: boolean;
  reducedMotion?: boolean;
  showLabel?: boolean;
  visible?: boolean;
  zIndex?: number;
  draggable?: boolean;
  onDragStart?: () => void;
  onDrag?: (perch: Perch) => void;
  onDragEnd?: () => void;
};

function Hand({ side, hidden = false }: { side: LaunchSide; hidden?: boolean }) {
  const mirror = side === "left" ? "scale(-1 1) translate(-44 0)" : undefined;
  return (
    <g transform={mirror} opacity={hidden ? 0 : 1} className="tars-pet-docked-hand">
      <path d="M37 22c3-1 5 .8 4 3.2-.7 1.8-2.1 3.7-4.4 4.8-2.4 1.2-4.5-.4-4.1-2.8.4-2.1 1.8-4.2 4.5-5.2Z" fill="#b7ec52" stroke="#10120f" strokeWidth="1.7" />
    </g>
  );
}

export default function TarsPet({
  perch,
  gazeTarget,
  mode,
  gesture,
  rocket,
  launchSide,
  label = "",
  hopping = false,
  reducedMotion = false,
  showLabel = true,
  visible = true,
  zIndex = 10001,
  draggable = true,
  onDragStart,
  onDrag,
  onDragEnd,
}: TarsPetProps) {
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const launched = gesture !== "perched" && gesture !== "dock";
  const thinkingPose = mode === "thinking" && !launched;
  const gazeDx = gazeTarget.x - perch.x;
  const gazeDy = gazeTarget.y - perch.y;
  const gazeDistance = Math.hypot(gazeDx, gazeDy) || 1;
  const pupilX = thinkingPose && !rocket ? 1.2 : (gazeDx / gazeDistance) * 2.2;
  const pupilY = thinkingPose && !rocket ? -2 : (gazeDy / gazeDistance) * 1.8;
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const labelOnLeft = perch.x > viewportWidth - 330;
  const recoil = launched && !reducedMotion ? (launchSide === "left" ? 3 : -3) : 0;
  const bodyClass = [
    "tars-pet-body",
    `mode-${mode}`,
    `gesture-${gesture}`,
    hopping ? "is-hopping" : "",
    dragging ? "is-dragging" : "",
  ].filter(Boolean).join(" ");

  const beginPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - perch.x,
      offsetY: event.clientY - perch.y,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable in synthetic/test environments;
      // direct pointer movement still updates the perch.
    }
    setDragging(true);
    onDragStart?.();
    event.preventDefault();
    event.stopPropagation();
  };

  const movePointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onDrag?.({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    });
    event.preventDefault();
    event.stopPropagation();
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    onDragEnd?.();
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      data-tars-pet="true"
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex, pointerEvents: "none", opacity: visible ? 1 : 0, transition: "opacity .18s ease" }}
    >
      <div
        className={bodyClass}
        onPointerDown={beginPointerDrag}
        onPointerMove={movePointerDrag}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        style={{
          position: "fixed",
          left: perch.x,
          top: perch.y,
          width: 48,
          height: 44,
          transform: `translate(-50%, -50%) translateX(${recoil}px)`,
          transformOrigin: "50% 68%",
          filter: "drop-shadow(0 5px 9px rgba(16,18,15,.22)) drop-shadow(0 0 2px rgba(255,255,255,.9))",
          willChange: "left, top, transform",
          pointerEvents: draggable && visible ? "auto" : "none",
          cursor: draggable ? (dragging ? "grabbing" : "grab") : "default",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <svg width="48" height="44" viewBox="0 0 44 40" overflow="visible">
          <ellipse cx="22" cy="37" rx="14" ry="2.5" fill="rgba(16,18,15,.16)" className="tars-pet-shadow" />
          <circle cx="5.5" cy="25" r="3.2" fill="#26320f" opacity={launchSide === "left" && launched ? .9 : 0} className="tars-pet-socket" />
          <circle cx="38.5" cy="25" r="3.2" fill="#26320f" opacity={launchSide === "right" && launched ? .9 : 0} className="tars-pet-socket" />
          <path className="tars-pet-shell" d="M8.3 9.8C11.8 4.4 17.1 2 22 2s10.2 2.4 13.7 7.8c3.2 4.8 4.2 13.2 1.2 19.1C34.2 34.2 28.5 37 22 37S9.8 34.2 7.1 28.9c-3-5.9-2-14.3 1.2-19.1Z" fill="#b7ec52" stroke="#10120f" strokeWidth="2" />
          <path d="M11.3 11.5c3-4 6.6-5.6 10.7-5.6s7.7 1.6 10.7 5.6" fill="none" stroke="rgba(255,255,255,.64)" strokeWidth="2.2" strokeLinecap="round" />
          <g className="tars-pet-ear">
            <path d="M34.2 11.5c1.5-4.8 8.9-6.1 12.3-1.7 3.7 4.9 1.3 14-5.2 16.6-4.7 1.8-9.2-1-8.9-5.1.2-2.5 2-4.3 4.8-5 3-.7 4.3-2.9 3.1-4.8-1.2-1.9-3.9-1.7-6.1 0Z" fill="#e7ffb1" stroke="#10120f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M38.3 11.5c2.7-.8 4.9 1.1 4.3 3.5-.5 1.9-2.2 2.8-4.1 2.8-1.5 0-2.4 1-2.3 2.2.1 1.1 1 1.8 2.1 2" fill="none" stroke="#527f19" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g className="tars-pet-eyes">
            <ellipse cx="16.3" cy="19" rx="5.2" ry={launched ? 6.1 : 5.5} fill="#fff" stroke="#10120f" strokeWidth="1.5" />
            <ellipse cx="27.7" cy="19" rx="5.2" ry={launched ? 6.1 : 5.5} fill="#fff" stroke="#10120f" strokeWidth="1.5" />
            <circle cx={16.3 + pupilX} cy={19 + pupilY} r="2.1" fill="#10120f" />
            <circle cx={27.7 + pupilX} cy={19 + pupilY} r="2.1" fill="#10120f" />
            <circle cx={15.6 + pupilX} cy={18.2 + pupilY} r=".65" fill="#fff" />
            <circle cx={27 + pupilX} cy={18.2 + pupilY} r=".65" fill="#fff" />
          </g>
          <path className="tars-pet-smile" d="M18.8 28.2c2 1.4 4.4 1.4 6.4 0" fill="none" stroke="#10120f" strokeWidth="1.7" strokeLinecap="round" />
          <ellipse className="tars-pet-speaking-mouth" cx="22" cy="29" rx="3.4" ry="2.5" fill="#10120f" />
          <g className="tars-pet-thinking-face">
            <path d="M11.6 13.8c2-1.8 4.5-2.2 6.8-1.1M25.7 12.4c2.3-.5 4.5.2 6.2 2" fill="none" stroke="#10120f" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M19.2 29.6c1.9-1.5 4.4-1.3 6.1.3" fill="none" stroke="#10120f" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <Hand side="left" hidden={launchSide === "left" && launched} />
          <Hand side="right" hidden={(launchSide === "right" && launched) || thinkingPose} />
          <g className="tars-pet-thinking-hand">
            <path d="M40.2 35.2c-2.2 2.3-6.1 2.7-8.5.8-1.5-1.2-1.8-3.3-.5-4.7 1.2-1.3 3.1-1.6 4.6-.7l1.5.8-4.8-2.4c-1.3-.7-.8-2.8.7-2.7 1.2.1 3.1.9 5.6 2.5 2.6 1.6 3.2 4.4 1.4 6.4Z" fill="#b7ec52" stroke="#10120f" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M34.2 30.1 27.8 27" fill="none" stroke="#10120f" strokeWidth="1.7" strokeLinecap="round" />
          </g>
        </svg>

        <div className="tars-pet-thought" aria-hidden="true"><i /><i /><i /></div>

        {showLabel && !!label && launched && (
          <div className={`tars-pet-label ${labelOnLeft ? "label-left" : "label-right"}`}>
            {label}
          </div>
        )}
      </div>

      {rocket && (
        <div
          className={`tars-rocket-hand gesture-${gesture}`}
          style={{
            position: "fixed",
            left: rocket.x,
            top: rocket.y,
            width: 36,
            height: 22,
            transform: `translate(-97%, -50%) rotate(${rocket.rotation}deg)`,
            transformOrigin: "97% 50%",
            willChange: "left, top, transform",
          }}
        >
          {rocket.thrust && !reducedMotion && (
            <div className="tars-rocket-thrust">
              <span className="flame flame-outer" />
              <span className="flame flame-inner" />
              <i className="spark spark-one" />
              <i className="spark spark-two" />
              <i className="smoke smoke-one" />
              <i className="smoke smoke-two" />
            </div>
          )}
          <svg width="36" height="22" viewBox="0 0 36 22" overflow="visible">
            <path d="M8 6.2h13.5V4.5c0-2 1.4-3.5 3.2-3.5 1.7 0 2.8 1.3 2.8 3v2.2h4.8c1.7 0 2.7 1.1 2.7 2.6 0 1.6-1.1 2.7-2.7 2.7h-5.1c-.8 5.2-4.3 8.5-9.7 8.5H13c-5.2 0-8.5-3.2-8.5-7.8 0-3.3 1.2-6 3.5-6Z" fill="#b7ec52" stroke="#10120f" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M11 8.4c2.3-1 4.9-.8 7 .5" fill="none" stroke="rgba(255,255,255,.72)" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {rocket && gesture === "point" && (
        <div className="tars-target-pulse" style={{ position: "fixed", left: rocket.x, top: rocket.y }} />
      )}

      <style>{`
        @keyframes tarsPetBreathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.035)} }
        @keyframes tarsPetBlink { 0%,44%,48%,100%{transform:scaleY(1)} 46%{transform:scaleY(.08)} }
        @keyframes tarsPetSpeak { 0%,100%{transform:scale(1)} 50%{transform:scale(1.045) translateY(-1px)} }
        @keyframes tarsPetSocket { 0%,100%{filter:drop-shadow(0 0 2px #f59e0b)} 50%{filter:drop-shadow(0 0 7px #f59e0b)} }
        @keyframes tarsPetListen { from{transform:scale(.96) rotate(-1deg)} to{transform:scale(1.035) rotate(1deg)} }
        @keyframes tarsPetTalk { 0%,100%{transform:scaleY(.55)} 50%{transform:scaleY(1.2)} }
        @keyframes tarsPetThinkDot { 0%,100%{transform:translateY(0);opacity:.35} 50%{transform:translateY(-3px);opacity:1} }
        @keyframes tarsPetPonder { from{transform:translateY(0) rotate(-1deg)} to{transform:translateY(-1px) rotate(1deg)} }
        @keyframes tarsPetFlame { from{transform:scaleX(.7);opacity:.72} to{transform:scaleX(1.12);opacity:1} }
        @keyframes tarsPetSpark { from{transform:translateX(0) scale(1);opacity:1} to{transform:translateX(-15px) scale(0);opacity:0} }
        @keyframes tarsPetSmoke { from{transform:translateX(0) scale(.6);opacity:.36} to{transform:translateX(-22px) scale(1.3);opacity:0} }
        @keyframes tarsPetPulse { from{transform:translate(-50%,-50%) scale(.45);opacity:.62} to{transform:translate(-50%,-50%) scale(1.5);opacity:0} }
        .tars-pet-body:not(.is-hopping):not(.is-dragging) svg { animation:tarsPetBreathe 2.8s ease-in-out infinite; }
        .tars-pet-body .tars-pet-eyes { transform-origin:22px 19px; animation:tarsPetBlink 6.2s ease-in-out infinite; }
        .tars-pet-body.mode-speaking:not(.is-hopping) svg { animation:tarsPetSpeak .78s ease-in-out infinite; }
        .tars-pet-body .tars-pet-socket { animation:tarsPetSocket .55s ease-in-out infinite; }
        .tars-pet-ear { opacity:0;transform-origin:34px 18px;transform:scale(.55);transition:opacity .18s ease,transform .18s ease;filter:drop-shadow(1px 2px 2px rgba(16,18,15,.2)); }
        .mode-listening .tars-pet-ear { opacity:1;animation:tarsPetListen .62s ease-in-out infinite alternate; }
        .tars-pet-speaking-mouth { opacity:0;transform-origin:22px 29px; }
        .mode-speaking .tars-pet-smile { opacity:0; }
        .mode-speaking .tars-pet-speaking-mouth { opacity:1;animation:tarsPetTalk .34s ease-in-out infinite; }
        .tars-pet-thinking-face,.tars-pet-thinking-hand { opacity:0;transition:opacity .15s ease; }
        .mode-thinking .tars-pet-smile { opacity:0; }
        .mode-thinking .tars-pet-thinking-face { opacity:1; }
        .mode-thinking.gesture-perched .tars-pet-thinking-hand,.mode-thinking.gesture-dock .tars-pet-thinking-hand { opacity:1;animation:tarsPetPonder .72s ease-in-out infinite alternate;transform-origin:31px 30px; }
        .tars-pet-thought { position:absolute;right:-11px;top:-11px;display:flex;align-items:flex-end;gap:2px;opacity:0;transition:opacity .16s ease; }
        .tars-pet-thought i { width:5px;height:5px;border-radius:50%;background:#79a925;box-shadow:0 1px 3px rgba(16,18,15,.24);animation:tarsPetThinkDot .72s ease-in-out infinite; }
        .tars-pet-thought i:nth-child(2){width:7px;height:7px;animation-delay:.12s}.tars-pet-thought i:nth-child(3){width:9px;height:9px;animation-delay:.24s}
        .mode-thinking .tars-pet-thought { opacity:1; }
        .tars-pet-label { position:absolute;top:-9px;width:max-content;max-width:min(280px,calc(100vw - 70px));padding:7px 10px;border:1px solid rgba(255,255,255,.18);border-radius:9px;background:#111827;color:#fff;font:600 12px/1.35 Inter,ui-sans-serif,system-ui,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.2);white-space:normal; }
        .tars-pet-label.label-right { left:50px; }.tars-pet-label.label-left { right:50px; }
        .tars-rocket-thrust { position:absolute;left:-18px;top:50%;width:22px;height:16px;transform:translateY(-50%); }
        .tars-rocket-thrust .flame { position:absolute;right:0;top:50%;height:8px;clip-path:polygon(100% 0,0 50%,100% 100%);transform-origin:right center;animation:tarsPetFlame .09s ease-in-out infinite alternate; }
        .tars-rocket-thrust .flame-outer { width:20px;background:#f59e0b; }.tars-rocket-thrust .flame-inner { width:13px;height:4px;margin-top:-2px;background:#d9ff83; }
        .tars-rocket-thrust .spark { position:absolute;right:5px;width:3px;height:3px;border-radius:50%;background:#f59e0b;animation:tarsPetSpark .36s linear infinite; }.spark-one{top:1px}.spark-two{bottom:1px;animation-delay:.17s!important}
        .tars-rocket-thrust .smoke { position:absolute;right:11px;top:6px;width:5px;height:5px;border-radius:50%;background:#d8dbd1;animation:tarsPetSmoke .55s ease-out infinite; }.smoke-two{animation-delay:.25s!important}
        .tars-target-pulse { width:20px;height:20px;border:2px solid rgba(121,169,37,.8);border-radius:50%;transform:translate(-50%,-50%);animation:tarsPetPulse 1s ease-out infinite; }
        @media (prefers-reduced-motion:reduce) { .tars-pet-body svg,.tars-pet-eyes,.tars-pet-ear,.tars-pet-speaking-mouth,.tars-pet-thinking-hand,.tars-pet-thought i,.tars-pet-socket,.tars-target-pulse{animation:none!important}.tars-target-pulse{transform:translate(-50%,-50%);opacity:.45} }
      `}</style>
    </div>
  );
}
