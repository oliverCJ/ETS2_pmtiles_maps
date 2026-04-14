# NavCurves Prefab Road Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mapPoints-based prefab road generation with navCurves-based generation so that divided roads, forks, and junctions render correctly without gaps or misaligned endpoints.

**Architecture:** Add `toNavCurveRoadStrings()` and `toNavLanes()` to `prefabs.ts` by reusing the existing `getLane`/`getCurvePaths` internals; wire the new function into `prefabToFeatures()` in `map.ts`; add an orange debug layer to `Preview.tsx` for visual comparison.

**Tech Stack:** TypeScript, `@truckermudgeon/base/geom` (toSplinePoints, distance, midPoint), `@turf/simplify`, vitest

---

## File Map

| File | Change |
|---|---|
| `packages/libs/map/prefabs.ts` | Add `NavCurveRoadString`, `NavLane` interfaces + `toNavCurveRoadStrings()`, `toNavLanes()` exports |
| `packages/libs/map/tests/prefabs.test.ts` | Add tests for `toNavCurveRoadStrings` and `toNavLanes` |
| `packages/clis/generator/geo-json/map.ts` | Pre-compute nav roads map; pass to `prefabToFeatures()`; use nav roads instead of mapPoints roads |
| `packages/apps/prefabs/src/Preview.tsx` | Import `toNavCurveRoadStrings`; render orange polylines for nav roads |

---

## Task 1: Add `toNavCurveRoadStrings` and `toNavLanes` to `prefabs.ts`

**Files:**
- Modify: `packages/libs/map/prefabs.ts` (after line 635, after `calculateLaneInfo`)

- [ ] **Step 1: Add the two new interfaces and `toNavLanes` after line 635**

Insert the following block immediately after the closing brace of `calculateLaneInfo` (after line 635):

```typescript
export interface NavCurveRoadString {
  /** Spline points in prefab-local coordinate space */
  points: [number, number][];
  sourceNodeIndex: number;
  targetNodeIndex: number;
  /** Lanes travelling target→source direction (0 = one-way road) */
  leftLaneCount: number;
  /** Lanes travelling source→target direction */
  rightLaneCount: number;
}

export interface NavLane {
  /** Full spline points for this single lane, in prefab-local space */
  curvePoints: [number, number][];
  sourceNodeIndex: number;
  targetNodeIndex: number;
}

/**
 * Returns every individual nav-curve lane as a flat list.
 * Use this for navigation graph edges (one entry per lane per direction).
 */
export function toNavLanes(prefabDesc: PrefabDescription): NavLane[] {
  const lanes: NavLane[] = [];
  for (
    let nodeIndex = 0;
    nodeIndex < prefabDesc.nodes.length;
    nodeIndex++
  ) {
    const node = prefabDesc.nodes[nodeIndex];
    for (const inputLaneIndex of node.inputLanes) {
      const lane = getLane(prefabDesc, inputLaneIndex);
      for (const branch of lane.branches) {
        lanes.push({
          curvePoints: branch.curvePoints,
          sourceNodeIndex: nodeIndex,
          targetNodeIndex: branch.targetNodeIndex,
        });
      }
    }
  }
  return lanes;
}

/**
 * Returns one road string per (sourceNode, targetNode) pair, using the
 * median nav-curve lane as the visual centerline.
 * Bidirectional pairs whose median curves are ≤7 units apart are merged
 * into a single road string with leftLaneCount + rightLaneCount set.
 */
export function toNavCurveRoadStrings(
  prefabDesc: PrefabDescription,
): NavCurveRoadString[] {
  // Step 1: group all lane paths by (sourceNodeIndex, targetNodeIndex)
  const laneGroups = new Map<string, { paths: [number, number][][]; src: number; dst: number }>();
  for (
    let nodeIndex = 0;
    nodeIndex < prefabDesc.nodes.length;
    nodeIndex++
  ) {
    const node = prefabDesc.nodes[nodeIndex];
    for (const inputLaneIndex of node.inputLanes) {
      const lane = getLane(prefabDesc, inputLaneIndex);
      for (const branch of lane.branches) {
        const key = `${nodeIndex}-${branch.targetNodeIndex}`;
        if (!laneGroups.has(key)) {
          laneGroups.set(key, {
            paths: [],
            src: nodeIndex,
            dst: branch.targetNodeIndex,
          });
        }
        laneGroups.get(key)!.paths.push(branch.curvePoints);
      }
    }
  }

  // Step 2: build directed road strings (one per group, median lane)
  const directed = new Map<
    string,
    { points: [number, number][]; src: number; dst: number; count: number }
  >();
  for (const [key, { paths, src, dst }] of laneGroups) {
    const medianPath = paths[Math.floor(paths.length / 2)];
    directed.set(key, { points: medianPath, src, dst, count: paths.length });
  }

  // Step 3: merge bidirectional pairs
  const result: NavCurveRoadString[] = [];
  const processed = new Set<string>();

  for (const [key, fwd] of directed) {
    if (processed.has(key)) continue;
    processed.add(key);

    const revKey = `${fwd.dst}-${fwd.src}`;
    processed.add(revKey);

    const rev = directed.get(revKey);
    if (!rev) {
      // one-way connection
      result.push({
        points: fwd.points,
        sourceNodeIndex: fwd.src,
        targetNodeIndex: fwd.dst,
        leftLaneCount: 0,
        rightLaneCount: fwd.count,
      });
      continue;
    }

    // measure lateral separation at midpoints
    const fwdMid = fwd.points[Math.floor(fwd.points.length / 2)];
    const revMid = rev.points[Math.floor(rev.points.length / 2)];
    const lateralDist = distance(fwdMid, revMid);

    // threshold: ~1.5 lane widths (4.5 units/lane)
    const DIVIDED_THRESHOLD = 7;
    if (lateralDist <= DIVIDED_THRESHOLD) {
      // undivided bidirectional road — merge
      result.push({
        points: fwd.points,
        sourceNodeIndex: fwd.src,
        targetNodeIndex: fwd.dst,
        leftLaneCount: rev.count,
        rightLaneCount: fwd.count,
      });
    } else {
      // divided road — keep both as one-way strings
      result.push({
        points: fwd.points,
        sourceNodeIndex: fwd.src,
        targetNodeIndex: fwd.dst,
        leftLaneCount: 0,
        rightLaneCount: fwd.count,
      });
      result.push({
        points: rev.points,
        sourceNodeIndex: rev.src,
        targetNodeIndex: rev.dst,
        leftLaneCount: 0,
        rightLaneCount: rev.count,
      });
    }
  }

  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npx tsc -p packages/libs/map/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/libs/map/prefabs.ts
git commit -m "feat(map): add toNavCurveRoadStrings and toNavLanes to prefabs.ts"
```

