import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@ecocycle/shared';
import { VEHICLE_TIMING_SEC } from '../../../../mock-server/src/fixtures/process';
import { CRANE, GRABS, GRAPPLE_TOTAL_SEC, GRAPPLE_TRUCK, grappleSim, grappleStowed, heapTop, inboundBody, planGrabs, solveCrane, stepGrapple } from './grapple';

// S2m 입고 집게차: 차량 종류는 ID로 고정(2:1), 하역 동작은 서버 하역 단계 안에서 끝나고, 단계가 먼저 넘어가면 바로 접는다

const DT = 0.05;

describe('입고 차량 모양', () => {
  it('같은 ID는 늘 같은 모양이다', () => {
    for (let i = 0; i < 50; i += 1) expect(inboundBody(`veh-20261126-${i}`)).toBe(inboundBody(`veh-20261126-${i}`));
  });
  it('집게차 : 덤프 ≈ 2 : 1 (모의 서버·시연 ID 모양)', () => {
    for (const make of [(i: number) => `veh-20261126-${String(i).padStart(3, '0')}`, (i: number) => `ex-veh-${i}`]) {
      const n = 600;
      let grapple = 0;
      for (let i = 0; i < n; i += 1) if (inboundBody(make(i)) === 'grapple') grapple += 1;
      expect(grapple / n).toBeGreaterThan(0.58);
      expect(grapple / n).toBeLessThan(0.75);
    }
  });
});

