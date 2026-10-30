export interface TrendPoint { x: number; y: number }
/** Monotone cubic interpolation: smooth joins without inventing extrema between measured amounts. */
export function smoothTrendPath(points: TrendPoint[]): string {
  if (!points.length) return '';
  const start = `M ${points[0].x} ${points[0].y}`;
  if (points.length < 2) return start;
  const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.x - points[i].x));
  const tangent = points.map((_, i) => {
    if (!i) return slopes[0];
    if (i === points.length - 1) return slopes.at(-1)!;
    return slopes[i - 1] * slopes[i] <= 0 ? 0 : 2 / (1 / slopes[i - 1] + 1 / slopes[i]);
  });
  slopes.forEach((slope, i) => {
    if (slope === 0) { tangent[i] = 0; tangent[i + 1] = 0; return; }
    const length = Math.hypot(tangent[i] / slope, tangent[i + 1] / slope);
    if (length > 3) { tangent[i] *= 3 / length; tangent[i + 1] *= 3 / length; }
  });
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index], third = (point.x - previous.x) / 3;
    return `${path} C ${previous.x + third} ${previous.y + tangent[index] * third} ${point.x - third} ${point.y - tangent[index + 1] * third} ${point.x} ${point.y}`;
  }, start);
}
