# Prefab Semantic Sidecar 设计文档

## 文档信息

- **版本**: 1.0.0
- **创建日期**: 2026-03-29
- **最后更新**: 2026-03-29
- **状态**: 设计阶段

## 一、项目背景

### 1.1 目标

为 Truck Sim Navigator 提供一层可长期复用的地图语义层，支持以下能力：

1. 红绿灯/大门的强关联选中与释放
2. 导航路线在交叉口/匝道/公司区域中的更准确绘制
3. 当前车道 / 当前 prefab lane route 的识别
4. 后续地图智能能力扩展（lane-level guidance、路口语义判断、路线与事件对齐）

### 1.2 设计原则

- **语义主导，几何兜底**：优先使用语义数据，无法匹配时回退到几何算法
- **独立补充**：不破坏现有底图主资源（pmtiles/graph.json）
- **可分块加载**：支持按区域加载，避免一次性全量解析
- **跨平台统一**：Web 和桌面软件统一消费
- **兼容 DLC/Mod**：支持所有 DLC 和 Mod 内容

## 二、数据来源梳理

### 2.1 原始地图静态语义（Parser 输出）

| 数据源 | 文件 | 大小 | 关键字段 |
|--------|------|------|---------|
| PrefabDescription | `{map}-prefabDescriptions.json` | 61MB | `token`, `navCurves`, `navNodes`, `semaphores`, `nodes` |
| Prefab Instance | `{map}-prefabs.json` | 22MB | `uid`, `token`, `nodeUids`, `originNodeIndex` |
| Node | `{map}-nodes.json` | 449MB | `uid`, `x`, `y`, `rotation` |

### 2.2 实例化语义（Generator 计算）

| 数据 | 计算方式 | 来源函数 |
|------|---------|---------|
| Prefab 节点连接 | 从 `navCurves` + `inputLanes`/`outputLanes` 追踪 | `calculateNodeConnections()` |
| 全局坐标变换 | Prefab 本地坐标 → 地图全局坐标 | `toMapPosition()` |
| NavCurve 样条曲线 | 从 start/end pose 生成 Hermite 样条 | `toSplinePoints()` |

### 2.3 TSN 遥测数据（运行时）

**来源**: ETS2LA Plugin (`E:\code\ets2la_plugin`)

| 数据类型 | 格式 | 更新频率 | 关键字段 |
|---------|------|---------|---------|
| Semaphore 状态 | Binary (48 bytes × 40) | 每帧 (~60 Hz) | `id` (Prefab 内本地), `state`, `type`, `x`, `y` |
| 导航路线 | Binary (16 bytes × 6000) | 路由变化时 | `uid` (节点), `distance`, `time` |

**Semaphore ID 特性**:
- 类型: `uint32_t`
- 作用域: **Prefab 内唯一**（不是全局唯一）
- 非 Prefab 信号灯 ID = 0（无效）

**Semaphore 状态值**:
```
OFF = 0
ORANGE_TO_RED = 1
RED = 2
ORANGE_TO_GREEN = 4
GREEN = 8
SLEEP = 32 (闪烁橙灯)
```

**闸门状态值**:
```
CLOSING = 0
CLOSED = 1
OPENING = 2
OPEN = 3
```

## 三、输出数据结构

### 3.1 目录结构

```
output/
├── ets2-semantic/
│   ├── index.json              # 元数据 + 扇区索引
│   ├── sectors/
│   │   ├── 0_0.json
│   │   ├── 0_1.json
│   │   └── ...
│   └── semaphore-index.json    # Semaphore 反向索引
└── ats-semantic/
    ├── index.json
    ├── sectors/
    │   ├── -5_10.json
    │   └── ...
    └── semaphore-index.json
```

### 3.2 Index.json（扇区索引）

```typescript
{
  "version": "1.0.0",
  "map": "europe" | "usa",
  "sectorSize": 2000,           // 2km × 2km
  "bounds": {
    "minX": number,
    "maxX": number,
    "minY": number,
    "maxY": number
  },
  "sectors": {
    "0_0": {
      "bounds": { minX, maxX, minY, maxY },
      "prefabCount": number,
      "file": "sectors/0_0.json"
    }
  },
  "statistics": {
    "totalPrefabs": number,
    "totalLaneRoutes": number,
    "totalSemaphores": number,
    "avgRoutesPerPrefab": number
  }
}
```

