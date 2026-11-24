import { describe, expect, it, vi } from 'vitest';
import { demoData } from '../demo/demoData';
import { Director } from './director';

// 부지 전체의 차량 흐름을 오래 돌려 본다: 입고 트럭(서버 단계), 상차 차량("예시"), 지게차가 서로 겹치지 않고,
// 어느 차도 길 위에서 멈춘 채 끝나지 않으며, 계근대·마당 차례가 끝난 차에 남지 않는다. 월드 시계 20Hz.

vi.setConfig({ testTimeout: 60_000 });

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const DT = 0.05;

describe('부지 차량 흐름 (시연 원본으로 20분)', () => {
  it('트럭·상차 차량·지게차가 겹치지 않고, 모든 트럭이 쏟고 다시 재고 나가며, 상차 차량은 베일을 싣고 나간다', () => {
    const d = new Director();
    let t = 0;
    let next = 0;
    const seen = new Set<string>();
    const tipped = new Set<string>();
    const weighedOut = new Set<string>();
    const finished = new Set<string>();
    let maxStill = 0;
    const still = new Map<string, number>();
    while (t < 1200) {
      if (t >= next) {
        const data = demoData(T0, Math.floor(t));
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
        next += 1;
      }
      const before = new Set(d.trucks.filter((x) => x.active).map((x) => x.id));
      d.step(DT);
      t += DT;
      expect(d.truckOverlaps(), `t=${t.toFixed(1)} 트럭끼리 겹침`).toBe(0);
      const a = d.yard.audit(d.trucks);
      expect(a.forkOnTruck + a.forkOnFork + a.forkOnBale + a.baleOnBale, `t=${t.toFixed(1)} 지게차·베일 겹침`).toBe(0);
      for (const truck of d.trucks) {
        if (!truck.active) continue;
        seen.add(truck.id);
        if (truck.pouring) tipped.add(truck.id);
        if (truck.phase === 'atScale2') weighedOut.add(truck.id);
        // 움직여야 할 때(길 위) 오래 서 있지 않는다
        if (truck.path && truck.speed < 0.01) still.set(truck.id, (still.get(truck.id) ?? 0) + DT);
        else still.set(truck.id, 0);
        maxStill = Math.max(maxStill, still.get(truck.id) ?? 0);
      }
      for (const id of before) if (!d.trucks.some((x) => x.active && x.id === id)) finished.add(id);
      // 끝난 차는 차례를 쥐고 있지 않다
      for (const token of [d.scaleToken, d.yardToken]) {
        if (token.holder && !token.holder.startsWith('forklift')) expect(d.trucks.some((x) => x.active && x.id === token.holder)).toBe(true);
      }
    }
    const regular = [...finished].filter((id) => id.startsWith('ex-veh'));
    expect(regular.length).toBeGreaterThanOrEqual(25);
    // 대부분의 트럭이 하역 단계 안에 더미에 닿아 쏟았다. 늦게 닿은 차(지게차·상차 차량이 마당 안쪽 길을 쓰는 동안 기다린 차)는
    // 하역 완료 뒤라 쏟지 않는다: 쏟기는 하역 단계에서만 한다(서버 단계를 앞질러 지어내지 않는다)
    expect(regular.filter((id) => tipped.has(id)).length).toBeGreaterThanOrEqual(Math.floor(regular.length * 0.55));
    // 나간 트럭은 모두 다시 쟀다 (쏟은 트럭은 반드시 계근대를 거쳐 나간다)
    expect(regular.filter((id) => tipped.has(id)).every((id) => weighedOut.has(id))).toBe(true);
    expect(maxStill).toBeLessThan(40);
    // 상차 차량은 여러 번 와서 베일을 싣고 나갔다
    expect(d.yard.stats.loadedOut).toBeGreaterThanOrEqual(8);
    expect(seen.size).toBeGreaterThan(regular.length);
  });

  it.each([2, 3, 4])('서버 값이 월드 시계보다 %s배 빨리 흘러도(느린 화면) 겹치거나 멈춰 버리지 않는다', (speed) => {
    // 소프트웨어 그래픽처럼 그리기가 느리면 월드 시계(걸음 0.1초)가 실제 시각보다 느리게 흐르고 차량·베일이 더 촘촘히 온다
    const d = new Director();
    let real = 0;
    let synced = -1;
    let stuckSince = 0;
    let lastStats = '';
    while (d.t < 700) {
      real += 0.1 * speed;
      if (Math.floor(real) !== synced) {
        synced = Math.floor(real);
        const data = demoData(T0, synced);
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + real * 1000);
      }
      d.step(0.1);
      expect(d.truckOverlaps(), `t=${d.t.toFixed(1)} 트럭끼리 겹침`).toBe(0);
      const a = d.yard.audit(d.trucks);
      expect(a.forkOnTruck + a.forkOnFork + a.forkOnBale + a.baleOnBale, `t=${d.t.toFixed(1)} 지게차·베일 겹침`).toBe(0);
      // 무언가는 계속 움직인다: 베일 적치·출하가 3분 넘게 그대로면 멈춰 버린 것이다
      const stats = JSON.stringify(d.yard.stats);
      if (stats !== lastStats) {
        lastStats = stats;
        stuckSince = d.t;
      }
      expect(d.t - stuckSince, `t=${d.t.toFixed(1)} 적치·출하가 멈춤`).toBeLessThan(180);
    }
    // 트럭이 끊이지 않으면 지게차는 1분 기다린 뒤 다음 차례를 맡아 둔다(yard.ts TOKEN_PATIENCE_SEC): 그보다 조금 더 기다릴 뿐 멈추지 않는다
    expect(d.yard.maxBlockedSec).toBeLessThan(90);
    expect(d.yard.stats.shipped).toBeGreaterThan(8);
  });
});
