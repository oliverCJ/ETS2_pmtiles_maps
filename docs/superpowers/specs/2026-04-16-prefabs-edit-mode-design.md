# 设计文档：Prefabs App 编辑模式

**日期**：2026-04-16
**状态**：已审批，待实现

---

## 背景与问题

当前 prefabs app 只能查看 prefab 的道路几何形状，无法对错误的道路端点或控制点进行修复。当发现某个路口渲染有问题时，开发者需要手动分析数据、修改算法代码，效率低且缺乏直观反馈。

---

## 目标

1. **立即修复**：在 prefabs app 中通过拖拽控制点修复特定 prefab 的道路形状，导出 `prefab-fixes.json`，generator 运行时读取并覆盖对应坐标
2. **推广修复**：基于结构特征自动匹配相似 prefab，手动确认适用范围，生成算法改进建议（代码片段 + 详细解释），由开发者审阅后提交

---

## 整体架构

### 新增/修改文件

| 文件 | 变更 |
|---|---|
| `packages/apps/prefabs/src/EditMode.tsx` | 新增：SVG + @use-gesture/react 拖拽编辑视图 |
| `packages/apps/prefabs/src/FixPanel.tsx` | 新增：右侧修复面板（坐标差值、相似 prefab 列表、导出、算法建议） |
| `packages/apps/prefabs/src/App.tsx` | 修改：增加"编辑模式"切换按钮，管理 fixes 全局状态 |
| `packages/clis/generator/geo-json/map.ts` | 修改：运行时读取 `prefab-fixes.json` 覆盖对应点坐标 |

### 完全不动

`Preview.tsx`、`Details.tsx`、`LaneControl.tsx`

### 状态流

```
拖拽控制点
    ↓
EditMode 内部 state（临时，未确认）
    ↓ 点击"应用"
App.tsx fixes state（已确认）
    ↓ 点击"导出"
prefab-fixes.json（持久化到磁盘）
```

---

## EditMode 组件

### 渲染内容

复用 `Preview.tsx` 的 SVG 结构，调整如下：

- **保留**：polygon 填色、节点圆圈、坐标轴参考线
- **保留**：蓝色 lane curves（只读，帮助判断正确位置）
- **替换**：橙色 navCurve 道路线改为可交互版本——线条保持，控制点变为可拖拽圆点
- **新增**：颜色图例（SVG 下方）

### 控制点抽稀策略

复用 `getLane` 里已有的 `@turf/simplify` 逻辑，tolerance 设为 `0.5`（游戏单位），每条道路线通常保留 3-8 个控制点。端点（起点/终点）永远保留，不参与抽稀。

### 技术方案

使用 `@use-gesture/react` 的 `useDrag` hook 处理拖拽：

```typescript
const bind = useDrag(({ delta: [dx, dy] }) => {
  // 屏幕像素 → SVG 单位（prefab 局部坐标）
  const scale = viewBoxWidth / svgRef.current.clientWidth;
  updatePoint(roadIndex, pointIndex, dx * scale, dy * scale);
});
```

SVG viewBox 直接使用 prefab 局部坐标系，无 zoom/pan，坐标转换为单一线性缩放，精度无损。

### 视觉反馈

| 状态 | 样式 |
|---|---|
| 未修改的控制点 | 空心灰色圆圈，半径 3 |
| 已修改的控制点 | 实心橙色圆圈，半径 4，白色描边 |
| 拖拽中 | 圆圈半径 6，显示当前坐标 tooltip |

道路线实时跟随控制点移动。

### 底部操作栏

- **重置**：丢弃所有未确认的修改
- **应用**：将当前编辑状态通过 `onApply(fixes)` 回调提交到 App.tsx

### viewBox padding

在现有 Preview.tsx 的 extent 基础上增加 20% padding，确保所有道路端点不贴边，拖拽时有足够操作空间。

---

## FixPanel 组件

### 区域 1：当前修复摘要

展示已修改的道路和控制点列表，每个控制点显示：
- 原始坐标
- 修正后坐标
- 偏移量（delta）

### 区域 2：相似 prefab 推荐

点击"查找相似"按钮后，系统分析当前 prefab 的结构特征并在 `usa-prefabDescriptions.json` 中搜索匹配项：

**匹配条件：**
- 节点数量相同（精确匹配）
- 每方向车道数相同（±1 容差）
- 是否分隔式（divided）相同

