/**
 * Point Simplifier for Prefab Semantic Sidecar
 *
 * Implements the Douglas-Peucker algorithm to simplify polylines while
 * preserving their shape within a specified tolerance.
 *
 * @module semantic/point-simplifier
 */

/**
 * Simplifies a polyline using the Douglas-Peucker algorithm.
 *
 * @param points - Array of points [x, y]
 * @param tolerance - Maximum distance from the simplified line (in map units)
 * @returns Simplified array of points
 *
 * @example
 * ```typescript
 * const simplified = simplifyPoints(
 *   [[0, 0], [1, 0.1], [2, -0.1], [3, 0]],
 *   0.5
 * );
 * // Returns [[0, 0], [3, 0]] if all intermediate points are within tolerance
 * ```
 */
export function simplifyPoints(
  points: [number, number][],
  tolerance: number,
): [number, number][] {
  if (points.length <= 2) {
    return points;
  }

  if (tolerance <= 0) {
    return points;
  }

  return douglasPeucker(points, tolerance);
}

/**
 * Douglas-Peucker algorithm implementation.
 *
 * @param points - Array of points
 * @param tolerance - Tolerance value
 * @returns Simplified points
 */
function douglasPeucker(
  points: [number, number][],
  tolerance: number,
): [number, number][] {
  if (points.length <= 2) {
    return points;
  }

  // Find the point with maximum distance from the line segment
  let maxDistance = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    // Recursive call on both segments
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);

    // Concatenate results (remove duplicate point at maxIndex)
    return [...left.slice(0, -1), ...right];
  } else {
    // All points are within tolerance, return only endpoints
    return [start, end];
  }
}

/**
 * Calculates the perpendicular distance from a point to a line segment.
 *
 * @param point - The point [x, y]
 * @param lineStart - Start of the line segment [x, y]
 * @param lineEnd - End of the line segment [x, y]
 * @returns Perpendicular distance
 */
function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number],
): number {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // Handle degenerate case where line segment is a point
  if (dx === 0 && dy === 0) {
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }

  // Calculate perpendicular distance using cross product
  const numerator = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(dx * dx + dy * dy);

  return numerator / denominator;
}

/**
 * Calculates the reduction percentage after simplification.
 *
 * @param originalCount - Original point count
 * @param simplifiedCount - Simplified point count
 * @returns Reduction percentage (0-100)
 */
export function calculateReduction(
  originalCount: number,
  simplifiedCount: number,
): number {
  if (originalCount === 0) {
    return 0;
  }
  return ((originalCount - simplifiedCount) / originalCount) * 100;
}

/**
 * Batch simplifies multiple polylines.
 *
 * @param polylines - Array of polylines
 * @param tolerance - Tolerance value
 * @returns Array of simplified polylines
 */
export function simplifyBatch(
  polylines: [number, number][][],
  tolerance: number,
): [number, number][][] {
  return polylines.map(points => simplifyPoints(points, tolerance));
}
