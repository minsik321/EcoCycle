import { beforeAll, describe, expect, it, vi } from 'vitest';
import { demoData } from '../demo/demoData';
import { BALE, M } from '../world/layout';
import { YARD_FLOW } from '../../config/yard';
import { Director } from './director';
import { FORK_LIMITS, LIFT_CLEAR, buildRoute, routeTarget } from './forkRoute';
import type { ForkliftSim } from './yard';

// S2s(사용자 요청 2026-11-27): 상차 지게차의 멈칫·빨리감기·딱딱한 꺾임·바닥 내려놓기 높이.
// 시연 원본을 1300초(월드 시계 20Hz) 한 번 돌리며 지게차마다 매 걸음을 잰다.

vi.setConfig({ testTimeout: 120_000 });

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const DT = 0.05;
/** 집기·놓기·클램프처럼 서 있는 것이 뜻 있는 다리 (멈춤으로 세지 않는다) */
const MEANINGFUL = new Set(['fork', 'clamp', 'jaws', 'call', 'wait']);

interface Measure {
  loaded: number;
  stops: number;
  stopSec: number;
  maxStopSec: number;
  maxStep: number;
  /** 2 m/s(1 월드/초)보다 빨리 달리는 동안의 최대 각속도 */
  maxOmegaDriving: number;
  /** 줄 옮기기 한 번에 서서 돈 횟수 */
  pivotsPerTransfer: number;
  /** 포크를 주행 높이로 내린 뒤 놓을 때까지 든 최고 높이 − 놓은 높이 (가장 큰 것) */
  maxOverLift: number;
  /** 바닥(1단)에 놓은 것 중 놓기 전 최고 포크 높이 */
  floorPlaceMaxFork: number;
  floorPlaces: number;
}

function measure(): Measure {
  const d = new Director();
  const m: Measure = { loaded: 0, stops: 0, stopSec: 0, maxStopSec: 0, maxStep: 0, maxOmegaDriving: 0, pivotsPerTransfer: 0, maxOverLift: 0, floorPlaceMaxFork: 0, floorPlaces: 0 };
  const prev = new Map<number, { x: number; z: number; heading: number; carrying: unknown; pivot: boolean }>();
  const still = new Map<number, number>();
  /** 든 동안: 주행 높이로 내려왔나, 그 뒤 최고 높이 */
  const carry = new Map<number, { lowered: boolean; peak: number }>();
  let pivots = 0;
  let transfers = 0;
  const forklifts = d.yard.forklifts as ForkliftSim[];
  for (let i = 0; i * DT < 1300; i += 1) {
    const t = i * DT;
    if (i % 20 === 0) {
      const data = demoData(T0, Math.floor(t));
      d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
    }
    const fork = new Map(forklifts.map((f) => [f.id, f.fork]));
    d.step(DT);
    for (const f of forklifts) {
      const p = prev.get(f.id);
      const step = p ? Math.hypot(f.x - p.x, f.z - p.z) : 0;
      const dh = p ? Math.atan2(Math.sin(f.heading - p.heading), Math.cos(f.heading - p.heading)) : 0;
      const pivot = step < 1e-4 && Math.abs(dh) > 1e-4;
      if (p) {
        m.maxStep = Math.max(m.maxStep, step);
        if (step / DT > 1) m.maxOmegaDriving = Math.max(m.maxOmegaDriving, Math.abs(dh) / DT);
        if (pivot && !p.pivot && f.task?.kind === 'transfer') pivots += 1;
        // 상차 중 멈춤: 움직이지도 돌지도 않고, 뜻 있는 다리(집기·놓기)도 아닌 때
        if (f.task?.kind === 'load' && step < 1e-4 && Math.abs(dh) < 1e-4 && !MEANINGFUL.has(f.legs[0]?.kind ?? '')) still.set(f.id, (still.get(f.id) ?? 0) + DT);
        else if (still.has(f.id)) {
          const s = still.get(f.id)!;
          still.delete(f.id);
          if (s >= 0.2) {
            m.stops += 1;
            m.stopSec += s;
            m.maxStopSec = Math.max(m.maxStopSec, s);
          }
        }
        // 포크 높이: 든 동안 주행 높이(LOW_FORK + 0.1 이하)로 내려온 뒤의 최고 높이, 놓은 순간(든 것이 없어짐)의 높이와 견준다
        if (f.carrying) {
          const c = carry.get(f.id) ?? { lowered: false, peak: 0 };
          if (f.fork <= 0.4 + 1e-6) c.lowered = true;
          if (c.lowered) c.peak = Math.max(c.peak, f.fork);
          carry.set(f.id, c);
        } else if (p.carrying) {
          const c = carry.get(f.id);
          carry.delete(f.id);
          const placed = fork.get(f.id) ?? f.fork;
          if (c?.lowered) {
            // 주행 높이보다 높이 든 만큼만 본다 (주행 높이에서 바닥으로 내려 놓는 것은 들기가 아니다)
            m.maxOverLift = Math.max(m.maxOverLift, c.peak - Math.max(placed, 0.4));
            if (placed < BALE.h / 2) {
              m.floorPlaces += 1;
              m.floorPlaceMaxFork = Math.max(m.floorPlaceMaxFork, c.peak);
            }
          }
        }
      }
      if (p && f.task?.kind === 'transfer' && prev.get(f.id) && (p as { task?: string }).task !== 'transfer') transfers += 1;
      prev.set(f.id, { x: f.x, z: f.z, heading: f.heading, carrying: f.carrying, pivot, ...({ task: f.task?.kind } as object) });
    }
  }
  m.loaded = d.yard.stats.loadedOut;
  m.pivotsPerTransfer = transfers > 0 ? pivots / transfers : 0;
  return m;
}

