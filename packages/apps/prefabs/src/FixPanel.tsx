import { toNavCurveRoadStrings } from '@truckermudgeon/map/prefabs';
import type { PrefabDescription } from '@truckermudgeon/map/types';
import { distance } from '@truckermudgeon/base/geom';
import { useState } from 'react';
import type { FixEntry, PrefabStructureFeatures } from './types';

interface FixPanelProps {
  prefab: PrefabDescription;
  prefabToken: string;
  allPrefabDescs: (PrefabDescription & { token: string; path: string })[];
  confirmedFixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[];
  onExport: (fixes: FixEntry[]) => void;
}

function getStructureFeatures(prefab: PrefabDescription): PrefabStructureFeatures {
  const navRoads = toNavCurveRoadStrings(prefab);
  let isDivided = false;
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
  const maxLanes = navRoads.length
    ? Math.max(...navRoads.map(r => Math.max(r.leftLaneCount, r.rightLaneCount)))
    : 0;
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

function generateAlgorithmSuggestion(
  fixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[],
  features: PrefabStructureFeatures,
): string {
  if (fixes.length === 0) return '';
  const avg = fixes.reduce(
    (acc, f) => [acc[0] + Math.abs(f.delta[0]), acc[1] + Math.abs(f.delta[1])] as [number, number],
    [0, 0] as [number, number],
  );
  const avgDelta: [number, number] = [avg[0] / fixes.length, avg[1] / fixes.length];

  const hasEndpointFix = fixes.some(f => f.pointIndex === 0);
  if (hasEndpointFix) {
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
          return isSimilar(features, getStructureFeatures(d));
        } catch {
          return false;
        }
      })
      .map(d => ({ token: d.token, checked: true }));
    setSimilarPrefabs(results);
  };

  const handleExport = () => {
    const selectedTokens = [
      prefabToken,
      ...similarPrefabs.filter(s => s.checked).map(s => s.token),
    ];
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
                <span style={{ color: '#888' }}>
                  {' '}
                  Δ=({f.delta[0].toFixed(2)}, {f.delta[1].toFixed(2)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

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

      {showSuggestion && suggestion && (
        <pre
          style={{
            background: '#f5f5f5',
            padding: 10,
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {suggestion}
        </pre>
      )}
    </div>
  );
};
