export type Point2 = { x: number; y: number };
export type PetMode = "idle" | "listening" | "thinking" | "speaking";
export type LaunchSide = "left" | "right";
export type RocketGesture =
  | "perched"
  | "ignition"
  | "flight"
  | "point"
  | "return"
  | "dock";

export type TargetGeometry = {
  point: Point2;
  label?: string;
  resolve?: () => Point2 | null;
  rawCoordinate?: boolean;
};

export type RocketPose = Point2 & {
  rotation: number;
  thrust: boolean;
};

export type Perch = Point2;

export const PET_HALF_WIDTH = 22;
export const PET_HALF_HEIGHT = 20;
export const PET_VIEWPORT_PADDING = 28;

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function clampPerch(
  point: Point2,
  viewport: { width: number; height: number },
): Perch {
  return {
    x: clamp(point.x, PET_VIEWPORT_PADDING + PET_HALF_WIDTH, viewport.width - PET_VIEWPORT_PADDING - PET_HALF_WIDTH),
    y: clamp(point.y, PET_VIEWPORT_PADDING + PET_HALF_HEIGHT, viewport.height - PET_VIEWPORT_PADDING - PET_HALF_HEIGHT),
  };
}

export function chooseLaunchSide(perch: Perch, target: Point2): LaunchSide {
  return target.x < perch.x ? "left" : "right";
}

export function shoulderPoint(perch: Perch, side: LaunchSide): Point2 {
  return {
    x: perch.x + (side === "left" ? -18 : 18),
    y: perch.y + 5,
  };
}

export function rocketFlightDuration(from: Point2, to: Point2, returning = false) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return returning
    ? clamp(distance * 0.75, 500, 1000)
    : clamp(distance * 0.9, 600, 1250);
}

export function rocketBezierFrame(
  from: Point2,
  to: Point2,
  rawProgress: number,
  arcScale = 0.12,
) {
  const raw = clamp(rawProgress, 0, 1);
  const t = smoothstep(raw);
  const m = 1 - t;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const arc = Math.min(distance * arcScale, 60);
  const control = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - arc,
  };
  const x = m * m * from.x + 2 * m * t * control.x + t * t * to.x;
  const y = m * m * from.y + 2 * m * t * control.y + t * t * to.y;
  const tangentX = 2 * m * (control.x - from.x) + 2 * t * (to.x - control.x);
  const tangentY = 2 * m * (control.y - from.y) + 2 * t * (to.y - control.y);
  return {
    x,
    y,
    rotation: (Math.atan2(tangentY, tangentX) * 180) / Math.PI,
  };
}

const PERCH_OFFSETS: Point2[] = [
  { x: -96, y: -72 },
  { x: 96, y: -72 },
  { x: -112, y: 64 },
  { x: 112, y: 64 },
  { x: 0, y: 112 },
  { x: -145, y: 0 },
  { x: 145, y: 0 },
];

export function chooseNearbyPerch(
  activity: Point2,
  current: Perch,
  viewport: { width: number; height: number },
  isSafe: (point: Point2) => boolean,
  random = Math.random,
): Perch | null {
  const offset = Math.floor(random() * PERCH_OFFSETS.length);
  for (let index = 0; index < PERCH_OFFSETS.length; index++) {
    const candidateOffset = PERCH_OFFSETS[(index + offset) % PERCH_OFFSETS.length];
    const candidate = clampPerch({
      x: activity.x + candidateOffset.x,
      y: activity.y + candidateOffset.y,
    }, viewport);
    if (Math.hypot(candidate.x - current.x, candidate.y - current.y) < 42) continue;
    if (isSafe(candidate)) return candidate;
  }
  return null;
}