展示匹配列表，每条可勾选/取消勾选，默认全选。

### 区域 3：操作按钮

- **导出修复规则**：生成/追加到 `prefab-fixes.json`
- **生成算法建议**：分析修改模式，在面板内展示代码片段 + 详细解释

### 算法建议展示格式

```
问题类型：端点未对齐到 prefab node
影响范围：预计影响 3 节点 T 型路口，约占所有 prefab 的 15%

建议修改：
// packages/libs/map/prefabs.ts 第 X 行
- const DIVIDED_THRESHOLD = 7;
+ const DIVIDED_THRESHOLD = 9.5;  // 根据修复案例统计得出

修改目的：DIVIDED_THRESHOLD 过小，导致分隔式道路被错误合并为双向道路...
修改影响：影响所有 3 节点 T 型路口的道路合并判断...
```

开发者审阅后，由 Claude Code 将代码片段写入 `prefabs.ts` 并提交。

---

## prefab-fixes.json 格式

```json
{
  "fixes": [
    {
      "token": "2o0ds",
      "comment": "T型路口端点偏移修正",
      "appliesTo": ["2o0ds", "2o09g"],
      "roadIndex": 0,
      "pointIndex": 0,
      "originalCoords": [23.5, -20.25],
      "correctedCoords": [23.5, -27.0],
      "delta": [0, -6.75]
    }
  ]
}
```

字段说明：
- `token`：被修复的 prefab token（原始修复对象）
- `appliesTo`：此修复适用的所有 prefab token 列表（第一个元素为原始 token，其余为相似 prefab）
- `roadIndex`：navCurveRoadStrings 中的道路索引
- `pointIndex`：该道路的控制点索引
- `originalCoords`：算法生成的原始坐标（prefab 局部坐标系）
- `correctedCoords`：修复后的坐标（仅用于原始 token）
- `delta`：偏移量，用于推广到相似 prefab 以及算法改进分析

---

## App.tsx 修改

### 新增 state

```typescript
const [editMode, setEditMode] = useState(false);
const [fixes, setFixes] = useState<FixEntry[]>([]);
```

### 布局切换

顶部增加"编辑模式"Toggle Button：
- 关闭时：左侧显示 `LaneControl + Preview`，右侧显示 `Details`
- 开启时：左侧显示 `EditMode`，右侧显示 `FixPanel`

---

## Generator 集成（map.ts）

### 命令行参数

```bash
npx generator map \
  --fixes prefab-fixes.json \
  -i <input> -o <output>
```

不传 `--fixes` 时行为与现在完全一致，完全向后兼容。

### 应用修复逻辑

在 `prefabNavRoads` 预计算完成后，对匹配 token 的 road string 中的指定点进行坐标覆盖：

```typescript
for (const fix of prefabFixes.fixes) {
  if (fix.appliesTo.includes(p.token)) {
    const navRoads = prefabNavRoads.get(p.token);
    const road = navRoads?.[fix.roadIndex];
    if (road?.points[fix.pointIndex]) {
      // 原始 token 使用绝对坐标，相似 prefab 使用 delta 偏移
      if (p.token === fix.token) {
        road.points[fix.pointIndex] = fix.correctedCoords as [number, number];
      } else {
        const [x, y] = road.points[fix.pointIndex];
        road.points[fix.pointIndex] = [x + fix.delta[0], y + fix.delta[1]];
      }
    }
  }
}
```

**重要规则**：对 `appliesTo` 中除原始 token 以外的相似 prefab，应用 `delta` 偏移量（而非 `correctedCoords` 绝对坐标），因为不同 prefab 的局部坐标系不同。

---

## 颜色图例

在 `Preview.tsx` 和 `EditMode.tsx` 的 SVG 下方各加一个图例：

| 颜色/样式 | 含义 |
|---|---|
| 绿色实心圆 | 原点节点（node 0） |
| 红色实心圆 | 其他节点 |
| 橙色线 | NavCurve 道路（新算法） |
| 红色线 | MapPoints 道路（旧算法） |
| 蓝色箭头线 | 车道曲线（导航方向） |
| 灰色空心圆 | 可拖拽控制点（编辑模式） |
| 橙色实心圆 | 已修改控制点（编辑模式） |

---

## 依赖变更

`packages/apps/prefabs/package.json` 新增：
```json
"@use-gesture/react": "^10.x"
```
