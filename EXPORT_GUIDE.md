# ETS2LA Maps 导出流程

完整流程分两步：**parser**（游戏文件 → JSON）和 **generator**（JSON → PMTiles/GeoJSON）。
两步都需要在 **WSL Ubuntu** 终端中运行。

---

## 环境要求

- WSL2 + Ubuntu（安装方式见 `D:\work\code\tippecanoe-2.79.0\BUILD_WINDOWS_WSL.md`）
- Node.js 22（nvm 安装）
- tippecanoe 2.79.0（已编译安装到 WSL）
- npm 依赖已安装（`npm install`）
- parser native addon 已编译（`cd packages/clis/parser && npm run build`）

---

## 第一步：Parser（游戏文件 → JSON 中间文件）

解析 ETS2 游戏 `.scs` 文件，输出 JSON 到 `./data` 目录。**耗时较长，内存占用大。**

```bash
cd ~/ETS2LA_maps

NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/parser/index.ts \
  -g "/mnt/d/SteamLibrary/steamapps/common/Euro Truck Simulator 2" \
  -o ./data

NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/parser/index.ts \
  -g "/mnt/f/SteamLibrary/steamapps/common/American Truck Simulator" \
  -o ./data
```

**常用参数：**
| 参数 | 说明 |
|------|------|
| `-g` | ETS2/ATS 游戏目录路径 |
| `-o` | JSON 输出目录 |
| `-m` | mods 目录（可选） |
| `-l` | game.log.txt 路径，用于确定 mod 加载顺序（可选） |
| `--onlyDefs` | 只解析 /def 数据（可选） |
| `--dryRun` | 不写出文件，仅测试（可选） |

---

## 第二步：Generator（JSON → PMTiles）

读取 parser 生成的 JSON，输出 PMTiles/GeoJSON 到 `./output` 目录。

**游戏坐标元数据**：生成 PMTiles 时会同时导出一个 `.metadata.json` 文件，包含以下信息用于前端坐标系统映射：

- `tsnBounds`: 游戏坐标边界 (minX, minY, maxX, maxY) - 原始游戏坐标
- `tsnGame`: 游戏类型 ("ets2" 或 "ats")
- `tsnAxis`: Y 轴方向信息 (yUp: true)
- `tsnProjection`: 投影类型描述 (game-linear-to-webmercator)
- `tsnMetaVersion`: 元数据版本号 (当前为 1)

示例：生成 `ets2.pmtiles` 时会同时生成 `ets2.metadata.json`

```bash
cd ~/ETS2LA_maps

NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts map \
  -m europe \
  -i ./data \
  -o ./output \
  -t pmtiles
```

**`-m` 参数说明：**
| 值 | 游戏 | 输出文件名 |
|----|------|------------|
| `europe` | 欧洲卡车模拟2（ETS2） | `ets2.pmtiles` |
| `usa` | 美国卡车模拟（ATS） | `ats.pmtiles` |

**`-t` 参数说明（可多次指定）：**
| 值 | 说明 |
|----|------|
| `pmtiles` | PMTiles 格式（默认，需要 tippecanoe） |
| `geojson` | GeoJSON 格式（不需要 tippecanoe） |
| `mbtiles` | MBTiles 格式（需要 tippecanoe） |

**其他常用参数：**
| 参数 | 说明 |
|------|------|
| `-i` | parser 输出的 JSON 目录 |
| `-o` | 最终文件输出目录 |
| `-f` | 聚焦某个城市（只导出该城市附近区域） |
| `-r` | 聚焦半径，单位米，默认 5000 |
| `--includeHidden` | 包含隐藏道路和预制件 |
| `--dryRun` | 不写出文件，仅测试 |

---

## 导出其他数据（可选）

generator 还支持其他子命令。**注意：所有命令都需要加 `NODE_OPTIONS` 避免内存不足。**

