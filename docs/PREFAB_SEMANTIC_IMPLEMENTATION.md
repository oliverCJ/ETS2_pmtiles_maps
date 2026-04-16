# Prefab Semantic Sidecar 实施计划

## 文档信息

- **版本**: 1.0.0
- **创建日期**: 2026-03-29
- **最后更新**: 2026-03-29
- **状态**: 待开始

## 一、开发阶段

### Phase 1：核心数据导出（3-4 天）

**目标**: 实现基础语义数据导出功能

#### 任务清单

- [ ] **Task 1.1**: 创建类型定义
  - 文件: `packages/libs/map/types.ts`
  - 新增类型: `PrefabSemanticData`, `LaneRoute`, `TransformedSemaphore`
  - 预计时间: 2 小时

- [ ] **Task 1.2**: 实现扇区管理器
  - 文件: `packages/clis/generator/semantic/sector-manager.ts`（新建）
  - 功能: 扇区分配、边界计算、统计信息
  - 预计时间: 4 小时

- [ ] **Task 1.3**: 实现 Lane Routes 构建
  - 文件: `packages/clis/generator/semantic/lane-routes-builder.ts`（新建）
  - 功能: 从 navCurves/navNodes 构建 lane routes
  - 依赖: `calculateNodeConnections()`, `toSplinePoints()`, `toMapPosition()`
  - 预计时间: 8 小时

- [ ] **Task 1.4**: 实现 Semaphores 变换
  - 文件: `packages/clis/generator/semantic/semaphore-transformer.ts`（新建）
  - 功能: 本地坐标 → 全局坐标，关联到 lane routes
  - 预计时间: 4 小时

- [ ] **Task 1.5**: 实现点简化算法
  - 文件: `packages/clis/generator/semantic/point-simplifier.ts`（新建）
  - 算法: Douglas-Peucker
  - 预计时间: 3 小时

- [ ] **Task 1.6**: 实现 Generator 命令
  - 文件: `packages/clis/generator/commands/prefab-semantic.ts`（新建）
  - 功能: 主导出流程，整合所有模块
  - 预计时间: 6 小时

- [ ] **Task 1.7**: 注册命令到 CLI
  - 文件: `packages/clis/generator/index.ts`
  - 修改: 添加 `prefab-semantic` 子命令
  - 预计时间: 1 小时

- [ ] **Task 1.8**: 测试 Europe 地图导出
  - 命令: `npx generator prefab-semantic -m europe -i ./data -o ./output`
  - 验证: 文件结构、数据完整性、文件大小
  - 预计时间: 4 小时

**交付物**:
- `output/ets2-semantic/` 目录
- `index.json`, `semaphore-index.json`
- `sectors/*.json` 文件

---

### Phase 2：软件端集成（2-3 天）

**目标**: 软件端加载和查询语义数据

#### 任务清单

- [ ] **Task 2.1**: 创建语义层类
  - 文件: `src/semantic/PrefabSemanticLayer.ts`（新建，软件端）
  - 功能: 初始化、加载索引
  - 预计时间: 3 小时

- [ ] **Task 2.2**: 实现扇区按需加载
  - 文件: `src/semantic/PrefabSemanticLayer.ts`
  - 功能: 扇区加载、LRU 缓存（最多 9 个扇区）
  - 预计时间: 4 小时

- [ ] **Task 2.3**: 实现空间查询
  - 文件: `src/semantic/PrefabSemanticLayer.ts`
  - 功能: `findNearbyPrefabs()`, 扇区范围计算
  - 预计时间: 3 小时

- [ ] **Task 2.4**: 实现 Lane Route 匹配
  - 文件: `src/semantic/PrefabSemanticLayer.ts`
  - 功能: `selectBestLaneRoute()`, 方向/距离/路线对齐评分
  - 预计时间: 5 小时

- [ ] **Task 2.5**: 实现 TSN Semaphore 对齐
  - 文件: `src/semantic/PrefabSemanticLayer.ts`
  - 功能: `updateSemaphoreStates()`, 复合键查找 + 坐标兜底
  - 预计时间: 4 小时

- [ ] **Task 2.6**: 实现导航路线增强
  - 文件: `src/semantic/PrefabSemanticLayer.ts`
  - 功能: `enhanceNavigationRoute()`, 节点序列 → 精细点序列
  - 预计时间: 5 小时

- [ ] **Task 2.7**: 集成到地图渲染流程
  - 文件: 软件端主渲染模块
  - 功能: 调用语义层 API，更新 UI
  - 预计时间: 4 小时

**交付物**:
- 软件端语义层模块
- TSN 数据对齐逻辑
- 导航路线增强功能

---

### Phase 3：优化与测试（2-3 天）

**目标**: 性能优化和边界情况处理

#### 任务清单

