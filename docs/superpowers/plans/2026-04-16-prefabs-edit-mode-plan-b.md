# Prefabs App 编辑模式（计划 B：Generator 集成） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 generator 的 map 命令读取 `prefab-fixes.json`，对原始 token 使用绝对坐标覆盖，对相似 prefab 使用 delta 偏移，使修复结果反映在最终地图输出中。

**Architecture:** 在 `convertToMapGeoJson` 中新增可选的 `fixesFilePath` 参数，预计算 `prefabNavRoads` 后遍历 fixes 并应用坐标覆盖，通过 `--fixes` 命令行参数传入文件路径，不传时行为完全不变。

**Tech Stack:** TypeScript, Node.js fs, 现有 generator 架构

**前置条件：** 计划 A 已完成，`prefab-fixes.json` 格式已确定。

---

## 文件结构

| 文件 | 类型 | 说明 |
|---|---|---|
| `packages/clis/generator/geo-json/map.ts` | 修改 | 新增 fixesFilePath 参数，应用修复逻辑 |
| `packages/clis/generator/commands/map.ts` | 修改 | 新增 `--fixes` CLI 参数 |
| `packages/clis/generator/prefab-fixes.ts` | 新增 | 读取和验证 prefab-fixes.json 的工具函数 |

---

## Task 1: 定义 FixEntry 类型 + 读取工具函数

**Files:**
- Create: `packages/clis/generator/prefab-fixes.ts`

- [ ] **Step 1: 创建 `packages/clis/generator/prefab-fixes.ts`**

```typescript
import * as fs from 'fs';

// 与 prefabs app 的 FixEntry 保持一致
export interface FixEntry {
  token: string;
  comment: string;
  appliesTo: string[]; // [0] 是原始 token，其余为相似 prefab
  roadIndex: number;
  pointIndex: number;
  originalCoords: [number, number];
  correctedCoords: [number, number];
  delta: [number, number];
}

export interface PrefabFixes {
  fixes: FixEntry[];
}

/**
 * 读取并解析 prefab-fixes.json。
 * 文件不存在时返回空 fixes 列表（不报错）。
 * 格式不合法时抛出错误。
 */
export function loadPrefabFixes(filePath: string | undefined): PrefabFixes {
  if (!filePath) return { fixes: [] };
  if (!fs.existsSync(filePath)) {
    console.warn(`[prefab-fixes] file not found: ${filePath}, skipping fixes`);
    return { fixes: [] };
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { fixes?: unknown }).fixes)
  ) {
    throw new Error(`[prefab-fixes] invalid format in ${filePath}: expected { fixes: [] }`);
  }
  return parsed as PrefabFixes;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npx tsc --noEmit -p packages/clis/generator/tsconfig.json 2>&1 | grep "prefab-fixes"
```

Expected: 无错误（只看 prefab-fixes 相关行）

- [ ] **Step 3: Commit**

```bash
git add packages/clis/generator/prefab-fixes.ts
git commit -m "feat(generator): add loadPrefabFixes utility"
```

---

## Task 2: 在 map.ts 中应用修复逻辑

**Files:**
- Modify: `packages/clis/generator/geo-json/map.ts`

关键位置：
- `convertToMapGeoJson` 函数签名（约第 73 行）
- `prefabNavRoads` 预计算块（约第 265 行之后）

- [ ] **Step 1: 在 map.ts 顶部加入 import**

在现有 import 块末尾加入：
```typescript
import { loadPrefabFixes } from '../prefab-fixes';
import type { PrefabFixes } from '../prefab-fixes';
```

- [ ] **Step 2: 修改 `convertToMapGeoJson` 的 options 参数，加入 fixesFilePath**

找到函数签名（约第 73 行）：
```typescript
export function convertToMapGeoJson(
  tsMapData: MappedData,
  options: {
    includeDebug: boolean;
    skipCoalescing: boolean;
  },
): AtsGeoJson {
```

改为：
```typescript
export function convertToMapGeoJson(
  tsMapData: MappedData,
  options: {
    includeDebug: boolean;
    skipCoalescing: boolean;
    fixesFilePath?: string;
  },
): AtsGeoJson {
```

- [ ] **Step 3: 在 prefabNavRoads 预计算块之后加入修复应用逻辑**

找到现有的预计算块（约第 265 行）：
```typescript
  logger.log('pre-computing prefab nav road strings...');
  const prefabNavRoads = new Map<string, NavCurveRoadString[]>();
  for (const [token, pd] of prefabDescriptions) {
    prefabNavRoads.set(token, toNavCurveRoadStrings(pd));
  }
```

