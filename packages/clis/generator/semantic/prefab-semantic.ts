/**
 * Prefab Semantic Sidecar Generator
 *
 * Generates semantic data for prefabs including lane routes and semaphores.
 * Outputs data in a sectored format for efficient spatial queries.
 *
 * @module semantic/prefab-semantic
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  PrefabDescription,
  PrefabInstance,
  Node,
  PrefabSemanticInstance,
  SemanticIndexData,
  SemaphoreIndexData,
} from '@tsn/map/types';
import { SectorManager } from './sector-manager';
import { buildLaneRoutes } from './lane-routes-builder';
import { transformSemaphores } from './semaphore-transformer';

/**
 * Configuration for semantic data generation.
 */
export interface SemanticGeneratorConfig {
  /** Input directory containing parser output */
  inputDir: string;
  /** Output directory for semantic data */
  outputDir: string;
  /** Map name (e.g., 'europe', 'usa') */
  mapName: string;
  /** Sector size in map units (default: 2000 = 2km) */
  sectorSize?: number;
  /** Point simplification tolerance in meters (default: 1.0) */
  simplificationTolerance?: number;
}

/**
 * Statistics collected during generation.
 */
export interface GenerationStats {
  totalPrefabs: number;
  processedPrefabs: number;
  skippedPrefabs: number;
  totalLaneRoutes: number;
  totalSemaphores: number;
  totalSectors: number;
  processingTimeMs: number;
}

/**
 * Generates prefab semantic sidecar data.
 *
 * @param config - Generation configuration
 * @returns Generation statistics
 */
export async function generatePrefabSemantic(
  config: SemanticGeneratorConfig,
): Promise<GenerationStats> {
  const startTime = Date.now();

  console.log('🚀 Starting Prefab Semantic Generation');
  console.log(`   Map: ${config.mapName}`);
  console.log(`   Input: ${config.inputDir}`);
  console.log(`   Output: ${config.outputDir}`);

  // Initialize configuration
  const sectorSize = config.sectorSize ?? 2000;
  const tolerance = config.simplificationTolerance ?? 1.0;

  // Load input data
  console.log('\n📂 Loading input data...');
  const { prefabDescriptions, prefabs, nodes } = loadInputData(config);

  console.log(`   ✓ Loaded ${Object.keys(prefabDescriptions).length} prefab descriptions`);
  console.log(`   ✓ Loaded ${prefabs.length} prefab instances`);
  console.log(`   ✓ Loaded ${nodes.length} nodes`);

  // Initialize sector manager
  const sectorManager = new SectorManager(sectorSize);

  // Initialize statistics
  const stats: GenerationStats = {
    totalPrefabs: prefabs.length,
    processedPrefabs: 0,
    skippedPrefabs: 0,
    totalLaneRoutes: 0,
    totalSemaphores: 0,
    totalSectors: 0,
    processingTimeMs: 0,
  };

  // Process each prefab instance
  console.log('\n🔄 Processing prefabs...');
  const semaphoreIndex: SemaphoreIndexData = { semaphores: {} };

  for (const prefab of prefabs) {
    const description = prefabDescriptions[prefab.token];

    if (!description) {
      stats.skippedPrefabs++;
      continue;
    }

    // Build semantic instance
    const semantic = buildSemanticInstance(
      prefab,
      description,
      nodes,
      tolerance,
    );

    if (!semantic) {
      stats.skippedPrefabs++;
      continue;
    }

    // Add to sector
    sectorManager.addPrefab(semantic);

    // Update statistics
    stats.processedPrefabs++;
    stats.totalLaneRoutes += semantic.laneRoutes.length;
    stats.totalSemaphores += semantic.semaphores.length;

    // Build semaphore index
    for (const semaphore of semantic.semaphores) {
      const compositeKey = `${prefab.uid}_${semaphore.id}`;
      semaphoreIndex.semaphores[compositeKey] = {
        prefabUid: prefab.uid,
        localId: semaphore.id,
        position: semaphore.position,
        type: semaphore.type,
      };
    }

    // Progress indicator
    if (stats.processedPrefabs % 1000 === 0) {
      console.log(`   Processed ${stats.processedPrefabs}/${stats.totalPrefabs} prefabs...`);
    }
  }

  console.log(`   ✓ Processed ${stats.processedPrefabs} prefabs`);
  console.log(`   ✓ Skipped ${stats.skippedPrefabs} prefabs (no description)`);

  // Write output files
  console.log('\n💾 Writing output files...');
  const outputPath = join(config.outputDir, `${config.mapName}-semantic`);
  writeOutputFiles(outputPath, sectorManager, semaphoreIndex);

  stats.totalSectors = sectorManager.getSectorCount();
  stats.processingTimeMs = Date.now() - startTime;

  // Print summary
  printSummary(stats);

  return stats;
}

