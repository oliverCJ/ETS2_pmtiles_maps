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