在这个块之后加入：
```typescript
  // 应用 prefab-fixes.json 中的坐标修复
  const prefabFixes = loadPrefabFixes(options.fixesFilePath);
  if (prefabFixes.fixes.length > 0) {
    logger.log(`applying ${prefabFixes.fixes.length} prefab fixes...`);
    for (const fix of prefabFixes.fixes) {
      for (const token of fix.appliesTo) {
        const navRoads = prefabNavRoads.get(token);
        if (!navRoads) continue;
        const road = navRoads[fix.roadIndex];
        if (!road) continue;
        const pt = road.points[fix.pointIndex];
        if (!pt) continue;

        if (token === fix.token) {
          // 原始 token：使用绝对坐标覆盖
          road.points[fix.pointIndex] = fix.correctedCoords;
        } else {
          // 相似 prefab：使用 delta 偏移
          road.points[fix.pointIndex] = [
            pt[0] + fix.delta[0],
            pt[1] + fix.delta[1],
          ];
        }
      }
    }
  }
```

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p packages/clis/generator/tsconfig.json 2>&1 | grep -v "error TS2739\|error TS2322\|graph.test" | head -20
```

Expected: 只有预存在的无关错误，无新增错误

- [ ] **Step 5: Commit**

```bash
git add packages/clis/generator/geo-json/map.ts
git commit -m "feat(generator): apply prefab-fixes.json coordinate overrides in map generation"
```

---

## Task 3: 在 commands/map.ts 中加入 --fixes CLI 参数

**Files:**
- Modify: `packages/clis/generator/commands/map.ts`

- [ ] **Step 1: 读取 commands/map.ts 了解现有 CLI 参数结构**

```bash
grep -n "yargs\|option\|argv\|convertToMapGeoJson" /Users/oliver/working/node/ETS2_pmtiles_maps/packages/clis/generator/commands/map.ts | head -30
```

- [ ] **Step 2: 在 yargs options 中加入 --fixes 参数**

找到现有的 options 定义块，加入：
```typescript
.option('fixes', {
  type: 'string',
  description: 'Path to prefab-fixes.json for coordinate overrides',
  default: undefined,
})
```

- [ ] **Step 3: 将 fixes 参数传入 convertToMapGeoJson**

找到 `convertToMapGeoJson(tsMapData, {` 的调用处，加入 `fixesFilePath: argv.fixes`：

```typescript
const geoJson = convertToMapGeoJson(tsMapData, {
  includeDebug: argv.includeDebug,
  skipCoalescing: argv.skipCoalescing,
  fixesFilePath: argv.fixes,
});
```

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p packages/clis/generator/tsconfig.json 2>&1 | grep -v "error TS2739\|error TS2322\|graph.test" | head -20
```

Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
git add packages/clis/generator/commands/map.ts
git commit -m "feat(generator): add --fixes CLI option to map command"
```

---

## Task 4: 端到端验证

**Files:** 无代码修改

- [ ] **Step 1: 准备一个测试用的 prefab-fixes.json**

创建 `/tmp/test-fixes.json`：
```json
{
  "fixes": [
    {
      "token": "2o0ds",
      "comment": "测试修复",
      "appliesTo": ["2o0ds"],
      "roadIndex": 0,
      "pointIndex": 0,
      "originalCoords": [23.5, -20.25],
      "correctedCoords": [23.5, -27.0],
      "delta": [0, -6.75]
    }
  ]
}
```

- [ ] **Step 2: 运行 generator（如有 parser 输出数据）**

```bash
NODE_OPTIONS=--max-old-space-size=4096 npx generator map \
  --map usa \
  --fixes /tmp/test-fixes.json \
  -i <parser输出目录> \
  -o /tmp/map-fixes-test
```

Expected: 日志中出现 `applying 1 prefab fixes...`，生成 `/tmp/map-fixes-test/usa-map.geojson`

- [ ] **Step 3: 验证不传 --fixes 时行为不变**

```bash
NODE_OPTIONS=--max-old-space-size=4096 npx generator map \
  --map usa \
  -i <parser输出目录> \
  -o /tmp/map-no-fixes-test
```

Expected: 正常运行，无 `applying fixes` 日志，输出与之前一致

- [ ] **Step 4: 运行 lint**

```bash
cd /Users/oliver/working/node/ETS2_pmtiles_maps
npm run lint 2>&1 | head -30
```

Expected: 无新增错误

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat(generator): complete prefab-fixes.json integration (Plan B)"
```

---

## 自检

**Spec 覆盖检查：**
- ✅ 原始 token 使用 correctedCoords 绝对坐标（Task 2）
- ✅ 相似 prefab 使用 delta 偏移（Task 2）
- ✅ 文件不存在时不报错（Task 1 loadPrefabFixes）
- ✅ --fixes CLI 参数（Task 3）
- ✅ 不传 --fixes 时完全向后兼容（Task 2 条件判断）
- ✅ 日志输出修复数量（Task 2）

**类型一致性：**
- `FixEntry` 在 `prefab-fixes.ts` 中定义，与计划 A 的 `types.ts` 字段完全一致
- `road.points[fix.pointIndex]` 类型为 `[number, number]`，与 `correctedCoords` 和 delta 计算结果一致