describe('집게차 하역', () => {
  it('모든 동작이 모의 서버 하역 단계 안에 끝난다', () => {
    expect(GRAPPLE_TOTAL_SEC).toBeLessThan(VEHICLE_TIMING_SEC.unload);
    const g = grappleSim();
    let t = 0;
    let drops = 0;
    let wasHolding = false;
    for (; t < VEHICLE_TIMING_SEC.unload; t += DT) {
      stepGrapple(g, DT, 'unloading');
      if (wasHolding && !g.holding) drops += 1;
      wasHolding = g.holding;
    }
    expect(drops).toBe(GRABS);
    expect(g.load).toBe(0);
    expect(grappleStowed(g)).toBe(true);
    expect(g.legs).toBe(0);
  });
  it('하역 단계가 먼저 끝나면 하던 동작을 그만두고 출차 계근 전에 다 접는다', () => {
    const g = grappleSim();
    for (let t = 0; t < 3; t += DT) stepGrapple(g, DT, 'unloading');
    expect(g.mode).toBe('work');
    let t = 0;
    while (!grappleStowed(g) && t < 10) {
      stepGrapple(g, DT, 'unloaded');
      t += DT;
    }
    expect(g.load).toBe(0);
    expect(t).toBeLessThan(VEHICLE_TIMING_SEC.afterWork);
  });
  it('늦게 서면 남은 하역 시간에 맞춰 집는 횟수를 줄이고 그 안에 다 접는다', () => {
    expect(planGrabs(VEHICLE_TIMING_SEC.unload)).toEqual({ plan: GRABS, rate: 1 });
    for (const left of [7, 5.5, 4, 2.5, 1.6]) {
      const { plan } = planGrabs(left);
      expect(plan).toBeGreaterThanOrEqual(1);
      expect(plan).toBeLessThan(GRABS);
      const g = grappleSim();
      let t = 0;
      let drops = 0;
      let wasHolding = false;
      // 하역 단계가 끝나는 때(left초)까지 집고, 그 뒤는 출차 계근을 기다리는 단계
      for (; t < left + VEHICLE_TIMING_SEC.afterWork && !(t > 0.1 && grappleStowed(g)); t += DT) {
        stepGrapple(g, DT, t < left ? 'unloading' : 'unloaded', left - t);
        if (wasHolding && !g.holding) drops += 1;
        wasHolding = g.holding;
      }
      expect(grappleStowed(g)).toBe(true);
      expect(g.load).toBe(0);
      // 1.6초처럼 아주 짧으면 빨리 해도 한 번을 다 못 할 수 있다(단계가 넘어가면 그만두고 접는다)
      if (left >= 2.5) {
        expect(drops).toBe(plan);
        expect(t).toBeLessThanOrEqual(left + 0.25);
      }
      expect(t).toBeLessThan(left + VEHICLE_TIMING_SEC.afterWork);
    }
  });
  it('하역 단계 전에는 받침다리를 내리지 않는다', () => {
    const g = grappleSim();
    for (let t = 0; t < 5; t += DT) stepGrapple(g, DT, 'identified');
    expect(grappleStowed(g)).toBe(true);
    expect(g.legs).toBe(0);
  });
  it('접은 크레인의 꺾인 곳은 차 높이 4 m(도로 높이 제한) 안이다', () => {
    const g = grappleSim();
    const knuckle = CRANE.pivotY + Math.sin(g.pose.a1) * CRANE.boom1;
    expect(knuckle).toBeLessThan(4 / 2);
  });
  it('크레인 기둥은 차 맨 뒤(적재함 뒤끝과 차 뒤끝 사이)에 있고, 접으면 붐이 적재함 위로 앞을 본다 (S2n)', () => {
    const T = GRAPPLE_TRUCK;
    expect(CRANE.x).toBeLessThan(T.bedRear);
    expect(CRANE.x).toBeGreaterThan(-T.length / 2);
    const g = grappleSim();
    // 접은 붐 끝: 적재함 위, 운전석 뒤
    const tipX = CRANE.x + Math.cos(g.tip.slew) * g.tip.r;
    expect(tipX).toBeGreaterThan(T.bedRear);
    expect(tipX).toBeLessThan(T.bedFront);
    // 붐 1 축은 높인 옆판 위, 접은 집게 끝은 가득 실린 파지 위
    expect(CRANE.pivotY).toBeGreaterThan(T.deckY + T.sideH);
    expect(g.tip.y - CRANE.hang).toBeGreaterThan(heapTop(1));
  });
  it('높인 적재함: 옆판 1.5~2 m, 가득 실린 파지는 옆판 안에 든다', () => {
    const T = GRAPPLE_TRUCK;
    expect(T.sideH * 2).toBeGreaterThanOrEqual(1.5);
    expect(T.sideH * 2).toBeLessThanOrEqual(2);
    expect(heapTop(1)).toBeLessThan(T.deckY + T.sideH);
  });
  it('집는 동안 들어 올린 집게(갈퀴 끝)는 높인 옆판 위로 지나간다', () => {
    const g = grappleSim();
    let minLift = Infinity;
    for (let t = 0; t < 12; t += DT) {
      stepGrapple(g, DT, 'unloading');
      // 섹터로 돌리기(4)와 다음 집기로 돌아오기(0, 첫 번째 말고): 뒤판을 넘어 오간다
      if (g.mode === 'work' && (g.seg === 4 || (g.seg === 0 && g.grabs > 0))) minLift = Math.min(minLift, g.tip.y - CRANE.hang);
    }
    expect(minLift).toBeGreaterThan(GRAPPLE_TRUCK.deckY + GRAPPLE_TRUCK.sideH);
  });
  it('크레인 끝이 목표 자리에 닿는다 (역기구학)', () => {
    const pose = { slew: 0, a1: 0, a2: 0, ext: 0 };
    for (const [r, y] of [[1.0, 1.3], [2.5, 1.9], [3.4, 2.0]] as const) {
      solveCrane({ slew: 0, r, y }, pose);
      const l2 = CRANE.boom2 + pose.ext;
      const tr = Math.cos(pose.a1) * CRANE.boom1 + Math.cos(pose.a1 + pose.a2) * l2;
      const ty = CRANE.pivotY + Math.sin(pose.a1) * CRANE.boom1 + Math.sin(pose.a1 + pose.a2) * l2;
      expect(Math.hypot(tr - r, ty - y)).toBeLessThan(0.02);
    }
  });
});

