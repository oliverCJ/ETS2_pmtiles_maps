import { Grid, Button } from '@mui/joy';
import { useState, useCallback } from 'react';
import { Details } from './Details';
import { EditMode } from './EditMode';
import { FixPanel } from './FixPanel';
import { LaneControl } from './LaneControl';
import type { PrefabOption } from './PrefabSelect';
import { PrefabSelect } from './PrefabSelect';
import { Preview } from './Preview';
import type { FixEntry } from './types';

const App = () => {
  const [active, setActive] = useState<PrefabOption | undefined>();
  const [editMode, setEditMode] = useState(false);
  // editedPoints: 编辑模式中临时的拖拽状态（roadIndex-pointIndex → [x, y]）
  const [editedPoints, setEditedPoints] = useState<Map<string, [number, number]>>(new Map());
  // confirmedFixes: 用户点击"应用"后确认的修复
  const [confirmedFixes, setConfirmedFixes] = useState<
    Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[]
  >([]);
  const [allPrefabDescs, setAllPrefabDescs] = useState<PrefabOption[]>([]);

  const onChange = (p: PrefabOption | undefined) => {
    setActive(p);
    setEditMode(false);
    setEditedPoints(new Map());
    setConfirmedFixes([]);
  };

  const handlePointChange = useCallback((key: string, coords: [number, number]) => {
    setEditedPoints(prev => new Map(prev).set(key, coords));
  }, []);

  const handleReset = () => {
    setEditedPoints(new Map());
  };

  const handleApply = (fixes: Omit<FixEntry, 'token' | 'comment' | 'appliesTo'>[]) => {
    setConfirmedFixes(fixes);
    setEditedPoints(new Map());
  };

  // 导出 prefab-fixes.json：触发浏览器下载
  const handleExport = (fixes: FixEntry[]) => {
    const existing = { fixes: [] as FixEntry[] };
    const merged = { fixes: [...existing.fixes, ...fixes] };
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prefab-fixes.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Grid
      container
      padding={2}
      spacing={2}
      sx={{ flexGrow: 1, maxHeight: '100vh', overflow: 'hidden' }}
    >
      <Grid xs={12} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <PrefabSelect onChange={onChange} onLoad={setAllPrefabDescs} />
        {active && (
          <Button
            variant={editMode ? 'solid' : 'outlined'}
            color="warning"
            size="sm"
            onClick={() => {
              setEditMode(v => !v);
              setEditedPoints(new Map());
            }}
          >
            {editMode ? '退出编辑' : '编辑模式'}
          </Button>
        )}
      </Grid>

      <Grid xs={8} sx={{ height: 'calc(100vh - 80px)' }}>
        {active && (
          <>
            {editMode ? (
              <EditMode
                prefab={active.value.prefabDesc}
                editedPoints={editedPoints}
                onPointChange={handlePointChange}
                onReset={handleReset}
                onApply={handleApply}
              />
            ) : (
              <>
                <LaneControl prefab={active.value.prefabDesc} />
                <Preview prefab={active.value.prefabDesc} />
              </>
            )}
          </>
        )}
      </Grid>

      <Grid xs={4} sx={{ height: 'calc(100vh - 80px)', overflowY: 'scroll' }}>
        {active && (
          <>
            {editMode ? (
              <FixPanel
                prefab={active.value.prefabDesc}
                prefabToken={active.value.prefabDesc.token}
                allPrefabDescs={allPrefabDescs.map(o => o.value.prefabDesc)}
                confirmedFixes={confirmedFixes}
                onExport={handleExport}
              />
            ) : (
              <Details
                prefab={active.value.prefabDesc}
                locations={active.value.locations}
              />
            )}
          </>
        )}
      </Grid>
    </Grid>
  );
};

export default App;