---

## Task 2: Unit tests for `toNavCurveRoadStrings` and `toNavLanes`

**Files:**
- Modify: `packages/libs/map/tests/prefabs.test.ts`
- Read: `packages/libs/map/tests/fixtures.ts` (existing fixtures — `prefab_2o0ds` is a T-junction with 3 nodes; `prefab_2o09g` has 2 nodes, one-way connections)

- [ ] **Step 1: Add imports and tests**

Append to `packages/libs/map/tests/prefabs.test.ts`:

```typescript
import {
  calculateNodeConnections,
  toNavCurveRoadStrings,
  toNavLanes,
} from '../prefabs';
import {
  prefab_2k031,
  prefab_2o09g,
  prefab_2o0ds,
  prefab_mt_2o004,
} from './fixtures';

describe('toNavLanes', () => {
  it('returns one entry per lane per direction', () => {
    // prefab_2o0ds: T-junction, 3 nodes
    // node0 inputLanes=[26], node1 inputLanes=[12,19], node2 inputLanes=[25,27]
    // total input lanes = 5, each may branch to 1-2 targets
    const lanes = toNavLanes(prefab_2o0ds);
    expect(lanes.length).toBeGreaterThan(0);
    for (const lane of lanes) {
      expect(lane.curvePoints.length).toBeGreaterThan(1);
      expect(lane.sourceNodeIndex).toBeGreaterThanOrEqual(0);
      expect(lane.targetNodeIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not throw on roundabout prefab', () => {
    expect(() => toNavLanes(prefab_2k031)).not.toThrow();
  });
});

describe('toNavCurveRoadStrings', () => {
  it('returns at least one road string for a T-junction', () => {
    const result = toNavCurveRoadStrings(prefab_2o0ds);
    expect(result.length).toBeGreaterThan(0);
  });

  it('every road string has valid node indices', () => {
    const result = toNavCurveRoadStrings(prefab_2o0ds);
    const nodeCount = prefab_2o0ds.nodes.length; // 3
    for (const rs of result) {
      expect(rs.sourceNodeIndex).toBeGreaterThanOrEqual(0);
      expect(rs.sourceNodeIndex).toBeLessThan(nodeCount);
      expect(rs.targetNodeIndex).toBeGreaterThanOrEqual(0);
      expect(rs.targetNodeIndex).toBeLessThan(nodeCount);
      expect(rs.points.length).toBeGreaterThan(1);
    }
  });

  it('every road string has non-negative lane counts', () => {
    const result = toNavCurveRoadStrings(prefab_2o0ds);
    for (const rs of result) {
      expect(rs.leftLaneCount).toBeGreaterThanOrEqual(0);
      expect(rs.rightLaneCount).toBeGreaterThanOrEqual(0);
      // at least one direction must have lanes
      expect(rs.leftLaneCount + rs.rightLaneCount).toBeGreaterThan(0);
    }
  });

  it('prefab_2o09g one-way connections produce leftLaneCount=0 entries', () => {
    // prefab_2o09g: node0→node2 and node1→node2 only (no reverse)
    const result = toNavCurveRoadStrings(prefab_2o09g);
    expect(result.length).toBeGreaterThan(0);
    // all connections are one-way, so no entry should have leftLaneCount > 0
    // (there is no reverse path from node2 back to node0 or node1)
    const oneWay = result.filter(rs => rs.leftLaneCount === 0);
    expect(oneWay.length).toBeGreaterThan(0);
  });

  it('does not throw on roundabout prefab', () => {
    expect(() => toNavCurveRoadStrings(prefab_2k031)).not.toThrow();
    const result = toNavCurveRoadStrings(prefab_2k031);
    expect(result.length).toBeGreaterThan(0);
  });

  it('snapshot: T-junction road strings are stable', () => {
    const result = toNavCurveRoadStrings(prefab_2o0ds);
    // strip points for a stable structural snapshot
    const structural = result.map(rs => ({
      sourceNodeIndex: rs.sourceNodeIndex,
      targetNodeIndex: rs.targetNodeIndex,
      leftLaneCount: rs.leftLaneCount,
      rightLaneCount: rs.rightLaneCount,
      pointCount: rs.points.length,
    }));
    expect(structural).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run tests — expect them to pass**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npm run test --workspace=packages/libs/map -- --run
```

