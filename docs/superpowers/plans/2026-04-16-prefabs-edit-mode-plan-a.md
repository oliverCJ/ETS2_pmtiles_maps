# Prefabs App 编辑模式（计划 A：前端） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 prefabs app 中新增独立的编辑模式，允许用户拖拽 navCurve 道路控制点进行修复，并导出 prefab-fixes.json 文件，同时生成相似 prefab 推荐和算法改进建议。

**Architecture:** 新增 EditMode.tsx（SVG + @use-gesture/react 拖拽）和 FixPanel.tsx（修复摘要、相似 prefab 列表、导出），在 App.tsx 中增加编辑模式切换按钮管理全局 fixes state。Preview.tsx 完全不动。

**Tech Stack:** React 18, TypeScript, @use-gesture/react, @turf/simplify（已有），@mui/joy（已有），SVG 原生渲染

---

## 文件结构

| 文件 | 类型 | 说明 |
|---|---|---|
| `packages/apps/prefabs/src/types.ts` | 新增 | FixEntry、PrefabStructureFeatures 共享类型 |
| `packages/apps/prefabs/src/EditMode.tsx` | 新增 | 可交互的 SVG 编辑视图 |
| `packages/apps/prefabs/src/FixPanel.tsx` | 新增 | 右侧修复面板 |
| `packages/apps/prefabs/src/Legend.tsx` | 新增 | 颜色图例组件（Preview 和 EditMode 共用） |
| `packages/apps/prefabs/src/Preview.tsx` | 修改 | 引入 Legend 组件 |
| `packages/apps/prefabs/src/App.tsx` | 修改 | 增加 editMode state、fixes state 和切换按钮 |
| `packages/apps/prefabs/package.json` | 修改 | 新增 @use-gesture/react 依赖 |

---

## Task 1: 安装依赖 + 定义共享类型

**Files:**
- Modify: `packages/apps/prefabs/package.json`
- Create: `packages/apps/prefabs/src/types.ts`

- [ ] **Step 1: 安装 @use-gesture/react**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npm install @use-gesture/react --workspace=packages/apps/prefabs
```

Expected: `package.json` 的 `dependencies` 中出现 `"@use-gesture/react": "^10.x.x"`

- [ ] **Step 2: 创建共享类型文件 `packages/apps/prefabs/src/types.ts`**

```typescript
// 一条控制点修复记录
export interface FixEntry {
  token: string;
  comment: string;
  // appliesTo[0] 是原始 token，其余为相似 prefab
  appliesTo: string[];
  roadIndex: number;
  pointIndex: number;
  originalCoords: [number, number];
  correctedCoords: [number, number];
  delta: [number, number];
}

