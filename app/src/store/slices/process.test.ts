import { expect, it } from 'vitest';
import type { Bale } from '@ecocycle/shared';
import reducer, { baleReceived, processSynced } from './process';

// 공정 흐름 목록: 종류별 최근 20건, 단 적치(created) 베일은 진행 중이라 모두 남긴다 (S2q: 3D 마당이 서버 적치 베일 수만큼 채운다)
const bale = (n: number, stage: Bale['stage']): Bale => ({
  id: `BL-${n}`,
  batchId: `batch-${n}`,
  stage,
  vehicleId: stage === 'shipped' ? 'veh-1' : null,
  stageTimes: { created: new Date(Date.UTC(2026, 10, 27, 0, n)).toISOString() },
  updatedAt: new Date(Date.UTC(2026, 10, 27, 0, n)).toISOString(),
});

it('적치 베일 68개와 출하 베일 30개를 받으면 적치는 모두, 출하는 최근 20개만 남긴다', () => {
  const bales = [...Array.from({ length: 30 }, (_, i) => bale(i, 'shipped')), ...Array.from({ length: 68 }, (_, i) => bale(100 + i, 'created'))];
  const state = reducer(undefined, processSynced({ vehicles: [], batches: [], bales, updatedAt: '2026-11-27T01:00:00.000Z' }));
  expect(state.bales.filter((b) => b.stage === 'created')).toHaveLength(68);
  expect(state.bales.filter((b) => b.stage === 'shipped').map((b) => b.id)).toEqual(Array.from({ length: 20 }, (_, i) => `BL-${i + 10}`));
});

it('적치 베일이 출하되면 출하 쪽으로 세어 20건이 넘을 때 오래된 출하 베일부터 뺀다', () => {
  let state = reducer(undefined, processSynced({ vehicles: [], batches: [], bales: Array.from({ length: 20 }, (_, i) => bale(i, 'shipped')), updatedAt: '2026-11-27T01:00:00.000Z' }));
  state = reducer(state, baleReceived(bale(50, 'created')));
  expect(state.bales).toHaveLength(21);
  state = reducer(state, baleReceived({ ...bale(50, 'shipped'), updatedAt: '2026-11-27T02:00:00.000Z' }));
  expect(state.bales).toHaveLength(20);
  expect(state.bales.some((b) => b.id === 'BL-0')).toBe(false);
  expect(state.bales.at(-1)?.id).toBe('BL-50');
});