describe('상차 지게차 움직임 (S2s)', () => {
  let m: Measure;
  beforeAll(() => {
    m = measure();
  });

  it('상차 중 뜻 없는 멈춤(차례 대기·길 끝 정지·제자리 대기)이 적고 짧다', () => {
    expect(m.loaded).toBeGreaterThanOrEqual(15);
    // 전(S2q): 마당 차례 대기만 베일 38개에 76번·248초(최대 20초), 다리 끝마다 한 프레임씩 수백 번 섰다
    expect(m.stops / m.loaded).toBeLessThanOrEqual(1.5);
    expect(m.stopSec / m.loaded).toBeLessThanOrEqual(10);
    expect(m.maxStopSec).toBeLessThan(45);
  });

  it('빨리감기가 없다: 한 걸음 이동이 실제 축척 앞 속도(4.5 m/s) 한계를 넘지 않는다', () => {
    // 전: 상차 끝에 2.2배(한 걸음 0.616 = 24.6 m/s)
    expect(FORK_LIMITS.drive).toBeCloseTo(M(YARD_FLOW.driveMps), 9);
    expect(YARD_FLOW.driveMps).toBeLessThanOrEqual(5);
    expect(m.maxStep).toBeLessThanOrEqual(FORK_LIMITS.drive * DT + 1e-9);
  });

  it('바닥(1단)에 놓을 때는 2단 높이까지 들지 않고, 어디에 놓든 놓을 높이 + 여유보다 높이 들지 않는다', () => {
    expect(m.floorPlaces).toBeGreaterThan(0);
    expect(m.floorPlaceMaxFork).toBeLessThan(BALE.h);
    expect(m.maxOverLift).toBeLessThanOrEqual(LIFT_CLEAR + 1e-6);
  });

  it('달리는 동안 방향이 매끄럽게 바뀐다(각속도 상한), 줄 옮기기에서 서서 도는 일이 적다', () => {
    // 2 m/s 넘게 달릴 때: 꺾이는 점에서 제자리 회전하지 않고 곡선으로 돈다 (전: 꺾이는 점마다 서서 6.2 rad/s로 돌았다)
    // (경로는 꺾은선 점으로 읽어 한 걸음씩 방향이 조금 튀므로 제자리 돌기 빠르기의 1.6배까지)
    expect(m.maxOmegaDriving).toBeLessThanOrEqual(FORK_LIMITS.turn * 1.6);
    // 칸(대기 자리·남동 칸·북서 칸)에 들어가기 전과 빠진 뒤에만 서서 돈다: 셋 × 둘 = 6
    // (전: 그 위에 남동 길 동쪽 끝·가로지르는 길 세 점·북서 길 동쪽 끝마다 서서 돌아 11~12번)
    expect(m.pivotsPerTransfer).toBeLessThanOrEqual(6);
  });

  it('둥근 경로는 모서리 앞에서 미리 줄이고 끝에서 선다', () => {
    const r = buildRoute([0, 0], [[10, 0], [10, 10]]);
    const v0 = routeTarget(r, 0, FORK_LIMITS.drive, FORK_LIMITS.accel);
    expect(v0).toBeCloseTo(FORK_LIMITS.drive, 6);
    const corner = r.marks[1]!;
    expect(routeTarget(r, corner, FORK_LIMITS.drive, FORK_LIMITS.accel)).toBeLessThan(FORK_LIMITS.drive * 0.8);
    expect(routeTarget(r, r.path.total, FORK_LIMITS.drive, FORK_LIMITS.accel)).toBeLessThan(0.06);
  });
});