/**
 * Loads input data from parser output.
 */
function loadInputData(config: SemanticGeneratorConfig): {
  prefabDescriptions: Record<string, PrefabDescription>;
  prefabs: PrefabInstance[];
  nodes: Node[];
} {
  const { inputDir, mapName } = config;

  const prefabDescriptions = JSON.parse(
    readFileSync(join(inputDir, `${mapName}-prefabDescriptions.json`), 'utf-8'),
  ) as Record<string, PrefabDescription>;

  const prefabs = JSON.parse(
    readFileSync(join(inputDir, `${mapName}-prefabs.json`), 'utf-8'),
  ) as PrefabInstance[];

  const nodes = JSON.parse(
    readFileSync(join(inputDir, `${mapName}-nodes.json`), 'utf-8'),
  ) as Node[];

  return { prefabDescriptions, prefabs, nodes };
}

/**
 * Builds a semantic instance from a prefab instance and description.
 */
function buildSemanticInstance(
  prefab: PrefabInstance,
  description: PrefabDescription,
  nodes: Node[],
  tolerance: number,
): PrefabSemanticInstance | null {
  // Build lane routes
  const laneRoutes = buildLaneRoutes(
    description,
    prefab,
    nodes,
    tolerance,
  );

  // Transform semaphores
  const semaphores = transformSemaphores(
    description,
    prefab,
  );

  // Skip if no semantic data
  if (laneRoutes.length === 0 && semaphores.length === 0) {
    return null;
  }

  return {
    uid: prefab.uid,
    token: prefab.token,
    x: prefab.x,
    y: prefab.y,
    rotation: prefab.rotation,
    nodeUids: prefab.nodeUids,
    laneRoutes,
    semaphores,
  };
}

/**
 * Writes output files to disk.
 */
function writeOutputFiles(
  outputPath: string,
  sectorManager: SectorManager,
  semaphoreIndex: SemaphoreIndexData,
): void {
  // Create output directory
  if (!existsSync(outputPath)) {
    mkdirSync(outputPath, { recursive: true });
  }

  const sectorsPath = join(outputPath, 'sectors');
  if (!existsSync(sectorsPath)) {
    mkdirSync(sectorsPath, { recursive: true });
  }

  // Write sector index
  const indexData: SemanticIndexData = {
    version: 1,
    sectorSize: sectorManager.getSectorSize(),
    sectors: sectorManager.getSectorMetadata(),
  };

  writeFileSync(
    join(outputPath, 'index.json'),
    JSON.stringify(indexData, null, 2),
  );

  console.log(`   ✓ Wrote index.json`);

  // Write sector files
  const sectors = sectorManager.getAllSectors();
  for (const [key, data] of sectors.entries()) {
    writeFileSync(
      join(sectorsPath, `${key}.json`),
      JSON.stringify(data, null, 2),
    );
  }

  console.log(`   ✓ Wrote ${sectors.size} sector files`);

  // Write semaphore index
  writeFileSync(
    join(outputPath, 'semaphore-index.json'),
    JSON.stringify(semaphoreIndex, null, 2),
  );

  console.log(`   ✓ Wrote semaphore-index.json`);
}

/**
 * Prints generation summary.
 */
function printSummary(stats: GenerationStats): void {
  console.log('\n✅ Generation Complete');
  console.log(`   Processed: ${stats.processedPrefabs}/${stats.totalPrefabs} prefabs`);
  console.log(`   Lane Routes: ${stats.totalLaneRoutes}`);
  console.log(`   Semaphores: ${stats.totalSemaphores}`);
  console.log(`   Sectors: ${stats.totalSectors}`);
  console.log(`   Time: ${(stats.processingTimeMs / 1000).toFixed(2)}s`);
}
