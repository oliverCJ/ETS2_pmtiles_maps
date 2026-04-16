import {
  Autocomplete,
  CircularProgress,
  createFilterOptions,
  List,
  ListDivider,
  Typography,
} from '@mui/joy';
import type { AutocompleteRenderGroupParams } from '@mui/joy/Autocomplete/AutocompleteProps';
import { assertExists } from '@truckermudgeon/base/assert';
import { center, getExtent } from '@truckermudgeon/base/geom';
import { putIfAbsent } from '@truckermudgeon/base/map';
import { fromAtsCoordsToWgs84 } from '@truckermudgeon/map/projections';
import type {
  PrefabDescription as BasePrefab,
  Node,
  Prefab,
  WithPath,
  WithToken,
} from '@truckermudgeon/map/types';
import { useEffect, useState } from 'react';

export type PrefabDescription = WithToken<WithPath<BasePrefab>>;

export interface PrefabOption {
  label: string;
  group: string;
  value: {
    prefabDesc: PrefabDescription;
    locations: {
      lng: number;
      lat: number;
      hidden: boolean;
    }[];
  };
}

type GameMap = 'usa' | 'europe';

interface PrefabSelectProps {
  onChange: (o: PrefabOption | undefined) => void;
  onLoad?: (options: PrefabOption[]) => void;
}

export const PrefabSelect = (props: PrefabSelectProps) => {
  const [game, setGame] = useState<GameMap>('usa');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PrefabOption[]>([]);

  const filterOptions = createFilterOptions<PrefabOption>({
    stringify: option => option.label.replaceAll('_', ' '),
  });

  const loadOptions = async (map: GameMap) => {
    const [descs, items, nodes] = (await Promise.all([
      fetch(`/${map}-prefabDescriptions.json`).then(res => res.json()),
      fetch(`/${map}-prefabs.json`).then(res => res.json()),
      fetch(`/${map}-nodes.json`).then(res => res.json()),
    ])) as [PrefabDescription[], Prefab[], Node[]];
    return toOptions(descs, items, nodes);
  };

  // 切换游戏时重置选项并重新加载
  const handleGameChange = (newGame: GameMap) => {
    setGame(newGame);
    setOptions([]);
    props.onChange(undefined);
    void loadOptions(newGame).then(groups => {
      setOptions(groups);
      props.onLoad?.(groups);
    });
  };

  const loading = open && options.length === 0;
  useEffect(() => {
    let active = true;
    if (!loading) {
      return undefined;
    }
    void loadOptions(game).then(groups => {
      if (active) {
        setOptions(groups);
        props.onLoad?.(groups);
      }
    });
    return () => {
      active = false;
    };
  }, [loading]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      {/* 游戏切换按钮 */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {(['usa', 'europe'] as GameMap[]).map(g => (
          <button
            key={g}
            onClick={() => handleGameChange(g)}
            style={{
              padding: '4px 10px',
              cursor: 'pointer',
              fontWeight: game === g ? 'bold' : 'normal',
              background: game === g ? '#1976d2' : '#eee',
              color: game === g ? '#fff' : '#333',
              border: '1px solid #ccc',
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            {g === 'usa' ? '🇺🇸 ATS' : '🇪🇺 ETS2'}
          </button>
        ))}
      </div>
      <Autocomplete
        sx={{ flex: 1 }}
        open={open}
        loading={loading}
        endDecorator={
          loading ? (
            <CircularProgress size="sm" sx={{ bgcolor: 'background.surface' }} />
          ) : null
        }
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onChange={(_, v) => props.onChange(v ?? undefined)}
        placeholder={`搜索 ${game === 'usa' ? 'ATS' : 'ETS2'} prefab...`}
        options={options}
        filterOptions={filterOptions}
        blurOnSelect
        autoComplete
        renderGroup={formatGroupLabel}
        groupBy={option => option.group}
      />
    </div>
  );
};

function formatGroupLabel(params: AutocompleteRenderGroupParams) {
  return (
    <div key={params.key}>
      <Typography m={1} level={'body-xs'} textTransform={'uppercase'}>
        {params.group}
      </Typography>
      <List>{params.children}</List>
      <ListDivider />
    </div>
  );
}

function toOptions(
  descs: PrefabDescription[],
  items: Prefab[],
  nodes: Node[],
): PrefabOption[] {
  const itemsMap = new Map<string, Prefab[]>();
  for (const item of items) {
    putIfAbsent(item.token, [], itemsMap).push(item);
  }
  const nodeMap = new Map<bigint, Node>(nodes.map(n => [n.uid, n]));

  return descs
    .filter(desc => {
      if (!itemsMap.has(desc.token)) {
        // prefab description isn't referenced by any prefab items.
        // console.warn('no items for prefab token', desc.token);
        return false;
      }

      // TODO add UI to control filtering
      const roadPoints = desc.mapPoints.filter(
        mp => mp.type === 'road' && mp.lanesRight && mp.lanesLeft,
      );
      const allRoads = desc.mapPoints.every(p => p.type === 'road');
      // const allAuto = desc.mapPoints.every(
      //   p =>
      //     p.type === 'road' &&
      //     p.lanesLeft === 'auto' &&
      //     p.lanesRight === 'auto',
      // );
      // const someAuto = desc.mapPoints.some(
      //   p =>
      //     p.type === 'road' &&
      //     p.lanesLeft === 'auto' &&
      //     p.lanesRight === 'auto',
      // );
      return allRoads && roadPoints.length > 1; //&& desc.nodes.length == 3; // && p.nodes.length !== 2 && p.mapPoints.length !== 2
    })
    .map(desc => {
      let group;
      if (desc.navCurves.length) {
        group = 'Roads';
      } else {
        group = 'Non-roads';
      }

      const locations: PrefabOption['value']['locations'] = assertExists(
        itemsMap.get(desc.token),
      ).map(item => {
        const prefabNodes = item.nodeUids.map(uid =>
          assertExists(nodeMap.get(uid)),
        );
        const prefabCenter = center(getExtent(prefabNodes));
        const [lng, lat] = fromAtsCoordsToWgs84(prefabCenter);
        return { lng, lat, hidden: !!item.hidden };
      });

      return {
        label: desc.path + ' ' + desc.token,
        group,
        value: {
          prefabDesc: desc,
          locations,
        },
      };
    })
    .sort((a, b) => {
      if (a.group === b.group) {
        return a.label.localeCompare(b.label);
      } else if (a.group === 'Roads') {
        return -1;
      }
      return 1;
    });
}