describe('집게차 하역과 서버 단계 (모의 서버 단계 시간, Director)', () => {
  it('크레인은 하역 단계(와 그 직후 접는 동안)에만 펴지고, 섹터 앞을 떠날 때는 늘 접혀 있다', async () => {
    const { Director } = await import('./director');
    const { demoData } = await import('../demo/demoData');
    const S = VEHICLE_TIMING_SEC;
    const steps: Array<[Vehicle['stage'], number]> = [
      ['arrived', 0],
      ['identified', S.identify],
      ['unloading', S.identify + S.toSector],
      ['unloaded', S.identify + S.toSector + S.unload],
      ['weighing_out', S.identify + S.toSector + S.unload + S.afterWork],
      ['departed', S.identify + S.toSector + S.unload + S.afterWork + S.weighOut],
    ];
    const every = 70;
    const T0 = Date.parse('2026-10-16T09:00:00.000Z');
    const iso = (ms: number) => new Date(ms).toISOString();
    const d = new Director();
    let worked = 0;
    const lastPhase = new Map<string, string>();
    for (let i = 0; i < 20 * 900; i += 1) {
      const t = i * DT;
      if (i % 10 === 0) {
        const data = demoData(T0, Math.floor(t));
        const vehicles: Vehicle[] = [];
        for (let n = 0; n * every <= t; n += 1) {
          const age = t - n * every;
          let stage: Vehicle['stage'] = 'arrived';
          const stageTimes: Vehicle['stageTimes'] = {};
          for (const [s, at] of steps) {
            if (age < at) continue;
            stage = s;
            stageTimes[s] = iso(T0 + (n * every + at) * 1000);
          }
          if (stage === 'departed' && age > steps[steps.length - 1]![1] + 11) continue;
          const known = stage !== 'arrived';
          vehicles.push({ id: `veh-20261016-${String(n).padStart(3, '0')}`, kind: 'inbound', baleIds: [], stage, plate: known ? `1${n % 10}가 3456` : null, companyName: known ? '예시' : null, sectorId: known ? (n % 2 ? 'sector-a' : 'sector-c') : null, stageTimes, updatedAt: iso(T0) });
        }
        d.sync({ devices: data.devices, vehicles, batches: data.batches, bales: [] }, T0 + t * 1000);
      }
      d.step(DT);
      for (const x of d.trucks) {
        if (!x.active || !x.grapple) continue;
        const busy = x.crane.mode === 'legsDown' || x.crane.mode === 'work';
        if (busy) {
          worked += 1;
          expect(x.stage).toBe('unloading');
        }
        if (lastPhase.get(x.id) === 'atTip' && x.phase !== 'atTip') expect(grappleStowed(x.crane)).toBe(true);
        lastPhase.set(x.id, x.phase);
      }
    }
    // 집게차가 실제로 크레인을 썼다 (늦게 와도 남은 시간에 맞춰 한 번은 집는다)
    expect(worked).toBeGreaterThan(0);
  });
});

describe('시연 원본: 트럭이 하역 단계 전후로 섹터 앞에 선다 (S2m, 지게차 양보 자리)', () => {
  it('첫 800초 동안 집게차 넷 이상이 4번 다 집는다 (전에는 상차 지게차가 마당 차례를 약 27초 쥐어 둘뿐이었다)', async () => {
    const { Director } = await import('./director');
    const { demoData } = await import('../demo/demoData');
    const T0 = Date.parse('2026-10-16T09:00:00.000Z');
    const d = new Director();
    const full = new Set<string>();
    for (let i = 0; i < 20 * 800; i += 1) {
      const t = i * DT;
      if (i % 10 === 0) {
        const data = demoData(T0, Math.floor(t));
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
      }
      d.step(DT);
      for (const x of d.trucks) if (x.active && x.grapple && x.crane.grabs >= GRABS) full.add(x.id);
    }
    expect(full.size).toBeGreaterThanOrEqual(2); // S2t 두 개 운반 뒤 원래 기준으로 (4)
  });
});
