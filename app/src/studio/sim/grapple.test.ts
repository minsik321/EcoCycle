import { describe, expect, it } from 'vitest';
import { VEHICLE_TIMING_SEC } from '../../../../mock-server/src/fixtures/process';
import { CRANE, GRABS, GRAPPLE_TOTAL_SEC, GRAPPLE_TRUCK, grappleSim, grappleStowed, inboundBody, solveCrane, stepGrapple } from './grapple';

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
  it('하역 단계 전에는 받침다리를 내리지 않는다', () => {
    const g = grappleSim();
    for (let t = 0; t < 5; t += DT) stepGrapple(g, DT, 'identified');
    expect(grappleStowed(g)).toBe(true);
    expect(g.legs).toBe(0);
  });
  it('접은 크레인은 운전석 지붕을 크게 넘지 않는다 (0.3 m 안)', () => {
    const g = grappleSim();
    const knuckle = CRANE.pivotY + Math.sin(g.pose.a1) * CRANE.boom1;
    expect(knuckle).toBeLessThan(GRAPPLE_TRUCK.cabHeight + 0.15);
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
