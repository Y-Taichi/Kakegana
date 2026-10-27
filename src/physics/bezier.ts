export interface Point {
  x: number;
  y: number;
}

/**
 * 2つの点の中点
 */
export function midPoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

/**
 * 2点間の距離
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

/**
 * 二次ベジェ曲線のサンプリング (Quadratic Bezier)
 */
export function sampleQuadBezier(p0: Point, p1: Point, p2: Point, steps = 8): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
    const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
    points.push({ x, y });
  }
  return points;
}

/**
 * 三次ベジェ曲線のサンプリング (Cubic Bezier)
 */
export function sampleCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, steps = 10): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const x = mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x;
    const y = mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y;
    points.push({ x, y });
  }
  return points;
}

/**
 * 近すぎる連続する重複点を除去して整理する
 */
export function simplifyPoints(points: Point[], minDistance = 3.5): Point[] {
  if (points.length <= 1) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    if (distance(prev, curr) >= minDistance || i === points.length - 1) {
      result.push(curr);
    }
  }
  return result;
}
