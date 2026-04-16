import { getExtent } from '@truckermudgeon/base/geom';
import {
  calculateLaneInfo,
  toNavCurveRoadStrings,
  toRoadStringsAndPolygons,
} from '@truckermudgeon/map/prefabs';
import type { PrefabDescription } from '@truckermudgeon/map/types';
import simplify from '@turf/simplify';
import * as turf from '@turf/helpers';
import React, { useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { Legend } from './Legend';
import type { FixEntry } from './types';

// 控制点抽稀：每条道路线保留 3-8 个点，端点永远保留
function thinPoints(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  const line = turf.lineString(points);
  const simplified = simplify(line, { tolerance: 0.5, mutate: false });
  const result = simplified.geometry.coordinates as [number, number][];
  // 保证端点不变
  result[0] = points[0];
  result[result.length - 1] = points[points.length - 1];
  return result;
}

// ---- DraggablePoint 必须定义在组件外部 ----
// 定义在内部会导致每次父组件重渲染时 useDrag 手势状态丢失，拖拽中断
interface DraggablePointProps {
  pointKey: string;
  coords: [number, number];
  isModified: boolean;
  viewBoxWidth: number;
  pointRadius: number;
  svgRef: React.RefObject<SVGSVGElement>;
  activeKey: string | null;
  onPointChange: (key: string, coords: [number, number]) => void;
  onActiveKeyChange: (key: string | null) => void;
}

const DraggablePoint = React.memo(({
  pointKey,
  coords,
  isModified,
  viewBoxWidth,
  pointRadius,
  svgRef,
  activeKey,
  onPointChange,
  onActiveKeyChange,
}: DraggablePointProps) => {
  const bind = useDrag(({ delta: [dx, dy], active }) => {
    if (!svgRef.current) return;
    if (!active) {
      // 拖拽结束，清除 tooltip，不更新坐标（避免点击误触发修改）
      onActiveKeyChange(null);
      return;
    }
    // 屏幕像素 → SVG 单位（viewBox 坐标系）
    const scale = viewBoxWidth / svgRef.current.clientWidth;
    onPointChange(pointKey, [coords[0] + dx * scale, coords[1] + dy * scale]);
    onActiveKeyChange(pointKey);
  }, { filterTaps: true });

  const isActive = activeKey === pointKey;
  const r = isActive ? pointRadius * 2 : isModified ? pointRadius * 1.4 : pointRadius;

  return (
    <g {...bind()} style={{ touchAction: 'none' }}>
      {/* 扩大点击/拖拽热区，不影响视觉 */}
      <circle
        cx={coords[0]} cy={coords[1]}
        r={pointRadius * 3}
        fill="transparent"
        style={{ cursor: 'grab' }}
      />
      <circle
        cx={coords[0]} cy={coords[1]}
        r={r}
        fill={isModified ? 'orange' : 'rgba(100,100,100,0.15)'}
        stroke={isModified ? '#c66' : '#666'}
        strokeWidth={pointRadius * 0.35}
        style={{ cursor: 'grab', pointerEvents: 'none' }}
      />
      {isActive && (
        <text
          x={coords[0] + r * 1.8}
          y={coords[1] - r}
          fontSize={pointRadius * 2.2}
          fill="#333"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ({coords[0].toFixed(1)}, {coords[1].toFixed(1)})
        </text>
      )}
    </g>
  );
});
DraggablePoint.displayName = 'DraggablePoint';

interface EditModeProps {
  prefab: PrefabDescription;
  // editedPoints: key = `${roadIndex}-${pointIndex}`, value = [x, y]（prefab 局部坐标）
  editedPoints: Map<string, [number, number]>;
  onPointChange: (key: string, newCoords: [number, number]) => void;
  onReset: () => void;
  onApply: (fixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[]) => void;
}

export const EditMode = ({
  prefab,
  editedPoints,
  onPointChange,
  onReset,
  onApply,
}: EditModeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  // 当前正在拖拽的控制点 key（用于显示 tooltip）
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const [minX, minY, maxX, maxY] = getExtent(
    (prefab.mapPoints as { x: number; y: number }[])
      .concat(prefab.nodes)
      .concat(prefab.navCurves.flatMap(nc => [nc.start, nc.end])),
  );
  const { polygons } = toRoadStringsAndPolygons(prefab);
  const navRoadStrings = toNavCurveRoadStrings(prefab);
  const laneInfo = calculateLaneInfo(prefab);

  const width = Math.max(5, maxX - minX);
  const height = Math.max(5, maxY - minY);
  const xPadding = width * 0.2;
  const yPadding = height * 0.2;
  const viewBoxWidth = width + xPadding * 2;
  const viewBoxHeight = height + yPadding * 2;

  // 控制点半径按 viewBox 比例计算，约为宽度的 1.2%
  const pointRadius = viewBoxWidth * 0.012;

  const mapColors: Record<number, string> = {
    0: '#eaeced', 1: '#e6cc9f', 2: '#d8a54e', 3: '#b1ca9b',
    4: '#ff00ff', 5: '#ff00ff', 6: '#ff00ff', 7: '#ff00ff', 8: '#ff00ff',
  };

  // 构建每条道路的当前控制点（应用 editedPoints 覆盖）
  const roadControlPoints = navRoadStrings.map((rs, roadIndex) => {
    const thinned = thinPoints(rs.points);
    return thinned.map((originalPt, ptIndex) => {
      const key = `${roadIndex}-${ptIndex}`;
      return {
        key,
        coords: editedPoints.get(key) ?? originalPt,
        originalCoords: originalPt,
        isModified: editedPoints.has(key),
      };
    });
  });

  const handleApply = () => {
    const fixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[] = [];
    for (const [key, correctedCoords] of editedPoints) {
      const [roadIndex, pointIndex] = key.split('-').map(Number);
      const original = thinPoints(navRoadStrings[roadIndex].points)[pointIndex];
      fixes.push({
        roadIndex,
        pointIndex,
        originalCoords: original,
        correctedCoords,
        delta: [
          correctedCoords[0] - original[0],
          correctedCoords[1] - original[1],
        ],
      });
    }
    onApply(fixes);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${minX - xPadding} ${minY - yPadding} ${viewBoxWidth} ${viewBoxHeight}`}
        style={{ border: '1px solid', strokeLinecap: 'round', width: '100%', flex: 1 }}
      >
        <defs>
          <marker id="triangleBlueEdit" viewBox="0 0 5 5" refX="1" refY="2.5"
            markerUnits="strokeWidth" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 5 2.5 L 0 5 z" fill="#00f" />
          </marker>
        </defs>

        {/* Polygons */}
        {polygons.filter(p => p.zIndex < 10).map((poly, i) => (
          <polygon key={`poly-under-${i}`} opacity={0.9}
            points={poly.points.map(p => p.join(',')).join(' ')}
            fill={mapColors[poly.color]} />
        ))}

        {/* NavCurve 道路线（跟随编辑点实时更新） */}
        {roadControlPoints.map((pts, ri) => (
          <polyline key={`road-${ri}`}
            stroke="orange" strokeWidth={2} opacity={0.8} fill="none"
            points={pts.map(p => p.coords.join(',')).join(' ')} />
        ))}

        {/* Polygons above */}
        {polygons.filter(p => p.zIndex >= 10).map((poly, i) => (
          <polygon key={`poly-over-${i}`} opacity={0.9}
            points={poly.points.map(p => p.join(',')).join(' ')}
            fill={mapColors[poly.color]} />
        ))}

        {/* 节点 */}
        {prefab.nodes.map((n, i) => (
          <circle key={`node-${i}`} cx={n.x} cy={n.y} r={2}
            fill={i === 0 ? '#0f0' : '#f00'} />
        ))}

        {/* 蓝色 lane curves（只读） */}
        {Array.from(laneInfo.entries()).flatMap(([nodeIndex, lanes]) =>
          lanes.flatMap((lane, laneIndex) =>
            lane.branches.flatMap(({ curvePoints }, branchIndex) => (
              <polyline
                key={`lane-${nodeIndex}-${laneIndex}-${branchIndex}`}
                stroke="blue" strokeWidth={0.4} opacity={0.5} fill="none"
                points={curvePoints.map(p => p.join(',')).join(' ')}
                markerEnd="url(#triangleBlueEdit)"
              />
            ))
          )
        )}

        {/* 可拖拽控制点 */}
        {roadControlPoints.map(pts =>
          pts.map(({ key, coords, isModified }) => (
            <DraggablePoint
              key={key}
              pointKey={key}
              coords={coords}
              isModified={isModified}
              viewBoxWidth={viewBoxWidth}
              pointRadius={pointRadius}
              svgRef={svgRef}
              activeKey={activeKey}
              onPointChange={onPointChange}
              onActiveKeyChange={setActiveKey}
            />
          ))
        )}

        {/* 坐标轴 */}
        <line stroke="gray" strokeDasharray="1 1" strokeWidth={0.2}
          x1={minX - 2 * xPadding} y1={0} x2={maxX + 2 * xPadding} y2={0} />
        <line stroke="gray" strokeDasharray="1 1" strokeWidth={0.2}
          x1={0} y1={minY - 2 * yPadding} x2={0} y2={maxY + 2 * yPadding} />
      </svg>

      <Legend includeEditItems />

      {/* 底部操作栏 */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
        <button onClick={onReset}
          style={{ padding: '4px 12px', cursor: 'pointer' }}>
          重置
        </button>
        <button onClick={handleApply}
          disabled={editedPoints.size === 0}
          style={{ padding: '4px 12px', cursor: 'pointer', fontWeight: 'bold' }}>
          应用 ({editedPoints.size} 个修改)
        </button>
      </div>
    </div>
  );
};