// prefab 结构特征，用于相似 prefab 匹配
export interface PrefabStructureFeatures {
  nodeCount: number;
  lanesPerDirection: number; // 取最多数量方向的车道数
  isDivided: boolean;        // navCurve 横向距离 > 7 表示分隔式
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npx tsc --noEmit -p packages/apps/prefabs/tsconfig.json
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add packages/apps/prefabs/package.json packages/apps/prefabs/src/types.ts
git commit -m "feat(prefabs-app): add @use-gesture/react and shared FixEntry types"
```

---

## Task 2: 颜色图例组件 Legend.tsx

**Files:**
- Create: `packages/apps/prefabs/src/Legend.tsx`
- Modify: `packages/apps/prefabs/src/Preview.tsx`

- [ ] **Step 1: 创建 `packages/apps/prefabs/src/Legend.tsx`**

```tsx
interface LegendItem {
  color: string;
  label: string;
  shape?: 'circle' | 'line';
  filled?: boolean;
}

const items: LegendItem[] = [
  { color: '#0f0', label: '原点节点 (node 0)', shape: 'circle', filled: true },
  { color: '#f00', label: '其他节点', shape: 'circle', filled: true },
  { color: 'orange', label: 'NavCurve 道路（新算法）', shape: 'line' },
  { color: 'red', label: 'MapPoints 道路（旧算法）', shape: 'line' },
  { color: 'blue', label: '车道曲线（导航方向）', shape: 'line' },
];

export const editModeItems: LegendItem[] = [
  { color: '#aaa', label: '可拖拽控制点', shape: 'circle', filled: false },
  { color: 'orange', label: '已修改控制点', shape: 'circle', filled: true },
];

export const Legend = ({ includeEditItems = false }: { includeEditItems?: boolean }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', padding: '6px 0', fontSize: 12 }}>
    {[...items, ...(includeEditItems ? editModeItems : [])].map(({ color, label, shape, filled }) => (
      <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {shape === 'circle' ? (
          <svg width={12} height={12}>
            <circle
              cx={6} cy={6} r={5}
              fill={filled ? color : 'none'}
              stroke={color}
              strokeWidth={1.5}
            />
          </svg>
        ) : (
          <svg width={18} height={12}>
            <line x1={0} y1={6} x2={18} y2={6} stroke={color} strokeWidth={2.5} />
          </svg>
        )}
        {label}
      </span>
    ))}
  </div>
);
```

- [ ] **Step 2: 在 Preview.tsx 中引入 Legend（在 SVG 下方）**

在 `packages/apps/prefabs/src/Preview.tsx` 末尾，将 `return (` 的 SVG 块包进一个 div，并在 SVG 后加 Legend：

```tsx
import { Legend } from './Legend';
// ...在 return 的 SVG 闭合标签 </svg> 后加：
// <Legend />
```

具体修改：将现有的
```tsx
  return (
    <svg
      ...
    >
      ...
    </svg>
  );
```
改为：
```tsx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <svg
        ...
        style={{
          border: '1px solid',
          strokeLinecap: 'round',
          width: '100%',
          flex: 1,
        }}
      >
        ...
      </svg>
      <Legend />
    </div>
  );
```

注意：将原来 SVG 的 `height: '100%'` 替换为 `flex: 1`，让 Legend 占据底部固定高度。

- [ ] **Step 3: 启动 prefabs app 验证图例显示**

```bash
npm start --workspace=packages/apps/prefabs
```

在浏览器中选择任意 prefab，确认 SVG 下方出现颜色图例。

- [ ] **Step 4: Commit**

```bash
git add packages/apps/prefabs/src/Legend.tsx packages/apps/prefabs/src/Preview.tsx
git commit -m "feat(prefabs-app): add color legend below SVG preview"
```

---

## Task 3: EditMode.tsx — 基础 SVG 渲染（不含拖拽）

**Files:**
- Create: `packages/apps/prefabs/src/EditMode.tsx`

此 Task 只做静态渲染，拖拽逻辑在 Task 4 加入。

- [ ] **Step 1: 创建 `packages/apps/prefabs/src/EditMode.tsx`**

```tsx
import { getExtent } from '@truckermudgeon/base/geom';
import {
  calculateLaneInfo,
  toNavCurveRoadStrings,
  toRoadStringsAndPolygons,
} from '@truckermudgeon/map/prefabs';
import type { PrefabDescription } from '@truckermudgeon/map/types';
import simplify from '@turf/simplify';
import * as turf from '@turf/helpers';
import { useRef } from 'react';
import { Legend } from './Legend';
import type { FixEntry } from './types';

// 控制点抽稀：每条道路线保留 3-8 个点，端点永远保留
function thinPoints(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  const line = turf.lineString(points);
  const simplified = simplify(line, { tolerance: 0.5, mutate: false });
  const result = simplified.geometry.coordinates as [number, number][];
  // 保证端点不变
  result[0] = points[0];
  result[result.length - 1] = points[points.length - 1];
  return result;
}

interface EditModeProps {
  prefab: PrefabDescription;
  // editedPoints: key = `${roadIndex}-${pointIndex}`, value = [x, y]（prefab 局部坐标）
  editedPoints: Map<string, [number, number]>;
  onPointChange: (key: string, newCoords: [number, number]) => void;
  onReset: () => void;
  onApply: (fixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[]) => void;
}

export const EditMode = ({
  prefab,
  editedPoints,
  onPointChange,
  onReset,
  onApply,
}: EditModeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const [minX, minY, maxX, maxY] = getExtent(
    (prefab.mapPoints as { x: number; y: number }[])
      .concat(prefab.nodes)
      .concat(prefab.navCurves.flatMap(nc => [nc.start, nc.end])),
  );
  const { polygons } = toRoadStringsAndPolygons(prefab);
  const navRoadStrings = toNavCurveRoadStrings(prefab);
  const laneInfo = calculateLaneInfo(prefab);

  const width = Math.max(5, maxX - minX);
  const height = Math.max(5, maxY - minY);
  // 20% padding on each side
  const xPadding = width * 0.2;
  const yPadding = height * 0.2;

  const viewBoxWidth = width + xPadding * 2;
  const viewBoxHeight = height + yPadding * 2;

  const mapColors: Record<number, string> = {
    0: '#eaeced', 1: '#e6cc9f', 2: '#d8a54e', 3: '#b1ca9b',
    4: '#ff00ff', 5: '#ff00ff', 6: '#ff00ff', 7: '#ff00ff', 8: '#ff00ff',
  };

  // 构建每条道路的当前控制点（应用 editedPoints 覆盖）
  const roadControlPoints = navRoadStrings.map((rs, roadIndex) => {
    const thinned = thinPoints(rs.points);
    return thinned.map((originalPt, ptIndex) => {
      const key = `${roadIndex}-${ptIndex}`;
      return {
        key,
        coords: editedPoints.get(key) ?? originalPt,
        originalCoords: originalPt,
        isModified: editedPoints.has(key),
      };
    });
  });

  const handleApply = () => {
    const fixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[] = [];
    for (const [key, correctedCoords] of editedPoints) {
      const [roadIndex, pointIndex] = key.split('-').map(Number);
      const original = thinPoints(navRoadStrings[roadIndex].points)[pointIndex];
      fixes.push({
        roadIndex,
        pointIndex,
        originalCoords: original,
        correctedCoords,
        delta: [
          correctedCoords[0] - original[0],
          correctedCoords[1] - original[1],
        ],
      });
    }
    onApply(fixes);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${minX - xPadding} ${minY - yPadding} ${viewBoxWidth} ${viewBoxHeight}`}
        style={{ border: '1px solid', strokeLinecap: 'round', width: '100%', flex: 1 }}
      >
        <defs>
          <marker id="triangleBlueEdit" viewBox="0 0 5 5" refX="1" refY="2.5"
            markerUnits="strokeWidth" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 5 2.5 L 0 5 z" fill="#00f" />
          </marker>
        </defs>

        {/* Polygons */}
        {polygons.filter(p => p.zIndex < 10).map((poly, i) => (
          <polygon key={`poly-under-${i}`} opacity={0.9}
            points={poly.points.map(p => p.join(',')).join(' ')}
            fill={mapColors[poly.color]} />
        ))}

        {/* NavCurve 道路线（跟随编辑点实时更新） */}
        {roadControlPoints.map((pts, ri) => (
          <polyline key={`road-${ri}`}
            stroke="orange" strokeWidth={2} opacity={0.8} fill="none"
            points={pts.map(p => p.coords.join(',')).join(' ')} />
        ))}

        {/* Polygons above */}
        {polygons.filter(p => p.zIndex >= 10).map((poly, i) => (
          <polygon key={`poly-over-${i}`} opacity={0.9}
            points={poly.points.map(p => p.join(',')).join(' ')}
            fill={mapColors[poly.color]} />
        ))}

        {/* 节点 */}
        {prefab.nodes.map((n, i) => (
          <circle key={`node-${i}`} cx={n.x} cy={n.y} r={2}
            fill={i === 0 ? '#0f0' : '#f00'} />
        ))}

        {/* 蓝色 lane curves（只读） */}
        {laneInfo.entries().toArray().flatMap(([nodeIndex, lanes]) =>
          lanes.flatMap((lane, laneIndex) =>
            lane.branches.flatMap(({ curvePoints }, branchIndex) => (
              <polyline
                key={`lane-${nodeIndex}-${laneIndex}-${branchIndex}`}
                stroke="blue" strokeWidth={0.4} opacity={0.5} fill="none"
                points={curvePoints.map(p => p.join(',')).join(' ')}
                markerEnd="url(#triangleBlueEdit)"
              />
            ))
          )
        )}

        {/* 控制点（Task 4 会在这里加拖拽） */}
        {roadControlPoints.map((pts, ri) =>
          pts.map(({ key, coords, isModified }) => (
            <circle
              key={key}
              cx={coords[0]} cy={coords[1]}
              r={isModified ? 4 : 3}
              fill={isModified ? 'orange' : 'none'}
              stroke={isModified ? 'white' : '#aaa'}
              strokeWidth={1.5}
              style={{ cursor: 'grab' }}
            />
          ))
        )}

        {/* 坐标轴 */}
        <line stroke="gray" strokeDasharray="1 1" strokeWidth={0.2}
          x1={minX - 2 * xPadding} y1={0} x2={maxX + 2 * xPadding} y2={0} />
        <line stroke="gray" strokeDasharray="1 1" strokeWidth={0.2}
          x1={0} y1={minY - 2 * yPadding} x2={0} y2={maxY + 2 * yPadding} />
      </svg>

      <Legend includeEditItems />

      {/* 底部操作栏 */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
        <button onClick={onReset}
          style={{ padding: '4px 12px', cursor: 'pointer' }}>
          重置
        </button>
        <button onClick={handleApply}
          disabled={editedPoints.size === 0}
          style={{ padding: '4px 12px', cursor: 'pointer', fontWeight: 'bold' }}>
          应用 ({editedPoints.size} 个修改)
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p packages/apps/prefabs/tsconfig.json
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add packages/apps/prefabs/src/EditMode.tsx
git commit -m "feat(prefabs-app): add EditMode static SVG rendering (no drag yet)"
```

---

## Task 4: EditMode.tsx — 加入拖拽逻辑

**Files:**
- Modify: `packages/apps/prefabs/src/EditMode.tsx`

- [ ] **Step 1: 在 EditMode.tsx 顶部加入 useDrag import**

在 `import { useRef } from 'react';` 这行改为：
```tsx
import { useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
```

- [ ] **Step 2: 在 EditMode 组件内加入 tooltip state 和 DraggablePoint 子组件**

在 `const handleApply = () => {` 之前加入：

```tsx
  // 拖拽中显示的 tooltip 状态
  const [tooltip, setTooltip] = useState<{ key: string; x: number; y: number } | null>(null);

  const DraggablePoint = ({
    pointKey,
    coords,
    isModified,
    viewBoxWidth: vbw,
    viewBoxHeight: vbh,
  }: {
    pointKey: string;
    coords: [number, number];
    isModified: boolean;
    viewBoxWidth: number;
    viewBoxHeight: number;
  }) => {
    const bind = useDrag(({ delta: [dx, dy], active }) => {
      if (!svgRef.current) return;
      // 屏幕像素 → SVG 单位
      const scale = vbw / svgRef.current.clientWidth;
      const newX = coords[0] + dx * scale;
      const newY = coords[1] + dy * scale;
      onPointChange(pointKey, [newX, newY]);
      if (active) {
        setTooltip({ key: pointKey, x: newX, y: newY });
      } else {
        setTooltip(null);
      }
    }, { filterTaps: true });

    return (
      <g {...bind()} style={{ touchAction: 'none' }}>
        <circle
          cx={coords[0]} cy={coords[1]}
          r={tooltip?.key === pointKey ? 6 : isModified ? 4 : 3}
          fill={isModified ? 'orange' : 'none'}
          stroke={isModified ? 'white' : '#aaa'}
          strokeWidth={1.5}
          style={{ cursor: 'grab' }}
        />
        {tooltip?.key === pointKey && (
          <text x={coords[0] + 5} y={coords[1] - 5} fontSize={2} fill="#333">
            ({coords[0].toFixed(2)}, {coords[1].toFixed(2)})
          </text>
        )}
      </g>
    );
  };
```

- [ ] **Step 3: 替换 Task 3 中静态控制点渲染为 DraggablePoint**

找到 Task 3 中的控制点渲染块：
```tsx
        {/* 控制点（Task 4 会在这里加拖拽） */}
        {roadControlPoints.map((pts, ri) =>
          pts.map(({ key, coords, isModified }) => (
            <circle
              key={key}
              cx={coords[0]} cy={coords[1]}
              r={isModified ? 4 : 3}
              fill={isModified ? 'orange' : 'none'}
              stroke={isModified ? 'white' : '#aaa'}
              strokeWidth={1.5}
              style={{ cursor: 'grab' }}
            />
          ))
        )}
```

替换为：
```tsx
        {/* 可拖拽控制点 */}
        {roadControlPoints.map((pts) =>
          pts.map(({ key, coords, isModified }) => (
            <DraggablePoint
              key={key}
              pointKey={key}
              coords={coords}
              isModified={isModified}
              viewBoxWidth={viewBoxWidth}
              viewBoxHeight={viewBoxHeight}
            />
          ))
        )}
```

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p packages/apps/prefabs/tsconfig.json
```

Expected: 无错误

- [ ] **Step 5: 启动 prefabs app 手动验证拖拽**

```bash
npm start --workspace=packages/apps/prefabs
```

此时 EditMode 还没连接到 App.tsx，需要临时在 App.tsx 里把 `<Preview>` 替换成 `<EditMode>` 来测试（测试完再改回来）：

验证：
- 控制点可以拖拽，道路线实时跟随
- 拖拽时显示坐标 tooltip
- 已修改的控制点变为橙色实心圆

- [ ] **Step 6: Commit**

```bash
git add packages/apps/prefabs/src/EditMode.tsx
git commit -m "feat(prefabs-app): add drag interaction to EditMode control points"
```

---

## Task 5: FixPanel.tsx

**Files:**
- Create: `packages/apps/prefabs/src/FixPanel.tsx`

- [ ] **Step 1: 创建 `packages/apps/prefabs/src/FixPanel.tsx`**

```tsx
import type { NavCurveRoadString } from '@truckermudgeon/map/prefabs';
import { toNavCurveRoadStrings } from '@truckermudgeon/map/prefabs';
import type { PrefabDescription } from '@truckermudgeon/map/types';
import { distance } from '@truckermudgeon/base/geom';
import { useState } from 'react';
import type { FixEntry, PrefabStructureFeatures } from './types';
import type { PrefabDescription as PrefabDescriptionWithMeta } from './PrefabSelect';

interface FixPanelProps {
  prefab: PrefabDescription;
  prefabToken: string;
  allPrefabDescs: PrefabDescriptionWithMeta[]; // 用于相似 prefab 搜索
  confirmedFixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[];
  onExport: (fixes: FixEntry[]) => void;
}

// 从 NavCurveRoadString 判断是否分隔式道路（横向距离 > 7）
function getStructureFeatures(prefab: PrefabDescription): PrefabStructureFeatures {
  const navRoads = toNavCurveRoadStrings(prefab);
  let isDivided = false;
  // 找配对的反向道路判断横向距离
  for (const rs of navRoads) {
    const rev = navRoads.find(
      r => r.sourceNodeIndex === rs.targetNodeIndex && r.targetNodeIndex === rs.sourceNodeIndex,
    );
    if (rev) {
      const fwdMid = rs.points[Math.floor(rs.points.length / 2)];
      const revMid = rev.points[Math.floor(rev.points.length / 2)];
      if (distance(fwdMid, revMid) > 7) {
        isDivided = true;
        break;
      }
    }
  }
  const maxLanes = Math.max(...navRoads.map(r => Math.max(r.leftLaneCount, r.rightLaneCount)));
  return {
    nodeCount: prefab.nodes.length,
    lanesPerDirection: maxLanes,
    isDivided,
  };
}

function isSimilar(a: PrefabStructureFeatures, b: PrefabStructureFeatures): boolean {
  return (
    a.nodeCount === b.nodeCount &&
    Math.abs(a.lanesPerDirection - b.lanesPerDirection) <= 1 &&
    a.isDivided === b.isDivided
  );
}

// 简单的算法建议生成：分析 delta 模式
function generateAlgorithmSuggestion(
  fixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[],
  features: PrefabStructureFeatures,
): string {
  if (fixes.length === 0) return '';
  const avgDelta = fixes.reduce(
    (acc, f) => [acc[0] + Math.abs(f.delta[0]), acc[1] + Math.abs(f.delta[1])],
    [0, 0],
  ).map(v => v / fixes.length);
  const isEndpointMismatch = fixes.some(
    f => f.pointIndex === 0 || f.pointIndex === (/* last point */ 999),
  );
  if (isEndpointMismatch) {
    return `问题类型：端点未对齐到 prefab node
影响范围：${features.nodeCount} 节点${features.isDivided ? '分隔式' : ''}路口

建议检查：
// packages/libs/map/prefabs.ts
// toNavCurveRoadStrings 中的端点选取逻辑
// 平均偏移量: Δx=${avgDelta[0].toFixed(2)}, Δy=${avgDelta[1].toFixed(2)}

修改目的：端点应精确落在 prefab node 坐标上`;
  }
  return `问题类型：控制点位置偏移
平均偏移量: Δx=${avgDelta[0].toFixed(2)}, Δy=${avgDelta[1].toFixed(2)}
建议：检查 toNavCurveRoadStrings 中的中间点生成逻辑`;
}

export const FixPanel = ({
  prefab,
  prefabToken,
  allPrefabDescs,
  confirmedFixes,
  onExport,
}: FixPanelProps) => {
  const [comment, setComment] = useState('');
  const [similarPrefabs, setSimilarPrefabs] = useState<{ token: string; checked: boolean }[]>([]);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const features = getStructureFeatures(prefab);

  const handleFindSimilar = () => {
    const results = allPrefabDescs
      .filter(d => d.token !== prefabToken)
      .filter(d => {
        try {
          const f = getStructureFeatures(d);
          return isSimilar(features, f);
        } catch {
          return false;
        }
      })
      .map(d => ({ token: d.token, checked: true }));
    setSimilarPrefabs(results);
  };

  const handleExport = () => {
    const selectedTokens = [prefabToken, ...similarPrefabs.filter(s => s.checked).map(s => s.token)];
    const fixes: FixEntry[] = confirmedFixes.map(f => ({
      ...f,
      token: prefabToken,
      comment: comment || `${prefabToken} 修复`,
      appliesTo: selectedTokens,
    }));
    onExport(fixes);
  };

  const suggestion = generateAlgorithmSuggestion(confirmedFixes, features);

  return (
    <div style={{ padding: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 区域 1: 修复摘要 */}
      <div>
        <strong>修复摘要</strong>
        {confirmedFixes.length === 0 ? (
          <p style={{ color: '#888' }}>暂无已确认的修复（在编辑模式中拖拽后点击"应用"）</p>
        ) : (
          <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
            {confirmedFixes.map((f, i) => (
              <li key={i}>
                道路 {f.roadIndex} 点 {f.pointIndex}：
                ({f.originalCoords[0].toFixed(1)}, {f.originalCoords[1].toFixed(1)}) →
                ({f.correctedCoords[0].toFixed(1)}, {f.correctedCoords[1].toFixed(1)})
                &nbsp;<span style={{ color: '#888' }}>
                  Δ=({f.delta[0].toFixed(2)}, {f.delta[1].toFixed(2)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 区域 2: 相似 prefab */}
      <div>
        <strong>相似 Prefab 推荐</strong>
        <div style={{ marginTop: 4 }}>
          <small style={{ color: '#666' }}>
            结构特征：{features.nodeCount} 节点 / 每方向 {features.lanesPerDirection} 车道 /
            {features.isDivided ? ' 分隔式' : ' 非分隔式'}
          </small>
        </div>
        <button onClick={handleFindSimilar} style={{ marginTop: 4, padding: '2px 8px', cursor: 'pointer' }}>
          查找相似
        </button>
        {similarPrefabs.length > 0 && (
          <div style={{ marginTop: 6, maxHeight: 150, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>
            {similarPrefabs.map((s, i) => (
              <label key={s.token} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px' }}>
                <input
                  type="checkbox"
                  checked={s.checked}
                  onChange={e => {
                    const next = [...similarPrefabs];
                    next[i] = { ...s, checked: e.target.checked };
                    setSimilarPrefabs(next);
                  }}
                />
                <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{s.token}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 区域 3: 备注 + 导出 */}
      <div>
        <strong>备注</strong>
        <input
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="描述这个修复（可选）"
          style={{ display: 'block', width: '100%', marginTop: 4, padding: '4px 6px', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={handleExport}
          disabled={confirmedFixes.length === 0}
          style={{ padding: '4px 12px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          导出修复规则
        </button>
        <button
          onClick={() => setShowSuggestion(v => !v)}
          disabled={confirmedFixes.length === 0}
          style={{ padding: '4px 12px', cursor: 'pointer' }}
        >
          {showSuggestion ? '隐藏' : '生成'}算法建议
        </button>
      </div>

      {/* 算法建议 */}
      {showSuggestion && suggestion && (
        <pre style={{
          background: '#f5f5f5', padding: 10, borderRadius: 4,
          fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {suggestion}
        </pre>
      )}
    </div>
  );
};
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p packages/apps/prefabs/tsconfig.json
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add packages/apps/prefabs/src/FixPanel.tsx
git commit -m "feat(prefabs-app): add FixPanel with similar prefab search and export"
```

---

## Task 6: App.tsx — 连接 EditMode + FixPanel + 导出逻辑

**Files:**
- Modify: `packages/apps/prefabs/src/App.tsx`

- [ ] **Step 1: 修改 App.tsx**

将 `packages/apps/prefabs/src/App.tsx` 完整替换为：

```tsx
import { Grid, Toggle, Button } from '@mui/joy';
import { useState, useCallback } from 'react';
import { Details } from './Details';
import { EditMode } from './EditMode';
import { FixPanel } from './FixPanel';
import { LaneControl } from './LaneControl';
import type { PrefabOption } from './PrefabSelect';
import { PrefabSelect } from './PrefabSelect';
import { Preview } from './Preview';
import type { FixEntry } from './types';

const App = () => {
  const [active, setActive] = useState<PrefabOption | undefined>();
  const [editMode, setEditMode] = useState(false);
  // editedPoints: 编辑模式中临时的拖拽状态（roadIndex-pointIndex → [x, y]）
  const [editedPoints, setEditedPoints] = useState<Map<string, [number, number]>>(new Map());
  // confirmedFixes: 用户点击"应用"后确认的修复
  const [confirmedFixes, setConfirmedFixes] = useState<
    Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[]
  >([]);

  const onChange = (p: PrefabOption | undefined) => {
    setActive(p);
    setEditMode(false);
    setEditedPoints(new Map());
    setConfirmedFixes([]);
  };

  const handlePointChange = useCallback((key: string, coords: [number, number]) => {
    setEditedPoints(prev => new Map(prev).set(key, coords));
  }, []);

  const handleReset = () => {
    setEditedPoints(new Map());
  };

  const handleApply = (fixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[]) => {
    setConfirmedFixes(fixes);
    setEditedPoints(new Map());
  };

  // 导出 prefab-fixes.json：触发浏览器下载
  const handleExport = (fixes: FixEntry[]) => {
    const existing = { fixes: [] as FixEntry[] };
    const merged = { fixes: [...existing.fixes, ...fixes] };
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prefab-fixes.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Grid
      container
      padding={2}
      spacing={2}
      sx={{ flexGrow: 1, maxHeight: '100vh', overflow: 'hidden' }}
    >
      <Grid xs={12} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <PrefabSelect onChange={onChange} />
        {active && (
          <Button
            variant={editMode ? 'solid' : 'outlined'}
            color="warning"
            size="sm"
            onClick={() => {
              setEditMode(v => !v);
              setEditedPoints(new Map());
            }}
          >
            {editMode ? '退出编辑' : '编辑模式'}
          </Button>
        )}
      </Grid>

      <Grid xs={8} sx={{ height: 'calc(100vh - 80px)' }}>
        {active && (
          <>
            {editMode ? (
              <EditMode
                prefab={active.value.prefabDesc}
                editedPoints={editedPoints}
                onPointChange={handlePointChange}
                onReset={handleReset}
                onApply={handleApply}
              />
            ) : (
              <>
                <LaneControl prefab={active.value.prefabDesc} />
                <Preview prefab={active.value.prefabDesc} />
              </>
            )}
          </>
        )}
      </Grid>

      <Grid xs={4} sx={{ height: 'calc(100vh - 80px)', overflowY: 'scroll' }}>
        {active && (
          <>
            {editMode ? (
              <FixPanel
                prefab={active.value.prefabDesc}
                prefabToken={active.value.prefabDesc.token}
                allPrefabDescs={[]}
                confirmedFixes={confirmedFixes}
                onExport={handleExport}
              />
            ) : (
              <Details
                prefab={active.value.prefabDesc}
                locations={active.value.locations}
              />
            )}
          </>
        )}
      </Grid>
    </Grid>
  );
};

export default App;
```

注意：`allPrefabDescs` 暂时传空数组，Task 7 会修复这个。

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p packages/apps/prefabs/tsconfig.json
```

Expected: 无错误（若 `@mui/joy` 的 `Toggle` 不存在，改用 `Button` variant 切换即可，代码已用 `Button`）

- [ ] **Step 3: 启动 app 做完整手动测试**

```bash
npm start --workspace=packages/apps/prefabs
```

验证流程：
1. 选择一个 prefab
2. 点击"编辑模式"按钮，左侧切换为 EditMode，右侧切换为 FixPanel
3. 拖拽一个控制点，道路线实时跟随
4. 点击"应用"，FixPanel 左侧显示修复摘要
5. 再次点击"编辑模式"按钮退出，Preview 恢复正常

- [ ] **Step 4: Commit**

```bash
git add packages/apps/prefabs/src/App.tsx
git commit -m "feat(prefabs-app): wire EditMode and FixPanel into App with mode toggle"
```

---

## Task 7: 将 allPrefabDescs 传入 FixPanel

**Files:**
- Modify: `packages/apps/prefabs/src/PrefabSelect.tsx`
- Modify: `packages/apps/prefabs/src/App.tsx`

`PrefabSelect` 加载完成后需要把所有 prefab desc 传给父组件，以便 FixPanel 做相似搜索。

- [ ] **Step 1: 修改 PrefabSelect.tsx，新增 onLoad 回调**

在 `PrefabSelectProps` interface 中加入 `onLoad` 回调：

```tsx
interface PrefabSelectProps {
  onChange: (o: PrefabOption | undefined) => void;
  onLoad?: (options: PrefabOption[]) => void;
}
```

在 `promiseOptions().then(groups => ...)` 的 then 里加一行：
```tsx
void promiseOptions().then(groups => {
  if (active) {
    setOptions(groups);
    props.onLoad?.(groups); // 新增这一行
  }
});
```

- [ ] **Step 2: 修改 App.tsx，接收 allPrefabDescs**

在 App.tsx 中加入 state：
```tsx
const [allPrefabDescs, setAllPrefabDescs] = useState<PrefabOption[]>([]);
```

修改 PrefabSelect 的使用：
```tsx
<PrefabSelect
  onChange={onChange}
  onLoad={setAllPrefabDescs}
/>
```

修改 FixPanel 的 `allPrefabDescs` prop（原来传空数组）：
```tsx
<FixPanel
  prefab={active.value.prefabDesc}
  prefabToken={active.value.prefabDesc.token}
  allPrefabDescs={allPrefabDescs.map(o => o.value.prefabDesc)}
  confirmedFixes={confirmedFixes}
  onExport={handleExport}
/>
```

注意 `FixPanel` 的 `allPrefabDescs` 类型已在 Task 5 中定义为 `PrefabDescription[]`（来自 `@truckermudgeon/map/types`），而非 `PrefabDescriptionWithMeta`。修改 FixPanel.tsx 的 props 类型去掉 `PrefabDescriptionWithMeta`，改用 `PrefabDescription & { token: string; path: string }`，或直接用 `any` 作为过渡。

实际修改：在 FixPanel.tsx 中把 `allPrefabDescs: PrefabDescriptionWithMeta[]` 改为：
```tsx
allPrefabDescs: (PrefabDescription & { token: string; path: string })[];
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p packages/apps/prefabs/tsconfig.json
```

Expected: 无错误

- [ ] **Step 4: 手动测试相似 prefab 搜索**

```bash
npm start --workspace=packages/apps/prefabs
```

验证：
1. 进入编辑模式
2. 在 FixPanel 中点击"查找相似"
3. 应出现带勾选框的相似 prefab 列表

- [ ] **Step 5: Commit**

```bash
git add packages/apps/prefabs/src/PrefabSelect.tsx packages/apps/prefabs/src/App.tsx packages/apps/prefabs/src/FixPanel.tsx
git commit -m "feat(prefabs-app): pass allPrefabDescs to FixPanel for similar search"
```

---

## Task 8: 验证完整工作流 + Lint

**Files:** 无代码修改

- [ ] **Step 1: 运行 lint**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npm run lint 2>&1 | head -50
```

修复所有 ESLint / TypeScript 错误后继续。

- [ ] **Step 2: 完整工作流手动测试**

```bash
npm start --workspace=packages/apps/prefabs
```

完整验证流程：
1. 选择 T 型路口 prefab（搜索 `us_cross_2-2`）
2. 点击"编辑模式"
3. 拖拽一个控制点，验证实时跟随、tooltip 显示
4. 点击"应用"，验证 FixPanel 左侧摘要更新
5. 在 FixPanel 点击"查找相似"，验证列表出现
6. 取消勾选 1-2 个 prefab
7. 填写备注，点击"导出修复规则"，验证浏览器下载 `prefab-fixes.json`
8. 打开下载的文件，验证格式：包含 `token`、`appliesTo`、`originalCoords`、`correctedCoords`、`delta`
9. 点击"生成算法建议"，验证建议文字出现
10. 退出编辑模式，Preview 恢复正常

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat(prefabs-app): complete edit mode implementation (Plan A)"
```

---

## 自检

**Spec 覆盖检查：**
- ✅ EditMode 独立视图，不破坏 Preview（Task 3-4）
- ✅ @use-gesture/react 拖拽（Task 4）
- ✅ 控制点抽稀 tolerance=0.5（Task 3）
- ✅ 端点永远保留（Task 3 `thinPoints`）
- ✅ 20% padding viewBox（Task 3）
- ✅ 视觉反馈：未改/已改/拖拽中三态（Task 3-4）
- ✅ 重置/应用按钮（Task 3）
- ✅ 颜色图例（Task 2）
- ✅ FixPanel 三个区域（Task 5）
- ✅ 结构特征匹配相似 prefab（Task 5）
- ✅ 算法建议展示（Task 5）
- ✅ 导出 prefab-fixes.json（Task 6）
- ✅ 同时保存 correctedCoords 和 delta（Task 3 handleApply）
- ✅ App.tsx 模式切换（Task 6）
- ✅ allPrefabDescs 传递（Task 7）

**类型一致性：**
- `FixEntry` 定义在 `types.ts`，Task 3/5/6 均使用
- `editedPoints: Map<string, [number, number]>` 在 Task 3/4/6 一致
- `onApply` 参数类型 `Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[]` 在 Task 3/6 一致
