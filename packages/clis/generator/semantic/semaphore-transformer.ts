/**
 * Semaphore Transformer for Prefab Semantic Sidecar
 *
 * Transforms semaphores from prefab local coordinates to global map coordinates
 * and associates them with lane routes.
 *
 * @module semantic/semaphore-transformer
 */

import { normalizeRadians } from '@truckermudgeon/base/geom';
import { toMapPosition } from '@truckermudgeon/map/prefabs';
import type {
  LaneRoute,
  Node,
  Prefab,
  PrefabDescription,
  TransformedSemaphore,
} from '@truckermudgeon/map/types';

/**
 * Transforms semaphores from prefab local coordinates to global map coordinates.
 *
 * @param prefab - Prefab instance
 * @param prefabDesc - Prefab description
 * @param nodes - Map of node UIDs to Node objects
 * @returns Array of transformed semaphores with global coordinates
 *
 * @example
 * ```typescript
 * const semaphores = transformSemaphores(prefab, prefabDesc, nodesMap);
 * console.log(`Transformed ${semaphores.length} semaphores`);
 * ```
 */
export function transformSemaphores(
  prefab: Prefab,
  prefabDesc: PrefabDescription,
  nodes: ReadonlyMap<string, Node>,
): TransformedSemaphore[] {
  const result: TransformedSemaphore[] = [];

  if (!prefabDesc.semaphores || prefabDesc.semaphores.length === 0) {
    return result;
  }

  // Get origin node for rotation calculation
  const originNodeUid = prefab.nodeUids[0];
  const originNode = nodes.get(originNodeUid.toString(16));
  if (!originNode) {
    return result;
  }

  const prefabOrigin = prefabDesc.nodes[prefab.originNodeIndex];

  for (let i = 0; i < prefabDesc.semaphores.length; i++) {
    const localSemaphore = prefabDesc.semaphores[i];

    // Transform position to global coordinates
    const globalPos = toMapPosition(
      [localSemaphore.x, localSemaphore.y],
      prefab,
      prefabDesc,
      nodes,
    );

    // Calculate global rotation
    const rotationOffset = originNode.rotation - prefabOrigin.rotation;
    const globalRotation = normalizeRadians(
      localSemaphore.rotation + rotationOffset,
    );

    result.push({
      id: localSemaphore.id,
      x: globalPos[0],
      y: globalPos[1],
      rotation: globalRotation,
      type: localSemaphore.type,
      affectedRoutes: [], // Will be filled by associateSemaphoresToRoutes
    });
  }

  return result;
}

/**
 * Associates semaphores with lane routes based on semaphoreIds in routes.
 *
 * @param laneRoutes - Array of lane routes
 * @param semaphores - Array of transformed semaphores
 * @param prefabDesc - Prefab description (for validation)
 *
 * @example
 * ```typescript
 * associateSemaphoresToRoutes(routes, semaphores, prefabDesc);
 * // Now semaphores[i].affectedRoutes contains route IDs
 * ```
 */
export function associateSemaphoresToRoutes(
  laneRoutes: LaneRoute[],
  semaphores: TransformedSemaphore[],
  prefabDesc: PrefabDescription,
): void {
  // Build reverse mapping: semaphoreId -> route IDs
  const semaphoreToRoutes = new Map<number, number[]>();

  for (const route of laneRoutes) {
    for (const semaphoreId of route.semaphoreIds) {
      if (semaphoreId >= 0 && semaphoreId < semaphores.length) {
        if (!semaphoreToRoutes.has(semaphoreId)) {
          semaphoreToRoutes.set(semaphoreId, []);
        }
        semaphoreToRoutes.get(semaphoreId)!.push(route.id);
      }
    }
  }

  // Update semaphores with affected routes
  for (const semaphore of semaphores) {
    const routeIds = semaphoreToRoutes.get(semaphore.id) || [];
    semaphore.affectedRoutes = routeIds;
  }
}

/**
 * Validates semaphore data for consistency.
 *
 * @param semaphores - Array of transformed semaphores
 * @param prefabDesc - Prefab description
 * @returns Array of validation warnings (empty if all valid)
 */
export function validateSemaphores(
  semaphores: TransformedSemaphore[],
  prefabDesc: PrefabDescription,
): string[] {
  const warnings: string[] = [];

  // Check for duplicate IDs
  const idSet = new Set<number>();
  for (const semaphore of semaphores) {
    if (idSet.has(semaphore.id)) {
      warnings.push(`Duplicate semaphore ID: ${semaphore.id}`);
    }
    idSet.add(semaphore.id);
  }

  // Check for semaphores with no affected routes
  for (const semaphore of semaphores) {
    if (semaphore.affectedRoutes.length === 0) {
      warnings.push(
        `Semaphore ${semaphore.id} has no affected routes (may be unused)`,
      );
    }
  }

  // Check type validity (1=traffic light, 2=gate)
  for (const semaphore of semaphores) {
    if (semaphore.type !== 1 && semaphore.type !== 2) {
      warnings.push(
        `Semaphore ${semaphore.id} has invalid type: ${semaphore.type}`,
      );
    }
  }

  return warnings;
}