### 3.3 Sector File（扇区数据）

```typescript
// sectors/0_0.json
{
  "sectorX": 0,
  "sectorY": 0,
  "prefabs": [
    {
      "uid": "2935de10502e85",
      "token": "mod_ger_67",
      "x": 1657.5,
      "y": 3133.1,
      "rotation": 1.57,
      "nodeUids": ["2935de9c402e29", "2935de44402e86"],
      "laneRoutes": [
        {
          "id": 0,
          "startNodeIndex": 0,
          "endNodeIndex": 1,
          "points": [[1650.2, 3130.5], [1655.8, 3132.1]],
          "semaphoreIds": [0, 1],
          "bearing": 45.2,
          "length": 85.3
        }
      ],
      "semaphores": [
        {
          "id": 0,
          "x": 1657.5,
          "y": 3133.1,
          "rotation": 0,
          "type": 1,
          "affectedRoutes": [0, 1]
        }
      ]
    }
  ]
}
```

### 3.4 Semaphore Index（全局索引）

```typescript
// semaphore-index.json
{
  "version": "1.0.0",
  "index": {
    // 复合键格式：prefabUid_localId
    "2935de10502e85_0": {
      "sectorX": 0,
      "sectorY": 0,
      "prefabUid": "2935de10502e85",
      "localId": 0,
      "x": 1657.5,
      "y": 3133.1,
      "type": 1
    }
  }
}
```

## 四、字段说明

### 4.1 最小字段集合（红绿灯强关联必需）

```typescript
{
  uid: string,
  token: string,
  x: number,
  y: number,
  nodeUids: string[],
  laneRoutes: {
    id: number,
    startNodeIndex: number,
    endNodeIndex: number,
    points: [number, number][],
    semaphoreIds: number[]
  }[]
}
```

### 4.2 推荐字段集合（导航路线绘制增强）

在最小集合基础上添加：
```typescript
{
  rotation: number,
  laneRoutes: {
    bearing: number,
    length: number
  }
}
```

### 4.3 完整字段集合（调试/扩展）

在推荐集合基础上添加：
```typescript
{
  semaphores: {
    id: number,
    x: number,
    y: number,
    rotation: number,
    type: number,
    affectedRoutes: number[]
  }[]
}
```

## 五、分片策略

### 5.1 扇区参数

```typescript
const SECTOR_SIZE = 2000;  // 2km × 2km（统一 ETS2/ATS）
```

### 5.2 扇区计算

```typescript
const sectorX = Math.floor(prefab.x / SECTOR_SIZE);
const sectorY = Math.floor(prefab.y / SECTOR_SIZE);
const sectorKey = `${sectorX}_${sectorY}`;
```

### 5.3 文件大小估算

#### Europe (ETS2)

| 文件 | 大小（未压缩） | 大小（gzip） |
|------|---------------|-------------|
| index.json | ~50 KB | ~15 KB |
| semaphore-index.json | ~200 KB | ~50 KB |
| 单个扇区文件 | ~10-50 KB | ~3-15 KB |
| 总计（~150 扇区） | ~3 MB | ~750 KB |

#### USA (ATS)

| 文件 | 大小（未压缩） | 大小（gzip） |
|------|---------------|-------------|
| index.json | ~100 KB | ~30 KB |
| semaphore-index.json | ~800 KB | ~200 KB |
| 单个扇区文件 | ~10-50 KB | ~3-15 KB |
| 总计（~600 扇区） | ~12 MB | ~3 MB |

## 六、软件端消费流程

### 6.1 初始化

```typescript
const semanticLayer = new PrefabSemanticLayer();
await semanticLayer.load("europe");
```

### 6.2 查询附近 Prefabs

```typescript
const nearbyPrefabs = await semanticLayer.findNearbyPrefabs(
  vehicleX,
  vehicleY,
  100  // 半径 100m
);
```

### 6.3 选择最可能的 Lane Route

