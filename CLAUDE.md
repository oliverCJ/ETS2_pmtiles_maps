# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

**TruckSim Maps** — 为《美国卡车模拟》(ATS) 和《欧洲卡车模拟2》(ETS2) 构建基于 Web 的互动地图及路线导航仪（Route Advisor）的开源工具集。

## 环境要求

- Node.js >= 22.9.0
- 生成地图需要外部工具 `tippecanoe`（建议在 WSL2/Linux 环境下运行完整导出流程）
- 解析大型游戏地图时需增大 Node.js 内存：`NODE_OPTIONS=--max-old-space-size=8192`

## 常用命令

### 安装依赖

```bash
npm install
```

### 编译 C++ 原生扩展（Parser 必须先执行）

```bash
npm run build -w packages/clis/parser
```

### 代码质量检查（类型检查 + ESLint + Prettier）

```bash
npm run lint
```

### 运行单元测试

```bash
# 指定工作区运行测试
npm run test --workspace=packages/<模块路径>

# 例如运行 parser 的测试
npm run test --workspace=packages/clis/parser
```

### 启动前端应用

```bash
# 主地图 Demo 应用
npm start --workspace=packages/apps/demo

# Prefabs 调试可视化应用
npm start --workspace=packages/apps/prefabs
```

### 完整地图导出流程

参考 `EXPORT_GUIDE.md` 和 `Makefile`，主要步骤：

1. **Parser**（解包游戏文件 → JSON）：
   ```bash
   npx parser -g <游戏目录> -m <Mod目录> -o <输出目录>
   ```

2. **Generator**（JSON → PMTiles/GeoJSON）：
   ```bash
   npx generator map -i <parser输出> -o <生成目录>
   npx generator cities -i <parser输出> -o <生成目录>
   npx generator graph -i <parser输出> -o <生成目录>
   # 其他子命令：contours, footprints, spritesheet
   ```

## 代码架构

这是一个通过 npm workspaces 管理的 **Monorepo**，所有包位于 `packages/` 下，分四类：

### `packages/clis/` — 命令行数据处理工具

| 包 | 职责 |
|---|---|
| `parser` | 读取游戏 `.scs` 归档、解析 SII/Def 配置文件和地图扇区二进制数据，输出中间 JSON（nodes, roads, cities, prefabs 等）。包含 C++ 原生扩展 |
| `generator` | 读取 parser 输出的 JSON，做坐标投影转换（游戏 XYZ → Web 墨卡托经纬度），调用 tippecanoe 生成 PMTiles 矢量切片，生成图标 Spritesheets |

### `packages/apps/` — 前端 Web 应用（Vite + React）

| 包 | 职责 |
|---|---|
| `demo` | 主地图应用：互动地图、路线渲染、城市/成就搜索、实时遥测位置标记 |
| `prefabs` | 开发辅助工具：可视化 Prefab（游戏交叉路口预制件）几何数据的解析过程 |

### `packages/apis/` — 本地服务端 API

| 包 | 职责 |
|---|---|
| `telemetry` | 挂钩游戏内存遥测数据（`trucksim-telemetry`），通过 Express + Socket.io 广播实时卡车位置、速度、朝向 |
| `navigation` | 扩展的服务端路由计算和导航状态推送 |

### `packages/libs/` — 共享库

| 包 | 职责 |
|---|---|
| `api` | 共享类型定义（Telemetry 数据结构等） |
| `base` | 通用工具（断言、基础数学/几何计算） |
| `map` | 核心地图类型、常量、坐标转换投影逻辑 |
| `ui` | 通用 UI 组件、MapLibre 样式定义（`GameMapStyle`）、颜色主题 |

## 数据流

```
游戏 .scs 文件
    ↓ [parser]
中间 JSON 文件（nodes, roads, prefabs, cities, ...）
    ↓ [generator + tippecanoe]
PMTiles 矢量切片 + GeoJSON + Spritesheet
    ↓ [demo app + libs/ui]
Web 互动地图（MapLibre GL 渲染）
    ↑ [telemetry api]
实时游戏遥测数据（Socket.io）
```

## 关键技术点

- **SII/Def 解析**：使用 `chevrotain` 构建完整的词法+语法解析器（`parser/game-files/sii-parser.ts`）
- **坐标转换**：游戏使用自定义 XYZ 坐标系，需通过 `libs/map` 中的 `proj4` 投影转换为 Web 墨卡托经纬度
- **地图样式**：在 `libs/ui/GameMapStyle.tsx` 中定义 Data-Driven MapLibre 样式，按缩放等级和道路类型动态渲染
- **Prefab 处理**：游戏交叉路口是预制件（Prefab），需要特殊的几何算法还原道路连接关系
- **内存消耗**：解析完整游戏地图非常消耗内存，大型 Map 文件处理需 8GB+ 堆内存

## TypeScript 配置

`tsconfig.base.json` 要求严格类型校验（`strict: true`），使用 ESM 模块规范。各包继承此基础配置。测试使用 `vitest`。