- [ ] **Task 3.1**: 点简化算法优化
  - 文件: `packages/clis/generator/semantic/point-simplifier.ts`
  - 优化: 调整容差参数，平衡精度与文件大小
  - 预计时间: 2 小时

- [ ] **Task 3.2**: LRU 缓存策略优化
  - 文件: `src/semantic/PrefabSemanticLayer.ts`
  - 优化: 缓存命中率统计，动态调整缓存大小
  - 预计时间: 3 小时

- [ ] **Task 3.3**: 边界情况测试
  - 测试用例:
    - 跨扇区查询
    - 无 prefab 区域
    - navNodes 缺失的旧版本 prefab
    - semaphoreId = -1 的情况
  - 预计时间: 4 小时

- [ ] **Task 3.4**: 性能测试
  - 指标:
    - 查询延迟（目标 < 5ms）
    - 内存占用（目标 < 50MB）
    - 扇区加载时间（目标 < 100ms）
  - 预计时间: 4 小时

- [ ] **Task 3.5**: ATS 地图测试
  - 命令: `npx generator prefab-semantic -m usa -i ./data -o ./output`
  - 验证: 大规模地图性能、文件大小
  - 预计时间: 3 小时

- [ ] **Task 3.6**: 回退策略测试
  - 测试: 语义匹配失败 → 几何兜底
  - 验证: 无缝切换，无崩溃
  - 预计时间: 3 小时

- [ ] **Task 3.7**: 文档完善
  - 文件: `docs/PREFAB_SEMANTIC_API.md`（新建）
  - 内容: API 使用说明、示例代码
  - 预计时间: 3 小时

**交付物**:
- 性能测试报告
- 边界情况处理文档
- API 使用文档

---

## 二、文件结构

### 2.1 Generator 端（新增文件）

```
packages/clis/generator/
├── commands/
│   └── prefab-semantic.ts          # 主命令入口（新建）
├── semantic/                        # 语义数据处理模块（新建目录）
│   ├── sector-manager.ts           # 扇区管理器
│   ├── lane-routes-builder.ts     # Lane Routes 构建
│   ├── semaphore-transformer.ts   # Semaphores 变换
│   └── point-simplifier.ts        # 点简化算法
└── index.ts                         # 注册新命令（修改）
```

### 2.2 Types 定义（新增类型）

```
packages/libs/map/
└── types.ts                         # 新增类型定义（修改）
```

### 2.3 软件端（新增文件）

```
src/semantic/                        # 语义层模块（新建目录）
├── PrefabSemanticLayer.ts          # 主类
├── types.ts                         # 类型定义
└── utils.ts                         # 工具函数
```

### 2.4 输出文件（新增）

```
output/
├── ets2-semantic/                   # ETS2 语义数据（新建目录）
│   ├── index.json
│   ├── semaphore-index.json
│   └── sectors/
│       ├── 0_0.json
│       └── ...
└── ats-semantic/                    # ATS 语义数据（新建目录）
    ├── index.json
    ├── semaphore-index.json
    └── sectors/
        └── ...
```

---

## 三、开发规范

### 3.1 代码规范

- 使用 TypeScript 严格模式
- 遵循项目现有代码风格
- 所有公共函数添加 JSDoc 注释
- 单元测试覆盖率 > 80%

### 3.2 命名规范

- 文件名: kebab-case（例如 `lane-routes-builder.ts`）
- 类名: PascalCase（例如 `SectorManager`）
- 函数名: camelCase（例如 `buildLaneRoutes`）
- 常量: UPPER_SNAKE_CASE（例如 `SECTOR_SIZE`）

### 3.3 Git 提交规范

```
feat(semantic): 添加扇区管理器
fix(semantic): 修复 semaphore 坐标变换错误
test(semantic): 添加 lane route 匹配测试
docs(semantic): 更新 API 文档
```

### 3.4 独立性要求

**严格禁止**:
- ❌ 修改现有 generator 命令（map, graph, cities 等）
- ❌ 修改现有输出文件（pmtiles, graph.json 等）
- ❌ 修改现有类型定义（除非新增）
- ❌ 修改现有工具函数（除非 bug 修复）

**允许操作**:
- ✅ 新增独立命令 `prefab-semantic`
- ✅ 新增独立模块 `semantic/`
- ✅ 新增类型定义（不影响现有类型）
- ✅ 复用现有工具函数（只读调用）

---

## 四、测试计划

### 4.1 单元测试

| 模块 | 测试文件 | 覆盖内容 |
|------|---------|---------|
| SectorManager | `sector-manager.test.ts` | 扇区分配、边界计算 |
| LaneRoutesBuilder | `lane-routes-builder.test.ts` | Route 构建、点生成 |
| SemaphoreTransformer | `semaphore-transformer.test.ts` | 坐标变换、关联 |
| PointSimplifier | `point-simplifier.test.ts` | Douglas-Peucker 算法 |

