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
// S2p 출차 문 앞 멈칫 회귀: 출차 계근을 마친 차는 계근대에서 후진으로 내려온 뒤(기어를 바꾸는 한 번만 선다) 출입문을 지나
//  도로 끝까지 한 번에 나간다. 앞으로 출발해 속도가 붙은 뒤로는 빠질 때까지 속도가 서는 쪽(EXIT_MIN_SPEED 아래)으로
//  떨어지지 않고, 출입문 앞 출차 대기 자리(exitHold)에 서지 않는다. 두 차가 연달아 나갈 때도 같다

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

/** 앞으로 출발해 이만큼 붙은 뒤로 이 아래로 떨어지면 멈칫으로 본다 (차 속도 4.6의 절반쯤) */
const EXIT_MIN_SPEED = 2.0;

/** 나가는 차(toExit → leave)의 속도를 걸음마다 본다: 출발해 붙은 속도가 멈칫(EXIT_MIN_SPEED 아래)하거나 exitHold에 서면 적는다 */
class ExitWatch {
  private readonly run = new Map<string, { up: boolean; samples: number }>();
  readonly hitches: string[] = [];
  /** 도로 끝까지 속도를 본 차 */
  readonly smooth = new Set<string>();
  see(d: Director, t: number): void {
    const live = new Set<string>();
    for (const tr of d.trucks) {
      if (!tr.active) continue;
      live.add(tr.id);
      if (tr.phase !== 'toExit' && tr.phase !== 'exitHold' && tr.phase !== 'leave') continue;
      const r = this.run.get(tr.id) ?? { up: false, samples: 0 };
      this.run.set(tr.id, r);
      r.samples += 1;
      if (tr.phase === 'exitHold') this.hitches.push(`t=${t.toFixed(2)} ${tr.id} 출차 대기 자리에 섬`);
      if (tr.speed >= EXIT_MIN_SPEED) r.up = true;
      else if (r.up) this.hitches.push(`t=${t.toFixed(2)} ${tr.id} ${tr.phase} s=${tr.s.toFixed(2)} 속도 ${tr.speed.toFixed(2)}로 떨어짐`);
    }
    for (const [id, r] of this.run) {
      if (live.has(id)) continue;
      if (r.up) this.smooth.add(id);
      this.run.delete(id);
    }
  }
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
    const watch = new ExitWatch();
    while (t < 900) {
      if (t >= next) {
        const data = feed(t);
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
        next += 1;
      }
      d.step(DT);
      t += DT;
      watch.see(d, t);
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
    expect(gone).toBeGreaterThanOrEqual(5); // S2t 두 개 운반 뒤 원래 기준으로 (8)
    // 출차한 차는 모두 도로 끝까지 달려 나간 뒤 빠졌다 (길에서 서로 막혀 빼는 안전판은 쓰이지 않았다)
    expect(goneAtRoadEnd).toBe(gone);
    // S2p: 출입문 앞에서 멈칫하지 않는다
    expect(watch.hitches).toEqual([]);
    expect(watch.smooth.size).toBe(gone);
  });
});

describe('출차 문 앞 멈칫 (S2p, 두 차가 연달아 나감)', () => {
  it.each([
    ['출차가 계근 중에 옴', S.weighOut],
    ['출차가 계근보다 늦게 옴', S.weighOut + 15],
    ['출차가 계근대에 오르기 전에 옴', 2],
  ])('%s: 두 차 모두 계근대에서 도로 끝까지 서지 않고 나간다', (_name, weighOut) => {
    // 두 입고 차가 섹터 둘에 하역하고 거의 함께 출차 계근을 한다 (둘째는 첫째가 계근대를 비우기를 기다렸다가 이어서 나간다)
    const steps = (offset: number): Array<[Vehicle['stage'], number]> => {
      const work = S.identify + S.toSector + S.unload + S.afterWork;
      return [
        ['arrived', offset],
        ['identified', offset + S.identify],
        ['unloading', offset + S.identify + S.toSector],
        ['unloaded', offset + S.identify + S.toSector + S.unload],
        ['weighing_out', offset + work],
        ['departed', offset + work + weighOut],
      ];
    };
    const plan = [
      { id: 'p-0', sector: 'sector-a' as const, steps: steps(0) },
      { id: 'p-1', sector: 'sector-c' as const, steps: steps(S.spawnGap) },
    ];
    const feed: Feed = (tSec) => {
      const data = demoData(T0, Math.floor(tSec));
      const vehicles: Vehicle[] = [];
      for (const p of plan) {
        if (tSec < p.steps[0]![1]) continue;
        let stage: Vehicle['stage'] = 'arrived';
        const stageTimes: Vehicle['stageTimes'] = {};
        for (const [st, at] of p.steps) {
          if (tSec < at) continue;
          stage = st;
          stageTimes[st] = iso(T0 + at * 1000);
        }
        if (stage === 'departed' && tSec > p.steps[5]![1] + 11) continue;
        const known = stage !== 'arrived';
        vehicles.push({ id: p.id, kind: 'inbound', baleIds: [], stage, plate: known ? '12가 3456' : null, companyName: known ? '예시' : null, sectorId: known ? p.sector : null, stageTimes, updatedAt: iso(T0) });
      }
      return { ...data, vehicles: [...data.vehicles.filter((v) => v.kind !== 'inbound'), ...vehicles] };
    };
    const d = new Director();
    const watch = new ExitWatch();
    let t = 0;
    let next = 0;
    while (t < 420 && watch.smooth.size < 2) {
      if (t >= next) {
        const data = feed(t);
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
        next += 1;
      }
      d.step(DT);
      t += DT;
      watch.see(d, t);
    }
    expect(watch.hitches).toEqual([]);
    expect([...watch.smooth].filter((id) => id.startsWith('p-')).sort()).toEqual(['p-0', 'p-1']);
  });
});
