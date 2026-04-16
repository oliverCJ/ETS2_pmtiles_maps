interface LegendItem {
  color: string;
  label: string;
  shape?: 'circle' | 'line';
  filled?: boolean;
}

const items: LegendItem[] = [
  { color: '#0f0', label: '原点节点 (node 0)', shape: 'circle', filled: true },
  { color: '#f00', label: '其他节点', shape: 'circle', filled: true },
  { color: 'orange', label: 'NavCurve 道路（新算法）', shape: 'line' },
  { color: 'red', label: 'MapPoints 道路（旧算法）', shape: 'line' },
  { color: 'blue', label: '车道曲线（导航方向）', shape: 'line' },
];

export const editModeItems: LegendItem[] = [
  { color: '#aaa', label: '可拖拽控制点', shape: 'circle', filled: false },
  { color: 'orange', label: '已修改控制点', shape: 'circle', filled: true },
];

export const Legend = ({ includeEditItems = false }: { includeEditItems?: boolean }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', padding: '6px 0', fontSize: 12 }}>
    {[...items, ...(includeEditItems ? editModeItems : [])].map(({ color, label, shape, filled }) => (
      <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {shape === 'circle' ? (
          <svg width={12} height={12}>
            <circle
              cx={6} cy={6} r={5}
              fill={filled ? color : 'none'}
              stroke={color}
              strokeWidth={1.5}
            />
          </svg>
        ) : (
          <svg width={18} height={12}>
            <line x1={0} y1={6} x2={18} y2={6} stroke={color} strokeWidth={2.5} />
          </svg>
        )}
        {label}
      </span>
    ))}
  </div>
);
