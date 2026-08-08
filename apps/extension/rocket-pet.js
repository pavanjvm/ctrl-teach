(function initRocketPet(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CtrlTeachRocketPet = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRocketPet() {
  "use strict";

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const smoothstep = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const chooseLaunchSide = (perch, target) => target.x < perch.x ? "left" : "right";
  const shoulderPoint = (perch, side) => ({
    x: perch.x + (side === "left" ? -18 : 18),
    y: perch.y + 5,
  });
  const flightDuration = (from, to, returning = false) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    return returning
      ? clamp(distance * 0.75, 500, 1000)
      : clamp(distance * 0.9, 600, 1250);
  };
  const bezierFrame = (from, to, rawProgress, arcScale = 0.12) => {
    const raw = clamp(rawProgress, 0, 1);
    const t = smoothstep(raw);
    const m = 1 - t;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const arc = Math.min(distance * arcScale, 60);
    const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc };
    const x = m * m * from.x + 2 * m * t * control.x + t * t * to.x;
    const y = m * m * from.y + 2 * m * t * control.y + t * t * to.y;
    const tangentX = 2 * m * (control.x - from.x) + 2 * t * (to.x - control.x);
    const tangentY = 2 * m * (control.y - from.y) + 2 * t * (to.y - control.y);
    return { x, y, rotation: Math.atan2(tangentY, tangentX) * 180 / Math.PI };
  };
  const clampPerch = (point, viewport) => ({
    x: clamp(point.x, 50, viewport.width - 50),
    y: clamp(point.y, 48, viewport.height - 48),
  });
  const perchOffsets = [
    { x: -96, y: -72 }, { x: 96, y: -72 }, { x: -112, y: 64 },
    { x: 112, y: 64 }, { x: 0, y: 112 }, { x: -145, y: 0 }, { x: 145, y: 0 },
  ];
  const chooseNearbyPerch = (activity, current, viewport, isSafe, random = Math.random) => {
    const offset = Math.floor(random() * perchOffsets.length);
    for (let index = 0; index < perchOffsets.length; index++) {
      const delta = perchOffsets[(index + offset) % perchOffsets.length];
      const candidate = clampPerch({ x: activity.x + delta.x, y: activity.y + delta.y }, viewport);
      if (Math.hypot(candidate.x - current.x, candidate.y - current.y) < 42) continue;
      if (isSafe(candidate)) return candidate;
    }
    return null;
  };

  return {
    bezierFrame,
    chooseLaunchSide,
    chooseNearbyPerch,
    clamp,
    clampPerch,
    flightDuration,
    shoulderPoint,
    smoothstep,
  };
});
