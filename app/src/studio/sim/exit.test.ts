import { describe, expect, it, vi } from 'vitest';
import type { Vehicle } from '@ecocycle/shared';
import { demoData } from '../demo/demoData';
import { LAMP_PX, PHOTO, POLE_PX, SITE_ROT_Y, TRUCK, sitePx, worldToPx } from '../world/layout';
import type { P2 } from './paths';
import { Director, PLATE_SHOW_SEC } from './director';
import type { TruckPhase } from './director';
import { VEHICLE_TIMING_SEC } from '../../../../mock-server/src/fixtures/process';

// S2i 차량 동선 회귀 (사용자 수정 #4·#5·#6·#7·#8). 시연 원본과 모의 서버의 단계 시간(fixtures/process VEHICLE_TIMING_SEC) 둘 다로 돌린다.
//  - 출차 계근 → 출차까지 한 걸음(0.05초) 사이에 자리(0.5m)·방향(0.25rad)이 튀지 않는다 (#6)
//  - 출차한 차는 입구 경사로를 내려가 도로를 따라 사진 남서쪽 밖 도로 끝까지 간 뒤 빠진다 (#7)
//  - 어느 동선(입고·하역·대기·계근·상차·출차)에서도 트럭 외곽선이 전봇대·가로등(기둥과 팔 끝)에서 0.5m 넘게 떨어져 있다 (#5·#8)
//  - 계근대에 선 차마다(입차·출차) 번호판 인식 장면이 보일 만큼(PLATE_SHOW_SEC 넘게) 켜진다 (#4)

vi.setConfig({ testTimeout: 120_000 });

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const DT = 0.05;
const iso = (ms: number) => new Date(ms).toISOString();
type Feed = (tSec: number) => ReturnType<typeof demoData>;

/** 모의 서버의 입고 차량 단계 시간(fixtures/process VEHICLE_TIMING_SEC): 인식 18초, 섹터 앞 16초, 하역 9초, 출차 계근 시작 4초, 출차 계근 24초 */
const S = VEHICLE_TIMING_SEC;
const MOCK_STEPS: Array<[Vehicle['stage'], number]> = [
  ['arrived', 0],
  ['identified', S.identify],
  ['unloading', S.identify + S.toSector],
  ['unloaded', S.identify + S.toSector + S.unload],
  ['weighing_out', S.identify + S.toSector + S.unload + S.afterWork],
  ['departed', S.identify + S.toSector + S.unload + S.afterWork + S.weighOut],
];
/** 모의 서버처럼 앞 차가 계근대를 비운 뒤(spawnGap 넘게) 다음 차가 온다 */
const MOCK_EVERY = Math.max(60, S.spawnGap, S.identify + S.toSector + 10);
const DEPARTED_AT = MOCK_STEPS[MOCK_STEPS.length - 1]![1];
const mockFeed: Feed = (tSec) => {
  const data = demoData(T0, Math.floor(tSec));
  const vehicles: Vehicle[] = [];
  for (let n = 0; n * MOCK_EVERY <= tSec; n += 1) {
    const age = tSec - n * MOCK_EVERY;
    let stage: Vehicle['stage'] = 'arrived';
    const stageTimes: Vehicle['stageTimes'] = {};
    for (const [s, at] of MOCK_STEPS) {
      if (age < at) continue;
      stage = s;
      stageTimes[s] = iso(T0 + (n * MOCK_EVERY + at) * 1000);
    }
    if (stage === 'departed' && age > DEPARTED_AT + 11) continue;
    const known = stage !== 'arrived';
    vehicles.push({ id: `m-${n}`, kind: 'inbound', baleIds: [], stage, plate: known ? `1${n % 10}가 3456` : null, companyName: known ? '예시' : null, sectorId: known ? (n % 2 ? 'sector-a' : 'sector-c') : null, stageTimes, updatedAt: iso(T0) });
  }
  return { ...data, vehicles };
};
const demoFeed: Feed = (tSec) => demoData(T0, Math.floor(tSec));

/** 전봇대·가로등 기둥과 가로등 팔 끝 (월드) */
const POSTS: Array<[string, P2]> = [
  ...POLE_PX.map((p, i): [string, P2] => [`전봇대 ${i + 1}`, sitePx(p[0], p[1])]),
  ...LAMP_PX.flatMap(([x, y, rot], i): Array<[string, P2]> => {
    const [wx, wz] = sitePx(x, y);
    const a = rot + SITE_ROT_Y;
    return [
      [`가로등 ${i + 1}`, [wx, wz]],
      [`가로등 ${i + 1} 팔`, [wx + Math.sin(a) * 0.9, wz + Math.cos(a) * 0.9]],
    ];
  }),
];
/** 점 q가 트럭 외곽선에서 떨어진 거리(안이면 0 이하) */
function gap(q: P2, x: number, z: number, heading: number): number {
  const fx = Math.cos(heading);
  const fz = -Math.sin(heading);
  const dx = q[0] - x;
  const dz = q[1] - z;
  const a = Math.abs(dx * fx + dz * fz) - TRUCK.length / 2;
  const b = Math.abs(-dx * fz + dz * fx) - TRUCK.width / 2;
  return a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b);
}

