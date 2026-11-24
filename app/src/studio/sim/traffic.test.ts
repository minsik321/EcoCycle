import { describe, expect, it, vi } from 'vitest';
import { onSiteVehicles } from '../../config/processDisplay';
import { demoData } from '../demo/demoData';
import { PLATEAU_PX, RAMP_PX, SCALE, inside, sitePx, worldToPx } from '../world/layout';
import { Director } from './director';

// 부지 전체의 차량 흐름을 오래 돌려 본다 (시연 원본: 입고 차량과 상차 차량 모두 서버 값 모양). 월드 시계 20Hz.
//  - 트럭·지게차·베일이 겹치지 않는다 (트럭은 1.4배 외곽선)
//  - 장면의 회사 안 트럭 대수 = 서버의 출차 아닌 차량 수(표의 "차량 N")
//  - 차는 입구 경사로로만 드나들고, 계근대 동쪽 끝(옹벽)을 넘지 않는다
//  - 입차 계근은 후진으로 올라 앞으로 내려가고, 출차 계근은 앞으로 올라 후진으로 내려온다. 계근 때마다 번호판 인식 장면(서버 번호판만)

vi.setConfig({ testTimeout: 120_000 });

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const DT = 0.05;
const RAMP = RAMP_PX.map(([x, y]) => sitePx(x, y));
const SCALE_BOX = (() => {
  const c = Math.cos(SCALE.heading);
  const s = -Math.sin(SCALE.heading);
  const hl = SCALE.length / 2 + 0.3;
  const hw = SCALE.width / 2 + 0.6;
  return [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ].map(([a, b]) => [SCALE.center[0] + c * a! - s * b!, SCALE.center[1] + s * a! + c * b!] as const);
})();