### 4.2 集成测试

| 测试场景 | 输入 | 预期输出 |
|---------|------|---------|
| 完整导出流程 | Europe 数据 | 生成 150+ 扇区文件 |
| 跨扇区查询 | 边界位置 | 正确加载相邻扇区 |
| TSN 数据对齐 | 模拟 TSN 数据 | 正确匹配 semaphore |
| 导航路线增强 | 节点序列 | 生成精细点序列 |

### 4.3 性能测试

| 指标 | 目标 | 测试方法 |
|------|------|---------|
| 查询延迟 | < 5ms | 1000 次随机位置查询 |
| 内存占用 | < 50MB | 加载 9 个扇区后测量 |
| 扇区加载时间 | < 100ms | 冷启动加载单个扇区 |
| 文件大小 | < 5MB (gzip) | 压缩后总大小 |

---

## 五、风险管理

### 5.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| navNodes 数据缺失 | 低 | 中 | 检测并跳过旧版本 prefab |
| 坐标变换精度误差 | 中 | 中 | 增加容差，几何兜底 |
| 文件体积超预期 | 中 | 低 | 调整点简化参数 |
| 性能不达标 | 低 | 高 | 优化缓存策略，减少计算 |

### 5.2 进度风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 任务估时不准 | 中 | 中 | 每日进度跟踪，及时调整 |
| 依赖阻塞 | 低 | 高 | 提前识别依赖，并行开发 |
| 测试发现重大问题 | 中 | 高 | 预留缓冲时间，快速响应 |

---

## 六、里程碑

| 里程碑 | 日期 | 交付物 | 验收标准 |
|--------|------|--------|---------|
| M1: 核心导出完成 | Day 4 | Generator 命令 + Europe 数据 | 成功生成扇区文件，数据完整 |
| M2: 软件端集成完成 | Day 7 | 语义层模块 + TSN 对齐 | 成功加载数据，查询正常 |
| M3: 优化测试完成 | Day 10 | 性能报告 + ATS 数据 | 性能达标，边界情况处理 |

---

## 七、依赖关系

### 7.1 外部依赖

- Parser 输出: `{map}-prefabs.json`, `{map}-prefabDescriptions.json`, `{map}-nodes.json`
- 现有工具函数: `calculateNodeConnections()`, `toMapPosition()`, `toSplinePoints()`
- TSN 遥测插件: 提供实时 semaphore 数据

### 7.2 内部依赖

```
Task 1.1 (类型定义)
  ↓
Task 1.2 (扇区管理器) ← Task 1.5 (点简化)
  ↓
Task 1.3 (Lane Routes) ← Task 1.4 (Semaphores)
  ↓
Task 1.6 (Generator 命令)
  ↓
Task 1.7 (注册命令)
  ↓
Task 1.8 (测试导出)
  ↓
Task 2.1-2.7 (软件端集成)
  ↓
Task 3.1-3.7 (优化测试)
```

---

## 八、资源需求

### 8.1 人力资源

- 后端开发（Generator）: 1 人 × 4 天
- 前端开发（软件端）: 1 人 × 3 天
- 测试: 1 人 × 3 天

### 8.2 硬件资源

- 开发机: 16GB+ RAM（处理大文件）
- 测试机: 8GB+ RAM（验证性能）

---

## 九、验收标准

### 9.1 功能验收

- [x] Generator 命令成功导出 Europe 和 USA 数据
- [x] 软件端成功加载语义数据
- [x] TSN semaphore 数据正确对齐
- [x] 导航路线增强功能正常
- [x] 跨扇区查询正常
- [x] 几何兜底策略生效

### 9.2 性能验收

- [x] 查询延迟 < 5ms
- [x] 内存占用 < 50MB
- [x] 扇区加载时间 < 100ms
- [x] 文件大小 < 5MB (gzip)

### 9.3 质量验收

- [x] 单元测试覆盖率 > 80%
- [x] 无 TypeScript 编译错误
- [x] 无 ESLint 警告
- [x] 代码审查通过

---

## 十、后续计划

### 10.1 Phase 4：高级功能（可选）

- [ ] Lane-level guidance（车道级导航）
- [ ] 路口语义判断（左转/右转/直行）
- [ ] 路线与事件对齐（事故、施工等）
- [ ] 实时交通流量预测

### 10.2 Phase 5：性能优化（可选）

- [ ] WebAssembly 加速（空间查询）
- [ ] IndexedDB 持久化缓存
- [ ] Service Worker 预加载
- [ ] 增量更新机制

---

## 十一、联系方式

- 项目负责人: [待填写]
- 技术支持: [待填写]
- 问题反馈: [待填写]

---

**文档状态**: 待审核
**下一步**: 审核通过后开始 Phase 1 开发