Expected: all tests pass, snapshot written on first run.

- [ ] **Step 3: Commit**

```bash
git add packages/libs/map/tests/prefabs.test.ts
git commit -m "test(map): add unit tests for toNavCurveRoadStrings and toNavLanes"
```

---

## Task 3: Wire `toNavCurveRoadStrings` into `map.ts`

**Files:**
- Modify: `packages/clis/generator/geo-json/map.ts`

The key locations in this file:
- Line 14-18: imports from `@truckermudgeon/map/prefabs`
- Line 263-265: `prefabComponents` pre-computation
- Line 276-298: first pass over `prefabs.values()` calling `prefabToFeatures`
- Line 1098: `prefabToFeatures` function definition
- Line 1101-1107: destructuring `{ polygons, roadStrings }` from components

- [ ] **Step 1: Add `toNavCurveRoadStrings` and `NavCurveRoadString` to the import at line 14**

Change:
```typescript
import type { Polygon, RoadString } from '@truckermudgeon/map/prefabs';
import {
  toMapPosition,
  toRoadStringsAndPolygons,
} from '@truckermudgeon/map/prefabs';
```

To:
```typescript
import type {
  NavCurveRoadString,
  Polygon,
  RoadString,
} from '@truckermudgeon/map/prefabs';
import {
  toMapPosition,
  toNavCurveRoadStrings,
  toRoadStringsAndPolygons,
} from '@truckermudgeon/map/prefabs';
```

- [ ] **Step 2: Pre-compute nav roads map after line 265**

After the existing block:
```typescript
  const prefabComponents = mapValues(prefabDescriptions, pd =>
    toRoadStringsAndPolygons(pd),
  );
```

Add:
```typescript
  logger.log('pre-computing prefab nav road strings...');
  const prefabNavRoads = new Map<string, NavCurveRoadString[]>();
  for (const [token, pd] of prefabDescriptions) {
    prefabNavRoads.set(token, toNavCurveRoadStrings(pd));
  }
```

- [ ] **Step 3: Update `prefabToFeatures` signature to accept nav roads**

Change the function signature at line 1098 from:
```typescript
function prefabToFeatures(
  prefab: Prefab,
  prefabDescription: PrefabDescription,
  {
    polygons,
    roadStrings,
  }: {
    polygons: Polygon[];
    roadStrings: RoadString[];
  },
```