const EXIT_CHAIN: ReadonlySet<TruckPhase> = new Set<TruckPhase>(['atScale2', 'reverseOut', 'toExit', 'exitHold', 'leave']);

describe.each([
  ['시연 원본', demoFeed],
  ['모의 서버 단계 시간', mockFeed],
] as const)('차량 동선 (%s, 15분)', (_name, feed) => {
  it('출차 계근 뒤 튀지 않고 도로 끝까지 나가 빠지며, 전봇대·가로등을 지나지 않고, 계근마다 번호판 인식 장면이 켜진다', () => {
    const d = new Director();
    let t = 0;
    let next = 0;
    const last = new Map<string, { x: number; z: number; heading: number; phase: TruckPhase; py: number; px: number }>();
    const scaleVisits = new Map<string, number>();
    const scanTime = new Map<string, number>();
    let gone = 0;
    let goneAtRoadEnd = 0;
    let weighed = 0;
    while (t < 900) {
      if (t >= next) {
        const data = feed(t);
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
        next += 1;
      }
      d.step(DT);
      t += DT;
      for (const [id, b] of last) {
        if (d.trucks.some((x) => x.active && x.id === id)) continue;
        // 빠진 차: 출차해 나가던 차는 사진 남서쪽 밖 도로 끝에서 빠졌어야 한다
        last.delete(id);
        if (b.phase !== 'leave' && b.phase !== 'exitHold' && !EXIT_CHAIN.has(b.phase)) continue;
        gone += 1;
        if (b.py > PHOTO.height + 150 && b.px < 150) goneAtRoadEnd += 1;
      }
      for (const tr of d.trucks) {
        if (!tr.active) continue;
        const prev = last.get(tr.id);
        if (prev && EXIT_CHAIN.has(prev.phase)) {
          const at = `t=${t.toFixed(2)} ${tr.id} ${prev.phase}→${tr.phase}`;
          expect(Math.hypot(tr.x - prev.x, tr.z - prev.z), `${at} 자리 튐`).toBeLessThan(0.5);
          expect(Math.abs(Math.atan2(Math.sin(tr.heading - prev.heading), Math.cos(tr.heading - prev.heading))), `${at} 방향 튐`).toBeLessThan(0.25);
        }
        for (const [name, q] of POSTS) expect(gap(q, tr.x, tr.z, tr.heading), `t=${t.toFixed(1)} ${tr.id} ${tr.phase} × ${name}`).toBeGreaterThan(0.5);
        const [px, py] = worldToPx(tr.x, tr.z);
        if ((tr.phase === 'atScale' || tr.phase === 'atScale2') && prev?.phase !== tr.phase) {
          const key = `${tr.id}:${tr.phase}`;
          scaleVisits.set(key, 0);
          weighed += 1;
        }
        last.set(tr.id, { x: tr.x, z: tr.z, heading: tr.heading, phase: tr.phase, px, py });
      }
      const s = d.plateScan;
      if (s.active) {
        const tr = d.trucks.find((x) => x.active && x.id === s.truckId);
        if (tr) {
          const key = `${tr.id}:${tr.phase}`;
          scanTime.set(key, (scanTime.get(key) ?? 0) + DT);
          // 출차 계근(동쪽을 봄)과 입차 계근을 구분해 적는다
          expect(s.out).toBe(tr.phase === 'atScale2');
        }
      }
    }
    expect(weighed).toBeGreaterThanOrEqual(15);
    for (const key of scaleVisits.keys()) {
      // 시험이 끝날 때 계근대에 막 선 차는 빼고 본다
      if (last.get(key.split(':')[0]!)?.phase === key.split(':')[1]) continue;
      expect(scanTime.get(key) ?? 0, `${key} 번호판 인식 장면`).toBeGreaterThanOrEqual(PLATE_SHOW_SEC);
    }
    expect(gone).toBeGreaterThanOrEqual(8);
    // 출차한 차는 모두 도로 끝까지 달려 나간 뒤 빠졌다 (길에서 서로 막혀 빼는 안전판은 쓰이지 않았다)
    expect(goneAtRoadEnd).toBe(gone);
  });
});
