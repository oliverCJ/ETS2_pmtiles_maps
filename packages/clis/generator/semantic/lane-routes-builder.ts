/**
 * Lane Routes Builder for Prefab Semantic Sidecar
 *
 * Builds lane routes from prefab descriptions by traversing navigation curves
 * and transforming them into global map coordinates.
 *
 * @module semantic/lane-routes-builder
 */

import { assertExists } from '@truckermudgeon/base/assert';
import type { Position } from '@truckermudgeon/base/geom';
import { toSplinePoints } from '@truckermudgeon/base/geom';
import { toMapPosition } from '@truckermudgeon/map/prefabs';
import type {
  LaneRoute,
  Node,
  Prefab,
  PrefabDescription,
} from '@truckermudgeon/map/types';

/**
 * Intermediate structure for building lane routes.
 */
interface LaneRouteBuilder {
  startNodeIndex: number;
  endNodeIndex: number;
  curveIndices: number[];
  points: Position[];
  semaphoreIds: Set<number>;
  type?: 'physical' | 'ai';
}

/**
 * Builds lane routes for a prefab instance.
 *
 * @param prefab - Prefab instance
 * @param prefabDesc - Prefab description
 * @param nodes - Map of node UIDs to Node objects
 * @returns Array of lane routes with global coordinates
 *
 * @example
 * ```typescript
 * const routes = buildLaneRoutes(prefab, prefabDesc, nodesMap);
 * console.log(`Built ${routes.length} lane routes`);
 * ```
 */
export function buildLaneRoutes(
  prefab: Prefab,
  prefabDesc: PrefabDescription,
  nodes: ReadonlyMap<string, Node>,
): LaneRoute[] {
  const routes: LaneRoute[] = [];
  let routeId = 0;

  // Check if navNodes exist (PPD version >= 22)
  if (!prefabDesc.navNodes || prefabDesc.navNodes.length === 0) {
    // Fallback: use node connections for older prefabs
    return buildLaneRoutesFromNodeConnections(
      prefab,
      prefabDesc,
      nodes,
      routeId,
    );
  }

  // Build routes from navNodes
  for (
    let navNodeIndex = 0;
    navNodeIndex < prefabDesc.navNodes.length;
    navNodeIndex++
  ) {
    const navNode = prefabDesc.navNodes[navNodeIndex];

    for (const connection of navNode.connections) {
      const builder: LaneRouteBuilder = {
        startNodeIndex: getStartNodeIndexForNavNode(navNode, prefabDesc),
        endNodeIndex: getEndNodeIndexForNavNode(
          connection.targetNavNodeIndex,
          prefabDesc,
        ),
        curveIndices: connection.curveIndices,
        points: [],
        semaphoreIds: new Set(),
        type: navNode.type,
      };

      // Build points from curves
      for (const curveIdx of connection.curveIndices) {
        if (curveIdx < 0 || curveIdx >= prefabDesc.navCurves.length) {
          continue; // Skip invalid curve indices
        }

        const curve = prefabDesc.navCurves[curveIdx];

        // Generate spline points in local coordinates
        const localPoints = toSplinePoints(curve.start, curve.end);

        // Transform to global coordinates
        for (const localPoint of localPoints) {
          const globalPoint = toMapPosition(
            localPoint,
            prefab,
            prefabDesc,
            nodes,
          );
          builder.points.push(globalPoint);
        }

        // Collect semaphore IDs
        if (
          curve.semaphoreId !== undefined &&
          curve.semaphoreId >= 0 &&
          curve.semaphoreId < prefabDesc.semaphores.length
        ) {
          builder.semaphoreIds.add(curve.semaphoreId);
        }
      }

      // Only add routes with valid points
      if (builder.points.length >= 2) {
        routes.push(finalizeLaneRoute(builder, routeId++));
      }
    }
  }

  return routes;
}

/**
 * Fallback method for building lane routes from node connections (older prefabs).
 */