To:
```typescript
function prefabToFeatures(
  prefab: Prefab,
  prefabDescription: PrefabDescription,
  {
    polygons,
  }: {
    polygons: Polygon[];
  },
  navRoadStrings: NavCurveRoadString[],
```

- [ ] **Step 4: Replace the `roadStrings.map` block inside `prefabToFeatures` with `navRoadStrings.map`**

Find the existing block (around line 1148):
```typescript
    ...roadStrings.map<RoadFeature>((road, i) => {
      const txPoints = road.points.map(tx);
```

Replace the entire `roadStrings.map` array spread (from `...roadStrings.map<RoadFeature>` to its closing `]),`) with:

```typescript
    ...navRoadStrings.map<RoadFeature>((road, i) => {
      const txPoints = road.points.map(p => tx(p as [number, number]));
      let nearestRoadType: RoadType = 'unknown';
      if (!prefab.hidden) {
        const roadStart = txPoints[0];
        const roadEnd = txPoints.at(-1)!;
        const nearestRoad = [
          roadQuadTree.find(...roadStart, 2),
          roadQuadTree.find(...roadEnd, 2),
        ]
          .filter(e => e != null)
          .sort(
            (a, b) =>
              Math.min(distance(a, roadStart), distance(a, roadEnd)) -
              Math.min(distance(b, roadStart), distance(b, roadEnd)),
          )[0];
        if (nearestRoad && roadLookMap.has(nearestRoad.roadLookToken)) {
          nearestRoadType = getRoadType(
            roadLookMap.get(nearestRoad.roadLookToken)!,
          );
          for (const roadPoint of txPoints) {
            roadQuadTree.add({
              ...nearestRoad,
              x: roadPoint[0],
              y: roadPoint[1],
            });
          }
        } else {
          const nearestRoads = [
            roadQuadTree.find(...roadStart)!,
            roadQuadTree.find(...roadEnd)!,
          ];
          let nearestRoadFallback;
          if (!opts.allowUnknownRoadType) {
            const mid = midPoint(roadStart, roadEnd);
            nearestRoadFallback = nearestRoads.sort(
              (a, b) => distance(a, mid) - distance(b, mid),
            )[0];
          } else {
            nearestRoadFallback = nearestRoads.find(
              entry =>
                distance(entry, roadStart) < 1 || distance(entry, roadEnd) < 1,
            );
          }
          if (
            nearestRoadFallback &&
            roadLookMap.has(nearestRoadFallback.roadLookToken)
          ) {
            nearestRoadType = getRoadType(
              roadLookMap.get(nearestRoadFallback.roadLookToken)!,
            );
          }
        }
      }
      return {
        type: 'Feature',
        id: prefab.uid + 'road' + i,
        properties: {
          type: 'road',
          dlcGuard: prefab.dlcGuard,
          prefab: prefab.token,
          roadType: nearestRoadType,
          offset: 0,
          leftLanes: road.leftLaneCount,
          rightLanes: road.rightLaneCount,
          hidden: !!prefab.hidden,
          startNodeUid: findClosestNode(txPoints[0])?.uid.toString(16),
          endNodeUid: findClosestNode(txPoints.at(-1)!)?.uid.toString(16),
        },
        geometry: {
          type: 'LineString',
          coordinates: txPoints,
        },
      };
    }),
```

- [ ] **Step 5: Update all three call sites of `prefabToFeatures` to pass nav roads**

There are three call sites (around lines 283, 314, 329, 384). Each currently passes `assertExists(prefabComponents.get(p.token))`. Add the nav roads argument to each:

```typescript
// First pass (line ~283)
const pf = prefabToFeatures(
  p,
  assertExists(prefabDescriptions.get(p.token)),
  assertExists(prefabComponents.get(p.token)),
  prefabNavRoads.get(p.token) ?? [],
);

// Refine loop (line ~314 and ~329)
const pf = prefabToFeatures(
  p,
  assertExists(prefabDescriptions.get(p.token)),
  assertExists(prefabComponents.get(p.token)),
  prefabNavRoads.get(p.token) ?? [],
  { allowUnknownRoadType: true },  // or false for the fallback call
);

// V-junction pass (line ~384)
const pf = prefabToFeatures(
  p,
  assertExists(prefabDescriptions.get(p.token)),
  assertExists(prefabComponents.get(p.token)),
  prefabNavRoads.get(p.token) ?? [],
  { allowUnknownRoadType: false },
);
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npx tsc -p packages/clis/generator/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/clis/generator/geo-json/map.ts
git commit -m "feat(generator): use toNavCurveRoadStrings for prefab road generation"
```

