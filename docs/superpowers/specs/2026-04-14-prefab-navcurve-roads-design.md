# 设计文档：基于 NavCurves 的 Prefab 道路生成

**日期**：2026-04-14
**状态**：已审批，待实现

---

## 背景与问题

ETS2/ATS 游戏地图中的交叉路口、匝道、分叉口等复杂路段均以 Prefab（预制件）形式存储。当前代码使用 `mapPoints` 数据生成 prefab 内部道路形状，导致渲染后出现：

- 分叉/并行道路连接处断开或出现缺口
- 高速公路匝道与主线对不上
- 复杂交叉口形状怪异

**根本原因**：`mapPoints` 是 prefab 的视觉简化表示（用于游戏引擎渲染地面区域），而 `navCurves` 才是游戏内真实的车道曲线（精确的 hermite 样条，每条 curve 有 start/end position + rotation）。

---

## 目标

- **阶段一（视觉修复）**：用 navCurves 替代 mapPoints 生成 prefab 内部道路形状，消除断路和形状错误
- **阶段二（导航拓扑）**：将 navCurves 车道数据暴露给导航路网（graph 命令），支持精确的车道级路由

---

## 整体架构

### 变更范围

**阶段一：视觉修复**

| 文件 | 变更内容 |
|---|---|
| `packages/libs/map/prefabs.ts` | 新增 `toNavCurveRoadStrings()` 和 `toNavLanes()` 导出函数 |
| `packages/clis/generator/geo-json/map.ts` | `prefabToFeatures()` 改用 navCurve 道路，polygon 生成不变 |
| `packages/apps/prefabs/src/Preview.tsx` | 增加 navCurve 道路可视化层，支持新旧对比 |

**阶段二：导航拓扑**

| 文件 | 变更内容 |
|---|---|
| `packages/clis/generator/commands/graph.ts` | 用 navCurves lane 数据重建导航路网，每条边携带车道数和曲线几何 |

**不变的部分**：
- `toRoadStringsAndPolygons()` 保留，继续用于 polygon 生成
- `calculateLaneInfo()`、`calculateNodeConnections()` 保留
- `toMapPosition()` 坐标变换不变（navCurves 与 mapPoints 同属 prefab 局部坐标系）
- 普通 Road item 的生成逻辑不变

---

## 核心算法设计

### navCurves 数据模型

```
prefab node A (nodeIndex=0)
  inputLanes: [curve#0, curve#1]   ← 从 A 进入 prefab 的车道
  outputLanes: [curve#7, curve#8]  ← 离开 prefab 驶向 A 的车道

navCurves[0]: start=nodeA附近, end=prefab内部
  nextLines: [curve#3, curve#4]    ← 可继续走的曲线（分叉）
  prevLines: []                    ← 入口曲线，无前驱
```

`getCurvePaths(prefabDesc, inputLane)` 已实现：从入口 curve 出发，递归跟随 `nextLines`，返回所有可到达出口的完整曲线路径（`CurvePath[]`）。

### `toNavCurveRoadStrings` 算法

**第一步：构建有向连接分组**

```
for 每个 sourceNodeIndex:
  for 每个 inputLane in nodes[source].inputLanes:
    paths = getCurvePaths(prefabDesc, inputLane)
    for 每个 path in paths:
      key = (sourceNodeIndex, path.endingNodeIndex)
      laneGroups[key].push(path.curvePathIndices)
```

结果：`laneGroups` 以 `(src, dst)` 为键，每个键对应该方向所有车道的曲线路径列表。

**第二步：将每组车道转为代表曲线**

对每个 `(src, dst)` 分组：
1. 将每条车道路径的所有 curves 串联，用 `toSplinePoints(curve.start, curve.end)` 转换为样条点
2. 取中间索引的车道（`Math.floor(n/2)`）作为代表曲线（视觉差异 < 4.5m，地图尺度不可见）
3. 记录 `laneCount = 分组内曲线路径数量`

**第三步：合并双向对**

对每对 `(A→B)` 和 `(B→A)`：

```
lateralDist = 两条代表曲线在中点处的横向距离

if lateralDist ≤ 7 (约1.5个车道宽，4.5m/lane):
  // 非分隔式双向道路
  → 合并为一条 road string
  → leftLaneCount = B→A 车道数
  → rightLaneCount = A→B 车道数
  → 代表曲线取 A→B 方向的中间车道

else:
  // 实体分隔的高速/快速路
  → 保持两条独立 road string（各自单向）
  → leftLaneCount = 0 或 rightLaneCount = 0
```

### 新增类型接口

```typescript
// packages/libs/map/prefabs.ts 新增导出

export interface NavCurveRoadString {
  points: Position[];      // 代表曲线的样条点，prefab 局部坐标
  sourceNodeIndex: number;
  targetNodeIndex: number;
  leftLaneCount: number;   // 反向车道数（0 = 单向道路）
  rightLaneCount: number;  // 正向车道数
}

export function toNavCurveRoadStrings(
  prefab: PrefabDescription,
): NavCurveRoadString[]

// 阶段二：导航用精确车道数据
export interface NavLane {
  curvePoints: Position[];  // 该车道的完整样条点，prefab 局部坐标
  sourceNodeIndex: number;
  targetNodeIndex: number;
}

export function toNavLanes(prefab: PrefabDescription): NavLane[]
```