describe('부지 차량 흐름 (시연 원본으로 30분)', () => {
  it('겹치지 않고, 트럭 대수가 서버의 회사 안 차량 수와 같고, 경사로로만 드나들며, 계근대는 마당 쪽에서만 오르내린다', () => {
    const d = new Director();
    let t = 0;
    let next = 0;
    let vehicles = demoData(T0, 0).vehicles;
    const phases = new Map<string, string[]>();
    const tipped = new Set<string>();
    const finished = new Set<string>();
    const outbound = new Set<string>();
    const last = new Map<string, [number, number]>();
    let countMismatch = 0;
    let maxStill = 0;
    const still = new Map<string, number>();
    while (t < 1800) {
      if (t >= next) {
        const data = demoData(T0, Math.floor(t));
        vehicles = data.vehicles;
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
        next += 1;
        // 5초마다 표의 "차량 N"(회사 안 차량)과 장면 트럭 대수를 견준다 (yardSoak도 같은 점검을 한다)
        if (next % 5 === 0 && onSiteVehicles(vehicles).length !== d.truckCount()) countMismatch += 1;
      }
      const before = new Set(d.trucks.filter((x) => x.active).map((x) => x.id));
      d.step(DT);
      t += DT;
      expect(d.truckOverlaps(), `t=${t.toFixed(1)} 트럭끼리 겹침`).toBe(0);
      const a = d.yard.audit(d.trucks);
      expect(a.forkOnTruck + a.forkOnFork + a.forkOnBale + a.baleOnBale, `t=${t.toFixed(1)} 지게차·베일 겹침`).toBe(0);
      for (const truck of d.trucks) {
        if (!truck.active) continue;
        const list = phases.get(truck.id) ?? [];
        if (list[list.length - 1] !== truck.phase) list.push(truck.phase);
        phases.set(truck.id, list);
        if (truck.pouring) tipped.add(truck.id);
        if (truck.outbound) outbound.add(truck.id);
        const p: [number, number] = [truck.x, truck.z];
        const prev = last.get(truck.id);
        // 마당 판(높은 곳)과 그 밖(도로)을 넘나드는 곳은 경사로뿐이다
        if (prev && inside(worldToPx(...prev), PLATEAU_PX) !== inside(worldToPx(...p), PLATEAU_PX)) {
          expect(inside(prev, RAMP) || inside(p, RAMP), `t=${t.toFixed(1)} ${truck.id} 경사로 밖으로 드나듦`).toBe(true);
        }
        last.set(truck.id, p);
        // 계근대 위에 있을 때 차체가 동쪽 끝(옹벽) 너머로 나가지 않는다
        if (inside(p, SCALE_BOX as unknown as Array<[number, number]>)) {
          const front: [number, number] = [truck.x + Math.cos(truck.heading) * 2.03, truck.z - Math.sin(truck.heading) * 2.03];
          const back: [number, number] = [truck.x - Math.cos(truck.heading) * 2.03, truck.z + Math.sin(truck.heading) * 2.03];
          expect(Math.max(worldToPx(...front)[0], worldToPx(...back)[0])).toBeLessThan(496);
        }
        if (truck.path && truck.speed < 0.01) still.set(truck.id, (still.get(truck.id) ?? 0) + DT);
        else still.set(truck.id, 0);
        maxStill = Math.max(maxStill, still.get(truck.id) ?? 0);
      }
      // 번호판 인식 장면은 서버 번호판만 적는다
      if (d.plateScan.active) {
        const v = vehicles.find((x) => x.id === d.plateScan.truckId);
        expect(d.plateScan.plate).toBe(v?.plate ?? null);
      }
      for (const id of before) if (!d.trucks.some((x) => x.active && x.id === id)) finished.add(id);
      for (const token of [d.scaleToken, d.yardToken]) {
        if (token.holder && !token.holder.startsWith('forklift')) expect(d.trucks.some((x) => x.active && x.id === token.holder)).toBe(true);
      }
    }
    expect(countMismatch).toBe(0);
    const done = [...finished].filter((id) => phases.get(id)?.includes('atScale'));
    const inbound = done.filter((id) => !outbound.has(id));
    const out = done.filter((id) => outbound.has(id));
    expect(inbound.length).toBeGreaterThanOrEqual(15);
    expect(out.length).toBeGreaterThanOrEqual(3);
    // 계근 동선: 입차는 후진으로 올라 계근(atScale), 출차는 앞으로 올라 계근(atScale2) 뒤 후진으로 내려온다
    for (const id of done) {
      const list = phases.get(id)!;
      expect(list.indexOf('reverseIn'), `${id} ${list.join('>')}`).toBe(list.indexOf('atScale') - 1);
      expect(list.indexOf('reverseOut'), `${id} ${list.join('>')}`).toBe(list.indexOf('atScale2') + 1);
      expect(list.indexOf('atScale2')).toBeGreaterThan(list.indexOf('atScale'));
    }
    // 입고 트럭 대부분은 하역 단계에 더미에 닿아 쏟았다 (늦게 닿은 차는 쏟지 않는다: 서버 단계를 앞질러 지어내지 않는다)
    expect(inbound.filter((id) => tipped.has(id)).length).toBeGreaterThanOrEqual(Math.floor(inbound.length * 0.5));
    // 상차 차량은 상차 자리에 서서 북서 베일을 싣고 나갔다
    expect(out.every((id) => phases.get(id)!.includes('loading'))).toBe(true);
    expect(d.yard.stats.loadedOut).toBeGreaterThanOrEqual(4);
    expect(maxStill).toBeLessThan(40);
  });

  it.each([2, 3])('서버 값이 월드 시계보다 %s배 빨리 흘러도(느린 화면) 겹치거나 멈춰 버리지 않는다', (speed) => {
    const d = new Director();
    let real = 0;
    let synced = -1;
    let stuckSince = 0;
    let lastKey = '';
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
      // 무언가는 계속 움직인다: 적치·트럭 출입이 3분 넘게 그대로면 멈춰 버린 것이다
      const key = JSON.stringify(d.yard.stats) + d.trucks.map((x) => (x.active ? x.id + x.phase : '')).join();
      if (key !== lastKey) {
        lastKey = key;
        stuckSince = d.t;
      }
      expect(d.t - stuckSince, `t=${d.t.toFixed(1)} 멈춤`).toBeLessThan(180);
    }
    expect(d.yard.maxBlockedSec).toBeLessThan(120);
  });
});