function buildLaneRoutesFromNodeConnections(
  prefab: Prefab,
  prefabDesc: PrefabDescription,
  nodes: ReadonlyMap<string, Node>,
  startingRouteId: number,
): LaneRoute[] {
  const routes: LaneRoute[] = [];
  let routeId = startingRouteId;

  // Build simple routes from input/output lanes
  for (
    let nodeIndex = 0;
    nodeIndex < prefabDesc.nodes.length;
    nodeIndex++
  ) {
    const node = prefabDesc.nodes[nodeIndex];

    for (const inputLaneIdx of node.inputLanes) {
      if (inputLaneIdx < 0 || inputLaneIdx >= prefabDesc.navCurves.length) {
        continue;
      }

      const curve = prefabDesc.navCurves[inputLaneIdx];
      const builder: LaneRouteBuilder = {
        startNodeIndex: nodeIndex,
        endNodeIndex: findEndNodeForCurve(inputLaneIdx, prefabDesc),
        curveIndices: [inputLaneIdx],
        points: [],
        semaphoreIds: new Set(),
      };

      // Generate points
      const localPoints = toSplinePoints(curve.start, curve.end);
      for (const localPoint of localPoints) {
        const globalPoint = toMapPosition(localPoint, prefab, prefabDesc, nodes);
        builder.points.push(globalPoint);
      }

      // Collect semaphore ID
      if (
        curve.semaphoreId !== undefined &&
        curve.semaphoreId >= 0 &&
        curve.semaphoreId < prefabDesc.semaphores.length
      ) {
        builder.semaphoreIds.add(curve.semaphoreId);
      }

      if (builder.points.length >= 2) {
        routes.push(finalizeLaneRoute(builder, routeId++));
      }
    }
  }

  return routes;
}

/**
 * Finds the ending node index for a given curve.
 */
function findEndNodeForCurve(
  curveIdx: number,
  prefabDesc: PrefabDescription,
): number {
  for (let nodeIdx = 0; nodeIdx < prefabDesc.nodes.length; nodeIdx++) {
    const node = prefabDesc.nodes[nodeIdx];
    if (node.outputLanes.includes(curveIdx)) {
      return nodeIdx;
    }
  }
  return -1; // Not found
}

/**
 * Gets the starting node index for a navNode.
 */
function getStartNodeIndexForNavNode(
  navNode: { type: 'physical' | 'ai'; endIndex: number },
  prefabDesc: PrefabDescription,
): number {
  if (navNode.type === 'physical') {
    return navNode.endIndex;
  }
  // For AI nodes, try to find the corresponding physical node
  // This is a simplification; actual logic may be more complex
  return 0;
}

/**
 * Gets the ending node index for a target navNode.
 */
function getEndNodeIndexForNavNode(
  targetNavNodeIndex: number,
  prefabDesc: PrefabDescription,
): number {
  if (
    targetNavNodeIndex < 0 ||
    targetNavNodeIndex >= prefabDesc.navNodes.length
  ) {
    return -1;
  }

  const targetNavNode = prefabDesc.navNodes[targetNavNodeIndex];
  if (targetNavNode.type === 'physical') {
    return targetNavNode.endIndex;
  }

  return -1;
}

/**
 * Finalizes a lane route builder into a LaneRoute object.
 */
function finalizeLaneRoute(
  builder: LaneRouteBuilder,
  routeId: number,
): LaneRoute {
  const points2D: [number, number][] = builder.points.map(p => [p[0], p[1]]);

  return {
    id: routeId,
    startNodeIndex: builder.startNodeIndex,
    endNodeIndex: builder.endNodeIndex,
    points: points2D,
    semaphoreIds: Array.from(builder.semaphoreIds),
    bearing: calculateBearing(points2D),
    length: calculateLength(points2D),
    curveIndices: builder.curveIndices,
    type: builder.type,
  };
}

/**
 * Calculates the initial bearing of a route in degrees (0-360).
 * 0 = North, 90 = East, 180 = South, 270 = West.
 */
function calculateBearing(points: [number, number][]): number {
  if (points.length < 2) {
    return 0;
  }

  const [x1, y1] = points[0];
  const [x2, y2] = points[1];

  const dx = x2 - x1;
  const dy = y2 - y1;

  // Calculate angle in radians, then convert to degrees
  // atan2(dy, dx) gives angle from East (0°)
  // We want angle from North (0°), so adjust
  let bearing = Math.atan2(dx, dy) * (180 / Math.PI);

  // Normalize to 0-360
  if (bearing < 0) {
    bearing += 360;
  }

  return bearing;
}

/**
 * Calculates the total length of a route in meters.
 */
function calculateLength(points: [number, number][]): number {
  if (points.length < 2) {
    return 0;
  }

  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  return totalLength;
}