---

## Task 4: Add NavCurve road layer to Prefabs App

**Files:**
- Modify: `packages/apps/prefabs/src/Preview.tsx`

- [ ] **Step 1: Add `toNavCurveRoadStrings` import**

Change line 2-5:
```typescript
import {
  calculateLaneInfo,
  toRoadStringsAndPolygons,
} from '@truckermudgeon/map/prefabs';
```

To:
```typescript
import {
  calculateLaneInfo,
  toNavCurveRoadStrings,
  toRoadStringsAndPolygons,
} from '@truckermudgeon/map/prefabs';
```

- [ ] **Step 2: Compute nav road strings inside the component**

After line 27 (`const { polygons, roadStrings } = toRoadStringsAndPolygons(prefab);`), add:

```typescript
  const navRoadStrings = toNavCurveRoadStrings(prefab);
```

- [ ] **Step 3: Add orange nav road polylines after the existing red roadStrings block**

After the closing `})}` of the `roadStrings.map` block (after line 96), add:

```typescript
      {navRoadStrings.map(({ points, sourceNodeIndex, targetNodeIndex, leftLaneCount, rightLaneCount }, pi) => (
        <polyline
          key={`nrs${pi}`}
          stroke="orange"
          strokeWidth={2}
          opacity={0.8}
          points={points.map(p => p.join(',')).join(' ')}
          fill="none"
          strokeLinecap="round"
          markerEnd="url(#rsTriangle)"
        >
          <title>{`Node ${sourceNodeIndex}→${targetNodeIndex} L${leftLaneCount} R${rightLaneCount}`}</title>
        </polyline>
      ))}
```

- [ ] **Step 4: Start the prefabs app and visually verify**

```bash
npm start --workspace=packages/apps/prefabs
```

Open the app, select a T-junction prefab (search for `us_cross_2-2`). Verify:
- Orange lines (navCurve roads) connect cleanly between node markers
- Red lines (mapPoints roads) may show gaps — this is expected and confirms the improvement
- Orange lines at fork prefabs (search `us_split`) show correct branching without gaps

- [ ] **Step 5: Commit**

```bash
git add packages/apps/prefabs/src/Preview.tsx
git commit -m "feat(prefabs-app): add navCurve road strings debug layer (orange)"
```

---

## Task 5: End-to-end generator validation

**Files:** No code changes — validation only.

- [ ] **Step 1: Run the generator on a small area**

```bash
NODE_OPTIONS=--max-old-space-size=4096 npx generator map \
  --map usa \
  --focusCity "Sacramento" \
  --focusRadius 50 \
  -i <your-parser-output-dir> \
  -o /tmp/map-navcurve-test
```

Expected: completes without errors, produces `/tmp/map-navcurve-test/usa-map.geojson`.

- [ ] **Step 2: Inspect output in geojson.io**

Open https://geojson.io and drag in `/tmp/map-navcurve-test/usa-map.geojson`.

Check the following locations (search by coordinates in the URL hash):
- A highway interchange near Sacramento: road arms should connect without gaps
- A city T-junction: three road arms should meet at a single point
- A divided highway section: two parallel lines should be present with no V-shaped gaps at ends

- [ ] **Step 3: Run lint**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npm run lint
```

Expected: no errors.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ `toNavCurveRoadStrings` + `toNavLanes` added to `prefabs.ts` (Task 1)
- ✅ Unit tests for both functions (Task 2)
- ✅ Generator integration with pre-computation cache (Task 3)
- ✅ Prefabs app debug layer (Task 4)
- ✅ End-to-end validation (Task 5)
- ✅降级策略 (fallback): covered by `prefabNavRoads.get(p.token) ?? []` in Task 3 Step 5
- ⚠️ Phase 2 (graph command / `toNavLanes` wiring) is intentionally out of scope for this plan

**Type consistency:**
- `NavCurveRoadString.points` is `[number, number][]` throughout (matches `curvePoints` type in existing `Lane` interface)
- `leftLaneCount` / `rightLaneCount` used consistently in Task 1 and Task 3
- `prefabNavRoads` is `Map<string, NavCurveRoadString[]>` in Task 3 Step 2 and consumed in Task 3 Step 5
