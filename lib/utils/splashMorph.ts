/** Shared by the UI worklet and continuity tests. All contours keep the same 8 cubic segments. */
export const SPLASH_DURATION_MS = 1800;

export function smoothProgress(value: number, start = 0, end = 1): number {
  'worklet';
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  // Zero first and second derivatives at both ends: no velocity reset at a stage boundary.
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function oval(cx: number, cy: number, rx: number, ry: number): number[] {
  const result: number[] = [];
  const step = Math.PI / 4;
  const k = 4 / 3 * Math.tan(step / 4);
  const first = -3 * Math.PI / 4;
  result.push(cx + rx * Math.cos(first), cy + ry * Math.sin(first));
  for (let i = 0; i < 8; i++) {
    const a = first + i * step, b = a + step;
    result.push(cx + rx * (Math.cos(a) - k * Math.sin(a)), cy + ry * (Math.sin(a) + k * Math.cos(a)),
      cx + rx * (Math.cos(b) + k * Math.sin(b)), cy + ry * (Math.sin(b) - k * Math.cos(b)),
      cx + rx * Math.cos(b), cy + ry * Math.sin(b));
  }
  return result;
}

function capsule(x: number, y: number, w: number, h: number, rotation = 0): number[] {
  const r = Math.min(w, h) / 2, k = r * 0.5522847498;
  const points = [x + r, y,
    x + r, y, x + w - r, y, x + w - r, y,
    x + w - r + k, y, x + w, y + r - k, x + w, y + r,
    x + w, y + r, x + w, y + h - r, x + w, y + h - r,
    x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h,
    x + w - r, y + h, x + r, y + h, x + r, y + h,
    x + r - k, y + h, x, y + h - r + k, x, y + h - r,
    x, y + h - r, x, y + r, x, y + r,
    x, y + r - k, x + r - k, y, x + r, y];
  const angle = rotation * Math.PI / 180, cx = x + w / 2, cy = y + h / 2;
  return points.map((value, i) => i % 2 === 0
    ? cx + (value - cx) * Math.cos(angle) - (points[i + 1] - cy) * Math.sin(angle)
    : cy + (points[i - 1] - cx) * Math.sin(angle) + (value - cy) * Math.cos(angle));
}

// Overlapping subpaths share ONE gradient, so the opening blob has no internal seams.
const FROM = [oval(59, 75, 29, 37), oval(77, 56, 31, 28), oval(87, 83, 31, 30)];
const TO = [capsule(25, 26, 41, 93), capsule(65.5, 24, 45, 45), capsule(72, 61.5, 40, 65, -45)];
const START = [0.02, 0.06, 0.1];
const END = [0.79, 0.75, 0.83];

export function splashContours(progress: number): number[][] {
  'worklet';
  return FROM.map((from, part) => {
    const t = smoothProgress(progress, START[part], END[part]);
    // A small curved trajectory carries the pieces apart without a separate bounce animation.
    const drift = Math.sin(Math.PI * t) * (part === 2 ? 6 : -5);
    return from.map((value, i) => value + (TO[part][i] - value) * t + (i % 2 ? drift : 0));
  });
}

export function splashPath(progress: number): string {
  'worklet';
  return splashContours(progress).map(points => {
    let path = `M${points[0]},${points[1]}`;
    for (let i = 2; i < points.length; i += 6) path += `C${points[i]},${points[i + 1]} ${points[i + 2]},${points[i + 3]} ${points[i + 4]},${points[i + 5]}`;
    return `${path}Z`;
  }).join(' ');
}
