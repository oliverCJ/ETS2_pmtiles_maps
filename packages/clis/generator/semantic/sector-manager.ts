/**
 * Sector Manager for Prefab Semantic Sidecar
 *
 * Manages the spatial partitioning of prefab instances into sectors for efficient
 * loading and querying. Uses a grid-based approach with configurable sector size.
 *
 * @module semantic/sector-manager
 */

import type {
  PrefabSemanticInstance,
  PrefabSemanticSector,
  SectorMetadata,
} from '@truckermudgeon/map/types';

/**
 * Manages spatial partitioning of prefab instances into sectors.
 *
 * @example
 * ```typescript
 * const manager = new SectorManager(2000); // 2km × 2km sectors
 * manager.addPrefab(prefabInstance);
 * const sector = manager.getSector(0, 0);
 * const metadata = manager.getSectorMetadata();
 * ```
 */
export class SectorManager {
  private readonly sectorSize: number;
  private readonly sectors: Map<string, PrefabSemanticInstance[]>;
  private minX: number = Infinity;
  private maxX: number = -Infinity;
  private minY: number = Infinity;
  private maxY: number = -Infinity;

  /**
   * Creates a new SectorManager.
   *
   * @param sectorSize - Size of each sector in map units (e.g., 2000 = 2km × 2km)
   */
  constructor(sectorSize: number) {
    if (sectorSize <= 0) {
      throw new Error('Sector size must be positive');
    }
    this.sectorSize = sectorSize;
    this.sectors = new Map();
  }

  /**
   * Calculates the sector X coordinate for a given map X coordinate.
   *
   * @param x - Map X coordinate
   * @returns Sector X coordinate
   */
  getSectorX(x: number): number {
    return Math.floor(x / this.sectorSize);
  }

  /**
   * Calculates the sector Y coordinate for a given map Y coordinate.
   *
   * @param y - Map Y coordinate
   * @returns Sector Y coordinate
   */
  getSectorY(y: number): number {
    return Math.floor(y / this.sectorSize);
  }

  /**
   * Generates a sector key from coordinates.
   *
   * @param x - Map X coordinate or sector X coordinate
   * @param y - Map Y coordinate or sector Y coordinate
   * @param isMapCoord - If true, treats x/y as map coordinates; otherwise as sector coordinates
   * @returns Sector key in format "sectorX_sectorY"
   */
  getSectorKey(x: number, y: number, isMapCoord: boolean = true): string {
    if (isMapCoord) {
      return `${this.getSectorX(x)}_${this.getSectorY(y)}`;
    }
    return `${x}_${y}`;
  }

  /**
   * Parses a sector key into sector coordinates.
   *
   * @param key - Sector key in format "sectorX_sectorY"
   * @returns Tuple of [sectorX, sectorY]
   * @throws Error if key format is invalid
   */
  parseSectorKey(key: string): [number, number] {
    const parts = key.split('_');
    if (parts.length !== 2) {
      throw new Error(`Invalid sector key format: ${key}`);
    }
    const sectorX = parseInt(parts[0], 10);
    const sectorY = parseInt(parts[1], 10);
    if (isNaN(sectorX) || isNaN(sectorY)) {
      throw new Error(`Invalid sector coordinates in key: ${key}`);
    }
    return [sectorX, sectorY];
  }

  /**
   * Adds a prefab instance to the appropriate sector.
   *
   * @param prefab - Prefab instance to add
   */
  addPrefab(prefab: PrefabSemanticInstance): void {
    const key = this.getSectorKey(prefab.x, prefab.y);

    // Get or create sector
    let sector = this.sectors.get(key);
    if (!sector) {
      sector = [];
      this.sectors.set(key, sector);
    }

    sector.push(prefab);

    // Update bounds
    this.minX = Math.min(this.minX, prefab.x);
    this.maxX = Math.max(this.maxX, prefab.x);
    this.minY = Math.min(this.minY, prefab.y);
    this.maxY = Math.max(this.maxY, prefab.y);
  }

  /**
   * Gets all prefab instances in a specific sector.
   *
   * @param sectorX - Sector X coordinate
   * @param sectorY - Sector Y coordinate
   * @returns Array of prefab instances, or empty array if sector doesn't exist
   */
  getSector(sectorX: number, sectorY: number): PrefabSemanticInstance[] {
    const key = this.getSectorKey(sectorX, sectorY, false);
    return this.sectors.get(key) || [];
  }

  /**
   * Gets a sector as a PrefabSemanticSector object.
   *
   * @param sectorX - Sector X coordinate
   * @param sectorY - Sector Y coordinate
   * @returns PrefabSemanticSector object
   */
  getSectorData(sectorX: number, sectorY: number): PrefabSemanticSector {
    return {
      sectorX,
      sectorY,
      prefabs: this.getSector(sectorX, sectorY),
    };
  }

  /**
   * Gets all sector keys.
   *
   * @returns Array of sector keys
   */
  getSectorKeys(): string[] {
    return Array.from(this.sectors.keys());
  }

  /**
   * Gets the number of sectors.
   *
   * @returns Number of sectors
   */
  getSectorCount(): number {
    return this.sectors.size;
  }

  /**
   * Gets the overall bounding box of all prefabs.
   *
   * @returns Bounding box object
   */
  getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    return {
      minX: this.minX,
      maxX: this.maxX,
      minY: this.minY,
      maxY: this.maxY,
    };
  }

  /**
   * Calculates the bounding box for a specific sector.
   *
   * @param sectorX - Sector X coordinate
   * @param sectorY - Sector Y coordinate
   * @returns Bounding box object
   */
  getSectorBounds(
    sectorX: number,
    sectorY: number,
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    return {
      minX: sectorX * this.sectorSize,
      maxX: (sectorX + 1) * this.sectorSize,
      minY: sectorY * this.sectorSize,
      maxY: (sectorY + 1) * this.sectorSize,
    };
  }

  /**
   * Gets metadata for all sectors.
   *
   * @returns Map of sector keys to metadata
   */
  getSectorMetadata(): Record<string, SectorMetadata> {
    const metadata: Record<string, SectorMetadata> = {};

    for (const [key, prefabs] of this.sectors) {
      const [sectorX, sectorY] = this.parseSectorKey(key);
      metadata[key] = {
        bounds: this.getSectorBounds(sectorX, sectorY),
        prefabCount: prefabs.length,
        file: `sectors/${key}.json`,
      };
    }

    return metadata;
  }

  /**
   * Gets statistics about the managed data.
   *
   * @returns Statistics object
   */
  getStatistics(): {
    totalPrefabs: number;
    totalLaneRoutes: number;
    totalSemaphores: number;
    avgRoutesPerPrefab: number;
  } {
    let totalPrefabs = 0;
    let totalLaneRoutes = 0;
    let totalSemaphores = 0;

    for (const prefabs of this.sectors.values()) {
      totalPrefabs += prefabs.length;
      for (const prefab of prefabs) {
        totalLaneRoutes += prefab.laneRoutes.length;
        totalSemaphores += prefab.semaphores.length;
      }
    }

    return {
      totalPrefabs,
      totalLaneRoutes,
      totalSemaphores,
      avgRoutesPerPrefab:
        totalPrefabs > 0 ? totalLaneRoutes / totalPrefabs : 0,
    };
  }

  /**
   * Clears all sectors and resets bounds.
   */
  clear(): void {
    this.sectors.clear();
    this.minX = Infinity;
    this.maxX = -Infinity;
    this.minY = Infinity;
    this.maxY = -Infinity;
  }
}
