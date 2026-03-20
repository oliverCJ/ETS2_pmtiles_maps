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