```bash
# 图标 spritesheet（前端显示图标必须）
# 输出：sprite.png, sprite.json, sprite@2x.png, sprite@2x.json
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts spritesheet \
  -i ./data -o ./output

# 城市数据
# 输出：cities.json
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts cities \
  -m europe -i ./data -o ./output

# 路线图
# 输出：graph.json
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts graph \
  -m europe -i ./data -o ./output

# 等高线（需要 tippecanoe）
# 输出：contours.pmtiles
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts contours \
  -m europe -i ./data -o ./output -t pmtiles

# 建筑轮廓（需要 tippecanoe）
# 输出：footprints.pmtiles
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts footprints \
  -m europe -i ./data -o ./output -t pmtiles

# 成就数据
# 输出：achievements.json
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts achievements \
  -m europe -i ./data -o ./output

# 世界底图（需要 tippecanoe）
# 输出：world.pmtiles
# 注意：此命令使用 Natural Earth 数据生成底图，包含水体、国家和州边界
tippecanoe -o ./output/world.pmtiles \
  -Z0 -z6 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  -L water:packages/clis/generator/resources/water.geojson \
  -L states:packages/clis/generator/resources/states.geojson \
  -L countries:packages/clis/generator/resources/countries.geojson
```

**完整输出文件清单：**

| 文件 | 命令 | 说明 |
|------|------|------|
| `ets2.pmtiles` | `map` | 道路、区域矢量地图 |
| `ets2.metadata.json` | `map` | 游戏坐标元数据 |
| `sprites.png` / `sprites.json` | `spritesheet` | 图标 spritesheet（前端必须，共用） |
| `sprites@2x.png` / `sprites@2x.json` | `spritesheet` | 2x 图标 spritesheet |
| `cities.geojson` | `cities` | 城市和国家数据（可合并多游戏） |
| `europe-graph.json` | `graph` | 路线图 |
| `ets2-contours.pmtiles` | `contours` | 等高线 |
| `ets2-footprints.pmtiles` | `footprints` | 建筑轮廓 |
| `ets2-achievements.geojson` | `achievements` | 成就数据 |
| `world.pmtiles` | `tippecanoe` | 世界底图（水体、国家、州边界） |

---

## 内存不足时

如果出现 `JavaScript heap out of memory`，调整 `--max-old-space-size` 的值：

| 值 | 内存上限 |
|----|----------|
| `8192` | 8 GB |
| `12288` | 12 GB（推荐，16GB 系统） |
| `16384` | 16 GB |
| `32768` | 32 GB |

---

## 输出文件位置

WSL 中的输出目录对应 Windows 路径：

| WSL 路径 | Windows 路径 |
|----------|-------------|
| `~/ETS2LA_maps/data/` | `\\wsl$\Ubuntu\home\用户名\ETS2LA_maps\data\` |
| `~/ETS2LA_maps/output/` | `\\wsl$\Ubuntu\home\用户名\ETS2LA_maps\output\` |

在 Windows 文件管理器地址栏输入 `\\wsl$\Ubuntu\` 可以浏览 WSL 文件系统。

## 启动前端应用

```bash
# Prefabs 调试工具（不需要地图数据，直接可用）
npm start --workspace=packages/apps/prefabs

# 主地图应用（需要 PMTiles 文件）
npm start --workspace=packages/apps/demo
```

demo app 需要 PMTiles 地图数据才能显示内容，prefabs app 是纯前端调试工具，不需要任何外部数据，直接就能看到效果。

---

## 验证 NavCurves 道路修改效果

本项目对 prefab 道路生成算法做了重要改进：将原来基于 `mapPoints` 的道路生成替换为基于 `navCurves` 的方案，解决了路口断路、分叉缺口、并行道路错位等问题。

### 方法一：Prefabs App 可视化对比（推荐，最快）

不需要跑 generator，直接在 prefabs app 里对比新旧算法效果。

**1. 将游戏数据复制到 prefabs app 的 public 目录**

```bash
# ETS2 数据
cp /path/to/data/europe-prefabDescriptions.json packages/apps/prefabs/public/
cp /path/to/data/europe-prefabs.json packages/apps/prefabs/public/
cp /path/to/data/europe-nodes.json packages/apps/prefabs/public/

