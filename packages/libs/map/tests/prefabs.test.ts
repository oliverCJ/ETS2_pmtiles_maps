import {
  calculateNodeConnections,
  toNavCurveRoadStrings,
  toNavLanes,
} from '../prefabs';
import {
  prefab_2k031,
  prefab_2o09g,
  prefab_2o0ds,
  prefab_mt_2o004,
} from './fixtures';

describe('calculateNodeConnections', () => {
  it('handles roundabouts', () => {
    expect(calculateNodeConnections(prefab_2k031)).toEqual(
      new Map([
        [0, [2, 0, 1]],
        [1, [0, 1, 2]],
        [2, [2, 0, 1]],
      ]),
    );

    expect(calculateNodeConnections(prefab_mt_2o004)).toEqual(
      new Map([
        [0, [0, 1, 2, 3, 4]],
        [2, [1, 2, 3, 4, 0]],
        [3, [2, 3, 4, 0, 1]],
        [4, [3, 4, 0, 1, 2]],
        [5, [4, 0, 1, 2, 3]],
      ]),
    );
  });

  it('handles non-roundabouts', () => {
    expect(calculateNodeConnections(prefab_2o0ds)).toEqual(
      new Map([
        [0, [2, 1]],
        [1, [2]],
        [2, [1, 0]],
      ]),
    );

    expect(calculateNodeConnections(prefab_2o09g)).toEqual(
      new Map([
        [0, [2]],
        [1, [2]],
      ]),
    );
  });
});

describe('toNavLanes', () => {
  it('returns one entry per lane per direction', () => {
    const lanes = toNavLanes(prefab_2o0ds);
    expect(lanes.length).toBeGreaterThan(0);
    for (const lane of lanes) {
      expect(lane.curvePoints.length).toBeGreaterThan(1);
      expect(lane.sourceNodeIndex).toBeGreaterThanOrEqual(0);
      expect(lane.targetNodeIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not throw on roundabout prefab', () => {
    expect(() => toNavLanes(prefab_2k031)).not.toThrow();
  });
});

describe('toNavCurveRoadStrings', () => {
  it('returns at least one road string for a T-junction', () => {
    const result = toNavCurveRoadStrings(prefab_2o0ds);
    expect(result.length).toBeGreaterThan(0);
  });

  it('every road string has valid node indices', () => {
    const result = toNavCurveRoadStrings(prefab_2o0ds);
    const nodeCount = prefab_2o0ds.nodes.length;
    for (const rs of result) {
      expect(rs.sourceNodeIndex).toBeGreaterThanOrEqual(0);
      expect(rs.sourceNodeIndex).toBeLessThan(nodeCount);
      expect(rs.targetNodeIndex).toBeGreaterThanOrEqual(0);
      expect(rs.targetNodeIndex).toBeLessThan(nodeCount);
      expect(rs.points.length).toBeGreaterThan(1);
    }
  });

  it('every road string has non-negative lane counts', () => {
    const result = toNavCurveRoadStrings(prefab_2o0ds);
    for (const rs of result) {
      expect(rs.leftLaneCount).toBeGreaterThanOrEqual(0);
      expect(rs.rightLaneCount).toBeGreaterThanOrEqual(0);
      expect(rs.leftLaneCount + rs.rightLaneCount).toBeGreaterThan(0);
    }
  });

  it('prefab_2o09g one-way connections produce leftLaneCount=0 entries', () => {
    const result = toNavCurveRoadStrings(prefab_2o09g);
    expect(result.length).toBeGreaterThan(0);
    const oneWay = result.filter(rs => rs.leftLaneCount === 0);
    expect(oneWay.length).toBeGreaterThan(0);
  });

  it('does not throw on roundabout prefab', () => {
    expect(() => toNavCurveRoadStrings(prefab_2k031)).not.toThrow();
    const result = toNavCurveRoadStrings(prefab_2k031);
    expect(result.length).toBeGreaterThan(0);
  });

  it('snapshot: T-junction road strings are stable', () => {
    const result = toNavCurveRoadStrings(prefab_2o0ds);
    const structural = result.map(rs => ({
      sourceNodeIndex: rs.sourceNodeIndex,
      targetNodeIndex: rs.targetNodeIndex,
      leftLaneCount: rs.leftLaneCount,
      rightLaneCount: rs.rightLaneCount,
      pointCount: rs.points.length,
    }));
    expect(structural).toMatchSnapshot();
  });
});
