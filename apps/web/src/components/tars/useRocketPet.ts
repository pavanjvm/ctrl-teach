"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  chooseLaunchSide,
  chooseNearbyPerch,
  clampPerch,
  rocketBezierFrame,
  rocketFlightDuration,
  shoulderPoint,
  smoothstep,
  type LaunchSide,
  type Perch,
  type PetMode,
  type Point2,
  type RocketGesture,
  type RocketPose,
  type TargetGeometry,
} from "@/lib/tars/petMotion";

type LaunchOptions = {
  onLand?: () => void;
};

type UseRocketPetOptions = {
  initialPerch: Perch;
  mode: PetMode;
  roaming: boolean;
};

type SegmentOptions = {
  from: Point2;
  to: Point2;
  duration: number;
  returning?: boolean;
  token: number;
  resolveTarget?: () => Point2 | null;
  onTargetLost?: () => void;
  onFrame: (pose: RocketPose) => void;
  onDone: (point: Point2) => void;
};

const ACTIONABLE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[role='menuitem']",
].join(",");

function isSafeBrowserPerch(point: Point2) {
  const element = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
  if (!element) return true;
  if (element.closest("[data-global-tars='true'],[data-tars-pet='true']")) return false;
  if (element.closest(ACTIONABLE_SELECTOR)) return false;
  const rect = element.getBoundingClientRect();
  const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  return text.length < 48 || rect.width * rect.height > 180_000;
}