# ATS 数据（可选）
cp /path/to/data/usa-prefabDescriptions.json packages/apps/prefabs/public/
cp /path/to/data/usa-prefabs.json packages/apps/prefabs/public/
cp /path/to/data/usa-nodes.json packages/apps/prefabs/public/
```

**2. 启动 prefabs app**

```bash
npm start --workspace=packages/apps/prefabs
```

**3. 查看对比**

- 顶部切换 `ATS` / `ETS2` 选择游戏
- 搜索框输入关键词找到目标 prefab（如 `cross`、`split`、`roundabout`）
- SVG 预览中各颜色含义：
  - **红色线**：旧算法（mapPoints）生成的道路
  - **橙色线**：新算法（navCurves）生成的道路 ← 这是 generator 实际使用的
  - **蓝色箭头线**：车道曲线（导航方向）
  - **绿色圆点**：原点节点（node 0）
  - **红色圆点**：其他节点

**4. 验证重点**

| 路口类型 | 搜索关键词 | 验证内容 |
|---|---|---|
| T 型路口 | `cross` | 三条橙色线端点应精确汇聚到节点圆点上 |
| Y 型分叉 | `split` / `fork` | 两条并行线起点对齐，无 V 形缺口 |
| 十字路口 | `cross` + 4节点 | 四条线在中心点精确相交 |
| 高速分隔 | `hw` / `divided` | 双向道路显示为两条独立平行线 |
| 环形交叉 | `roundabout` | 进出口连接正确，不崩溃 |

---

### 方法二：生成 GeoJSON 后用 geojson.io 调试

> **注意**：ETS2/ATS 使用游戏自定义坐标系，直接拖入 geojson.io 会显示在错误位置（通常在大西洋或非洲附近）。需要用 `--focusCity` 参数生成小范围数据，再通过坐标偏移找到正确位置。

**1. 生成小范围 GeoJSON（WSL 终端）**

```bash
cd ~/ETS2LA_maps

# ETS2：聚焦某个城市，生成 GeoJSON（不需要 tippecanoe）
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts map \
  -m europe \
  -i ./data \
  -o ./output_debug \
  -t geojson \
  -f "Praha"

# ATS：聚焦某个城市
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts map \
  -m usa \
  -i ./data \
  -o ./output_debug \
  -t geojson \
  -f "Sacramento"
```

输出文件：`./output_debug/ets2.geojson`（约几十 MB）

**2. 在 geojson.io 中查看**

由于游戏坐标系与真实世界不同，GeoJSON 数据会显示在错误位置。查找方法：

1. 打开 [geojson.io](https://geojson.io)，将生成的 `.geojson` 文件拖入页面
2. 数据加载后，在右侧 JSON 面板找任意一个 Feature 的 `coordinates`，记下大概坐标范围
3. 在地图左下角的坐标输入框跳转到对应坐标，或使用 `Ctrl+F` 搜索

**实际坐标范围参考：**

| 游戏 | 经度范围 | 纬度范围 |
|---|---|---|
| ETS2（欧洲） | 约 -10° ~ 40° | 约 30° ~ 65° |
| ATS（美国） | 约 -130° ~ -60° | 约 25° ~ 55° |

> ETS2 的坐标投影会把游戏地图映射到真实欧洲的大致位置，所以实际上可以在 geojson.io 的欧洲区域找到数据。

**3. 验证重点**

在 geojson.io 中点击有问题的路段，查看右侧 properties 面板：

```json
{
  "type": "road",
  "prefab": "2o0ds",      ← 这是 prefab token，可在 prefabs app 中搜索
  "roadType": "local",
  "leftLanes": 2,
  "rightLanes": 2
}
```

记下 `prefab` 字段的 token，在 prefabs app 中搜索该 token，可以直接看到这个路口的几何形状和新旧算法对比。

---

### 方法三：生成 PMTiles 后用 demo app 验证（完整验证）

这是最完整的验证方式，能看到最终渲染效果。

**1. 生成 PMTiles（WSL 终端，需要 tippecanoe）**

```bash
NODE_OPTIONS="--max-old-space-size=12288" npx tsx packages/clis/generator/index.ts map \
  -m europe \
  -i ./data \
  -o ./output \
  -t pmtiles
```

**2. 配置 demo app 加载本地 PMTiles**

将生成的 `ets2.pmtiles` 放到 demo app 可访问的位置，参考 `packages/apps/demo` 的配置文档。

**3. 启动 demo app**

```bash
npm start --workspace=packages/apps/demo
```

在地图上找到路口密集区域（如布拉格、巴黎周边），放大到街道级别，检查路口连接是否正确。