---

## Generator 集成

### `prefabToFeatures()` 修改

```typescript
// 旧：使用 mapPoints roadStrings
const { polygons, roadStrings } = prefabComponents.get(p.token);

// 新：polygon 不变，road 改用 navCurve
const { polygons } = prefabComponents.get(p.token);
const navRoadStrings = prefabNavRoads.get(p.token); // 预计算缓存

const roadFeatures = navRoadStrings.map((nrs, i) => {
  const txPoints = nrs.points.map(tx); // tx = toMapPosition，不变
  return {
    type: 'Feature',
    id: prefab.uid + 'road' + i,
    properties: {
      type: 'road',
      roadType: findNearestRoadType(txPoints, roadQuadTree, roadLookMap),
      leftLanes: nrs.leftLaneCount,
      rightLanes: nrs.rightLaneCount,
      startNodeUid: findClosestNode(txPoints[0])?.uid.toString(),
      endNodeUid: findClosestNode(txPoints.at(-1)!)?.uid.toString(),
      dlcGuard: prefab.dlcGuard,
    },
    geometry: { type: 'LineString', coordinates: txPoints },
  };
});
```

**关键简化**：
- 不再需要 `toParallelRoadStrings`（navCurves 已是精确车道位置）
- 不再需要复杂端点修正（navCurves 端点天然对齐 prefab node）
- V-junction 缝合逻辑保持不变，但因端点更准确，成功率大幅提升

### 性能优化：预计算缓存

```typescript
// commands/map.ts 主流程
logger.log('pre-computing prefab nav roads...');
const prefabNavRoads = new Map<string, NavCurveRoadString[]>();
for (const [token, prefabDesc] of prefabDescriptions.entries()) {
  prefabNavRoads.set(token, toNavCurveRoadStrings(prefabDesc));
}
// 每个 prefab 类型只计算一次，所有实例共享
```

### 降级策略

```typescript
export function toNavCurveRoadStrings(prefab: PrefabDescription): NavCurveRoadString[] {
  try {
    const result = computeNavRoads(prefab);
    if (result.length === 0) {
      logger.warn(`prefab ${prefab.path} has no nav roads, fallback to mapPoints`);
      return fallbackToMapPoints(prefab);
    }
    return result;
  } catch (err) {
    logger.error(`failed to compute nav roads for ${prefab.path}:`, err);
    return fallbackToMapPoints(prefab);
  }
}
```

---

## Prefabs App 调试支持

### 新增可视化层

在 `Preview.tsx` 中增加 NavCurve Roads 层（橙色粗线），与现有 MapPoints Roads（红色）并列显示，支持切换对比：

- **MapPoints Roads**（红色）：旧实现
- **NavCurve Roads**（橙色）：新实现，Tooltip 显示 `Node src → dst, Lanes: L{n} R{n}`
- **Both**：叠加对比

### 典型验证 Prefab

| Prefab 类型 | 验证重点 |
|---|---|
| `cross/hw2-2_x_hw2-2` | 标准十字路口，4节点，分叉连接 |
| `fork_temp/us_split_0-2_0-2` | Y型分叉，并行道路分离 |
| `cross/hw2-2_x_hw2-2_t_small` | T型路口，端点对齐 |
| 含 `divided` 的 prefab | 分隔式道路，双线独立 |
| roundabout prefab | 环形，进出口连接 |

---

## 测试策略

### 单元测试（`packages/libs/map/tests/prefabs.test.ts`）

| 测试用例 | 验证内容 |
|---|---|
| 双向单车道 | 合并为一条 road string，leftLaneCount=1, rightLaneCount=1 |
| 单向道路 | 保持独立，leftLaneCount=0 |
| T型路口（3节点） | 产生3条 road strings，每对节点一条 |
| 分隔式高速（divided） | 两个方向保持独立，各自 leftLaneCount=0 |
| 环形交叉口 | 不崩溃，进出口产生 road strings |
| `toNavLanes` 双向双车道 | 返回4条独立车道，每条有完整 curvePoints |
| 快照测试 | T型路口输出做 snapshot，防止几何回归 |

### 端到端验证

```bash
# 小范围生成，加快速度
npx generator map --focusCity "Sacramento" --focusRadius 50 -i <input> -o <output>

# 用 geojson.io 或 QGIS 对比新旧输出
```

检查点：
- 高速公路匝道处线条连续，无断口
- 城市十字路口道路在交叉点精确相交
- 分叉口两条并行线起点对齐，无 V 形缺口

---

## 阶段二：导航路网（后续）

`graph` 命令使用 `toNavLanes()` 输出构建路网：
- 每条 `NavLane` 对应一条有向图边
- 边属性：`sourceNodeUID`（通过 `prefab.nodeUids[sourceNodeIndex]` 映射）、`targetNodeUID`、`curvePoints`（路径几何）、`laneCount`
- 转弯信息：通过曲线方向角计算（直行/左转/右转）

与阶段一共享 `toNavLanes()` 函数，无需重复解析 navCurves。