export function useRocketPet({ initialPerch, mode, roaming }: UseRocketPetOptions) {
  const [perch, setPerchState] = useState(initialPerch);
  const [gesture, setGesture] = useState<RocketGesture>("perched");
  const [rocket, setRocketState] = useState<RocketPose | null>(null);
  const [launchSide, setLaunchSide] = useState<LaunchSide | null>(null);
  const [label, setLabel] = useState("");
  const [hopping, setHopping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [activity, setActivity] = useState<Point2>(initialPerch);
  const perchRef = useRef(perch);
  const rocketRef = useRef<RocketPose | null>(null);
  const sideRef = useRef<LaunchSide | null>(null);
  const activityRef = useRef<Point2>(initialPerch);
  const tokenRef = useRef(0);
  const rocketRafRef = useRef<number | null>(null);
  const perchRafRef = useRef<number | null>(null);
  const activityRafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const activeRawCoordinateRef = useRef(false);

  const setRocket = useCallback((next: RocketPose | null) => {
    rocketRef.current = next;
    setRocketState(next);
  }, []);

  const setPerch = useCallback((next: Perch) => {
    perchRef.current = next;
    setPerchState(next);
  }, []);

  const beginDrag = useCallback(() => {
    if (perchRafRef.current !== null) cancelAnimationFrame(perchRafRef.current);
    perchRafRef.current = null;
    setHopping(false);
    setDragging(true);
  }, []);

  const dragTo = useCallback((next: Perch) => {
    setPerch(clampPerch(next, { width: window.innerWidth, height: window.innerHeight }));
  }, [setPerch]);

  const endDrag = useCallback(() => {
    setDragging(false);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const later = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
    return timer;
  }, []);

  const stopRocketFrame = useCallback(() => {
    if (rocketRafRef.current !== null) cancelAnimationFrame(rocketRafRef.current);
    rocketRafRef.current = null;
  }, []);

  const animateSegment = useCallback((options: SegmentOptions) => {
    stopRocketFrame();
    if (reducedMotion) {
      const resolved = options.resolveTarget ? options.resolveTarget() : options.to;
      if (!resolved) {
        options.onTargetLost?.();
        return;
      }
      options.onFrame({
        ...resolved,
        rotation: (Math.atan2(resolved.y - options.from.y, resolved.x - options.from.x) * 180) / Math.PI,
        thrust: false,
      });
      later(() => options.onDone(resolved), 120);
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      if (options.token !== tokenRef.current) return;
      const raw = Math.min((now - started) / options.duration, 1);
      const trackedTarget = raw >= 0.65 && options.resolveTarget
        ? options.resolveTarget()
        : options.to;
      if (!trackedTarget) {
        rocketRafRef.current = null;
        options.onTargetLost?.();
        return;
      }
      const frame = rocketBezierFrame(
        options.from,
        trackedTarget,
        raw,
        options.returning ? 0.08 : 0.12,
      );
      options.onFrame({ ...frame, thrust: raw < 0.96 });
      if (raw < 1) rocketRafRef.current = requestAnimationFrame(step);
      else {
        rocketRafRef.current = null;
        options.onDone(trackedTarget);
      }
    };
    rocketRafRef.current = requestAnimationFrame(step);
  }, [later, reducedMotion, stopRocketFrame]);

  const finishDock = useCallback((token: number) => {
    if (token !== tokenRef.current) return;
    setGesture("dock");
    later(() => {
      if (token !== tokenRef.current) return;
      setRocket(null);
      setLaunchSide(null);
      sideRef.current = null;
      setLabel("");
      setGesture("perched");
      activeRawCoordinateRef.current = false;
    }, reducedMotion ? 30 : 140);
  }, [later, reducedMotion, setRocket]);

  const returnToShoulder = useCallback((token: number, side: LaunchSide) => {
    if (token !== tokenRef.current) return;
    const from = rocketRef.current ?? shoulderPoint(perchRef.current, side);
    const to = shoulderPoint(perchRef.current, side);
    setGesture("return");
    animateSegment({
      from,
      to,
      duration: rocketFlightDuration(from, to, true),
      returning: true,
      token,
      resolveTarget: () => shoulderPoint(perchRef.current, side),
      onFrame: setRocket,
      onDone: () => finishDock(token),
    });
  }, [animateSegment, finishDock, setRocket]);

  const recall = useCallback(() => {
    tokenRef.current += 1;
    const token = tokenRef.current;
    clearTimers();
    stopRocketFrame();
    setLabel("");
    activeRawCoordinateRef.current = false;
    if (!rocketRef.current || !sideRef.current) {
      setRocket(null);
      setLaunchSide(null);
      sideRef.current = null;
      setGesture("perched");
      return;
    }
    returnToShoulder(token, sideRef.current);
  }, [clearTimers, returnToShoulder, setRocket, stopRocketFrame]);

  const launch = useCallback((target: TargetGeometry, options: LaunchOptions = {}) => {
    tokenRef.current += 1;
    const token = tokenRef.current;
    clearTimers();
    stopRocketFrame();
    if (perchRafRef.current !== null) cancelAnimationFrame(perchRafRef.current);
    perchRafRef.current = null;
    setHopping(false);

    const resolvedTarget = target.resolve ? target.resolve() : target.point;
    if (!resolvedTarget) {
      recall();
      return;
    }
    const alreadyDetached = Boolean(rocketRef.current && sideRef.current);
    const side = sideRef.current ?? chooseLaunchSide(perchRef.current, resolvedTarget);
    const from = rocketRef.current ?? shoulderPoint(perchRef.current, side);
    sideRef.current = side;
    setLaunchSide(side);
    setLabel(target.label || "right here");
    setGesture(alreadyDetached ? "flight" : "ignition");
    activeRawCoordinateRef.current = Boolean(target.rawCoordinate);

    const beginFlight = () => {
      if (token !== tokenRef.current) return;
      setGesture("flight");
      animateSegment({
        from,
        to: resolvedTarget,
        duration: rocketFlightDuration(from, resolvedTarget),
        token,
        resolveTarget: target.resolve,
        onTargetLost: recall,
        onFrame: setRocket,
        onDone: (landedPoint) => {
          if (token !== tokenRef.current) return;
          const rotation = (Math.atan2(landedPoint.y - perchRef.current.y, landedPoint.x - perchRef.current.x) * 180) / Math.PI;
          setRocket({ ...landedPoint, rotation, thrust: false });
          setGesture("point");
          options.onLand?.();
          if (target.resolve && !reducedMotion) {
            const trackTarget = () => {
              if (token !== tokenRef.current) return;
              const tracked = target.resolve?.();
              if (tracked) {
                const trackedRotation = (Math.atan2(tracked.y - perchRef.current.y, tracked.x - perchRef.current.x) * 180) / Math.PI;
                setRocket({ ...tracked, rotation: trackedRotation, thrust: false });
              } else {
                recall();
                return;
              }
              rocketRafRef.current = requestAnimationFrame(trackTarget);
            };
            rocketRafRef.current = requestAnimationFrame(trackTarget);
          }
          const hold = Math.min(Math.max((target.label?.length ?? 10) * 24 + 800, 1200), 7000);
          later(() => returnToShoulder(token, side), hold);
        },
      });
    };

    if (alreadyDetached || reducedMotion) beginFlight();
    else later(beginFlight, 180);
  }, [animateSegment, clearTimers, later, recall, reducedMotion, returnToShoulder, setRocket, stopRocketFrame]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      activityRef.current = { x: event.clientX, y: event.clientY };
      if (activityRafRef.current !== null) return;
      activityRafRef.current = requestAnimationFrame(() => {
        activityRafRef.current = null;
        setActivity(activityRef.current);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (activityRafRef.current !== null) cancelAnimationFrame(activityRafRef.current);
      activityRafRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!roaming || reducedMotion || mode !== "idle" || gesture !== "perched" || dragging) return;
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        const next = chooseNearbyPerch(
          activityRef.current,
          perchRef.current,
          { width: window.innerWidth, height: window.innerHeight },
          isSafeBrowserPerch,
        );
        if (!next) {
          schedule();
          return;
        }
        const from = perchRef.current;
        const started = performance.now();
        setHopping(true);
        const step = (now: number) => {
          if (cancelled || gesture !== "perched") return;
          const raw = Math.min((now - started) / 460, 1);
          const t = smoothstep(raw);
          setPerch({
            x: from.x + (next.x - from.x) * t,
            y: from.y + (next.y - from.y) * t - Math.sin(raw * Math.PI) * 18,
          });
          if (raw < 1) perchRafRef.current = requestAnimationFrame(step);
          else {
            perchRafRef.current = null;
            setPerch(next);
            setHopping(false);
            schedule();
          }
        };
        perchRafRef.current = requestAnimationFrame(step);
      }, 8000 + Math.random() * 6000);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (perchRafRef.current !== null) cancelAnimationFrame(perchRafRef.current);
      perchRafRef.current = null;
      setHopping(false);
    };
  }, [dragging, gesture, mode, reducedMotion, roaming, setPerch]);

  useEffect(() => {
    const onViewportChange = () => {
      setPerch(clampPerch(perchRef.current, { width: window.innerWidth, height: window.innerHeight }));
      if (activeRawCoordinateRef.current) recall();
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [recall, setPerch]);

  useEffect(() => () => {
    tokenRef.current += 1;
    clearTimers();
    stopRocketFrame();
    if (perchRafRef.current !== null) cancelAnimationFrame(perchRafRef.current);
  }, [clearTimers, stopRocketFrame]);

  const gazeTarget = rocket ?? activity;

  return {
    perch,
    setPerch,
    gesture,
    rocket,
    launchSide,
    label,
    hopping,
    dragging,
    reducedMotion,
    gazeTarget,
    launch,
    recall,
    beginDrag,
    dragTo,
    endDrag,
  };
}