```typescript
const bestRoute = semanticLayer.selectBestLaneRoute(
  prefab,
  vehiclePos,
  vehicleBearing,
  navigationRoute  // 可选
);
```

### 6.4 TSN Semaphore 数据对齐

```typescript
// 方案 A：已知当前 prefab（推荐）
await semanticLayer.updateSemaphoreStates(
  tsnSemaphores,
  currentPrefabUid
);

// 方案 B：通过坐标匹配（兜底）
await semanticLayer.updateSemaphoreStates(tsnSemaphores);
```

### 6.5 导航路线增强

```typescript
const enhancedRoute = await semanticLayer.enhanceNavigationRoute(
  tsnRoute,  // { uid, distance, time }[]
  nodesMap
);
```

## 七、风险与回退策略

### 7.1 数据覆盖风险

| 风险 | 评估 | 缓解策略 |
|------|------|---------|
| curve.semaphoreId 覆盖不全 | 🟡 中等 | 几何兜底：距离 < 50m 的 semaphore 也关联 |
| navNodes 缺失 | 🟢 低 | PPD version >= 22 都有，旧版本 prefab 较少 |
| prefab 语义脏数据 | 🟡 中等 | 验证 curveIndices 有效性，过滤无效 routes |
| 某些交叉口无 prefab | 🔴 高 | **必须保留几何兜底算法** |
| Semaphore ID 冲突 | 🟢 低 | 使用复合键 `prefabUid_localId` |
| TSN 坐标精度误差 | 🟡 中等 | 5m 容差 + ID 双重匹配 |

### 7.2 性能风险

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| 文件体积过大 | 加载时间 | gzip 压缩（4:1）+ 扇区分片 |
| 空间查询慢 | 实时性 | 扇区索引（O(1) 查找） |
| lane route 匹配慢 | 实时性 | 预计算 bearing/length，限制候选数 |
| 扇区跨界查询 | 查询延迟 | 查询时加载相邻扇区（3×3 网格） |

### 7.3 回退策略

```typescript
function selectSemaphores(vehiclePos, vehicleBearing, currentPrefabUid?) {
  // 1. 尝试语义匹配（优先）
  if (currentPrefabUid) {
    const result = semanticLayer.getSemaphoresFromPrefab(currentPrefabUid);
    if (result) return result;
  }

  // 2. 空间查询兜底
  const nearbyPrefabs = await semanticLayer.findNearbyPrefabs(vehiclePos, 100);
  for (const prefab of nearbyPrefabs) {
    const route = semanticLayer.selectBestLaneRoute(prefab, vehiclePos, vehicleBearing);
    if (route && route.semaphoreIds.length > 0) {
      return semanticLayer.getSemaphoresForRoute(prefab, route);
    }
  }

  // 3. 几何算法兜底（最后手段）
  return geometricFallback.findSemaphoresByDistance(vehiclePos, vehicleBearing, 50);
}
```

## 八、实施要求

### 8.1 独立性要求

- ✅ **不修改现有 generator 命令**（map, graph, cities 等）
- ✅ **不修改现有输出文件**（pmtiles, graph.json 等）
- ✅ **新增独立命令** `prefab-semantic`
- ✅ **输出到独立目录** `{map}-semantic/`

### 8.2 兼容性要求

- ✅ 支持 ETS2 和 ATS
- ✅ 支持所有 DLC
- ✅ 支持 Mod
- ✅ Web 和桌面软件统一消费

## 九、参考资料

### 9.1 相关文件

- Parser: `packages/clis/parser/game-files/prefab-ppd-parser.ts`
- Generator: `packages/clis/generator/geo-json/prefab-curves.ts`
- Types: `packages/libs/map/types.ts`
- Prefabs Utils: `packages/libs/map/prefabs.ts`

### 9.2 TSN 遥测插件

- 项目路径: `E:\code\ets2la_plugin`
- Semaphore 定义: `src/prism/management/item/semaphore_instance.hpp`
- 数据结构: `src/core.hpp`
- API 文档: `API_DOCUMENTATION.md`

## 十、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| 1.0.0 | 2026-03-29 | 初始版本 |
