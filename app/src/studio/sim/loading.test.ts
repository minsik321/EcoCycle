import { describe, expect, it, vi } from 'vitest';
import { demoData } from '../demo/demoData';
import { BALE, FORKLIFT_SCALE, FORK_REACH, LOAD_BED_REAR, LOAD_BED_Y, LOAD_ORDER, LOAD_TRUCK, YARD, YARD_FRAME, worldToYard } from '../world/layout';
import { Director } from './director';
import type { TruckSim } from './director';
import { WEIGH_SEC } from './yard';
import type { BaleSim, ForkliftSim } from './yard';

// S2j(사용자 수정 #3·#10·#12·#13·#14): 상차 트럭(25톤 카고)과 지게차 상차, 베일 계근 동작.
// 시연 원본(처음 상차 중인 차 한 대 + 여덟 번째마다 새 상차 차량, 한 대 20개)을 돌리며 매 걸음 본다. 월드 시계 20Hz.

vi.setConfig({ testTimeout: 120_000 });

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const DT = 0.05;
const EPS = 1e-6;
/** 지게차 몸체 앞(마스트) 끝: 지게차 가운데에서 (sim/yard의 BODY_FRONT) */
const BODY_FRONT = 0.56 * FORKLIFT_SCALE;

interface Local {
  along: number;
  across: number;
}

/** 마당 좌표의 점을 트럭(월드 자세) 기준 앞뒤·옆으로 */
function toTruck(t: TruckSim, x: number, z: number): Local {
  const p = { x: 0, z: 0 };
  worldToYard(t.x, t.z, p);
  const h = t.heading - YARD_FRAME.rotY;
  const dx = x - p.x;
  const dz = z - p.z;
  return { along: dx * Math.cos(h) - dz * Math.sin(h), across: dx * Math.sin(h) + dz * Math.cos(h) };
}

const onBed = (l: Local): boolean =>
  l.along - BALE.d / 2 >= LOAD_BED_REAR - EPS && l.along + BALE.d / 2 <= LOAD_BED_REAR + LOAD_TRUCK.bedLength + EPS && Math.abs(l.across) + BALE.w / 2 <= LOAD_TRUCK.bedWidth / 2 + EPS;

/** 입차 줄(도로·경사로·입차 계근)에 선 차를 빼고, 상차 자리로 가거나 싣거나 싣고 나가는 상차 차량.
 * S2s: 지게차가 실제 속도라 상차가 길어져 다음 상차 차량이 앞 차가 나가기 전에 들어와 줄 선다(그 차를 보면 안 된다) */
const QUEUE_PHASES = new Set(['road', 'roadHold', 'toScale', 'reverseIn', 'atScale']);
const loaderTruck = (d: Director): TruckSim | null => d.trucks.find((x) => x.active && x.outbound && !QUEUE_PHASES.has(x.phase)) ?? null;

function runDemo(seconds: number, each: (d: Director, t: number) => void): Director {
  const d = new Director();
  for (let i = 0; i * DT < seconds; i += 1) {
    const t = i * DT;
    if (i % 20 === 0) {
      const data = demoData(T0, Math.floor(t));
      d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
    }
    d.step(DT);
    each(d, t);
  }
  return d;
}

describe('상차 트럭(25톤 카고)과 지게차 상차 (S2j)', () => {
  it('실은 베일은 사라지지 않고 적재함 안에 남아 차와 함께 나가며, 집게·베일은 적재함 안·지게차는 차 밖에서 놓는다', () => {
    const left: Array<{ id: string; loaded: number; want: number }> = [];
    let truck: TruckSim | null = null;
    let lastLoaded = 0;
    let lastOut = 0;
    let placements = 0;
    let checkedBales = 0;
    runDemo(1300, (d, t) => {
      const out = loaderTruck(d);
      const loaded = d.bales.filter((b) => b.active && b.state === 'loaded');
      if (out !== truck) {
        lastLoaded = loaded.length;
        truck = out;
      }
      if (!out) return;
      // #3: 차가 있는 동안 실린 수는 줄지 않는다 (지게차가 놓은 베일이 사라지지 않는다)
      expect(loaded.length, `t=${t.toFixed(1)} 실린 베일이 줄었다`).toBeGreaterThanOrEqual(lastLoaded);
      lastLoaded = loaded.length;
      // 실린 베일은 모두 적재함 위(바닥판 안, 바닥 높이 이상)에 있고 긴 쪽이 차 길이 방향이다
      for (const b of loaded) {
        expect(onBed(toTruck(out, b.x, b.z)), `t=${t.toFixed(1)} 적재함 밖 베일`).toBe(true);
        expect(b.y).toBeGreaterThanOrEqual(LOAD_BED_Y - EPS);
        expect(Math.abs(Math.cos(b.rot - (out.heading - YARD_FRAME.rotY)))).toBeCloseTo(1, 6);
        checkedBales += 1;
      }
      // #10: 놓는 순간 베일은 적재함 안, 집게 끝도 차 외곽선 안, 지게차 몸체(마스트)는 차 밖
      if (d.yard.stats.loadedOut > lastOut) {
        // 한 번에 두 개(2단)를 놓으면 둘로 센다 (S2t)
        const placedNow = d.yard.stats.loadedOut - lastOut;
        lastOut = d.yard.stats.loadedOut;
        const f = d.forklifts.find((g) => g.task?.kind === 'load')!;
        const placed = loaded.reduce<BaleSim | null>((best, b) => (best && Math.hypot(best.x - f.x, best.z - f.z) < Math.hypot(b.x - f.x, b.z - f.z) ? best : b), null)!;
        expect(onBed(toTruck(out, placed.x, placed.z))).toBe(true);
        const tip = toTruck(out, f.x + Math.cos(f.heading) * (FORK_REACH + BALE.w / 2), f.z - Math.sin(f.heading) * (FORK_REACH + BALE.w / 2));
        expect(Math.abs(tip.across)).toBeLessThanOrEqual(LOAD_TRUCK.width / 2 + EPS);
        const front = toTruck(out, f.x + Math.cos(f.heading) * BODY_FRONT, f.z - Math.sin(f.heading) * BODY_FRONT);
        expect(Math.abs(front.across), `t=${t.toFixed(1)} 지게차가 적재함 옆선 안으로 들어왔다`).toBeGreaterThanOrEqual(LOAD_TRUCK.width / 2 - 0.02);
        placements += placedNow;
      }
      // 상차 자리를 떠나는 순간: 서버가 실었다고 한 수(최대 20)를 다 실었다
      if (out.phase === 'loadBack' && !left.some((x) => x.id === out.id)) left.push({ id: out.id, loaded: loaded.length, want: Math.min(out.want, LOAD_ORDER.length) });
      // 출차해 나가는 동안에도 실린 베일은 차를 따라간다 (서버가 departed를 먼저 보내도 상차 자리에서 마지막 베일을 마저 싣고 움직인다)
      if (out.leaving && out.phase !== 'loading') expect(loaded.length, `t=${t.toFixed(1)} ${out.id} ${out.stage}`).toBe(Math.min(out.want, LOAD_ORDER.length));
    });
    expect(placements).toBeGreaterThanOrEqual(30);
    expect(checkedBales).toBeGreaterThan(1000);
    // 시연 원본의 상차 차량 두 대가 다 싣고 떠났다 (한 대 20개)
    expect(left.length).toBeGreaterThanOrEqual(2);
    for (const l of left) expect(l.loaded, l.id).toBe(l.want);
    expect(left.some((l) => l.want === 20)).toBe(true);
  });

  it('지게차는 트럭이 상차 자리에 서서 옆판을 다 내린 뒤에 다가가고, 트럭은 마지막 베일을 놓은 뒤에 떠난다', () => {
    let arrivals = 0;
    let departures = 0;
    let prevPhase = '';
    runDemo(1300, (d, t) => {
      const out = loaderTruck(d);
      if (!out) {
        prevPhase = '';
        return;
      }
      const parked = out.phase === 'loading' && out.sides >= 1;
      // 상차하러 든 베일을 든 지게차가 차 곁(차 길이 + 여유 안)에 있으면 차는 이미 서서 옆판을 내렸다
      for (const f of d.forklifts) {
        if (f.task?.kind !== 'load' || !f.carrying || !f.cross) continue;
        const l = toTruck(out, f.x, f.z);
        if (Math.abs(l.along) < LOAD_TRUCK.length / 2 + 0.5 && Math.abs(l.across) < LOAD_TRUCK.width / 2 + FORK_REACH + 0.5) {
          expect(parked || out.phase === 'loading', `t=${t.toFixed(1)} 차가 서기 전 지게차가 다가갔다 (${out.phase})`).toBe(true);
        }
      }
      if (prevPhase === 'toLoad' && out.phase === 'loading') arrivals += 1;
      if (prevPhase === 'loading' && out.phase === 'loadBack') {
        departures += 1;
        expect(d.yard.loadingBusy(), `t=${t.toFixed(1)} 싣는 중에 떠났다`).toBe(false);
        expect(d.forklifts.some((f: ForkliftSim) => f.carrying && f.task?.kind === 'load')).toBe(false);
      }
      prevPhase = out.phase;
    });
    expect(arrivals).toBeGreaterThanOrEqual(1);
    expect(departures).toBeGreaterThanOrEqual(2);
  });

  it('베일 계근: 둘째 베일을 저울에 놓고 집게만 벌린 채 무게를 재고, 같은 지게차가 대기 자리에 가지 않고 바로 남동 칸에 쌓는다', () => {
    const pocket = { x: YARD.scale.x, z: YARD.scale.z + FORK_REACH };
    type Watch = { f: ForkliftSim; at: { x: number; z: number }; t0: number; pair: BaleSim[]; lifted: number; stored: number };
    let watch: Watch | null = null;
    let done = 0;
    let prevOnScale = 0;
    runDemo(900, (d, t) => {
      const onScale = d.bales.filter((b) => b.active && b.state === 'scale');
      if (!watch && prevOnScale === 1 && onScale.length === 2) {
        const f = d.forklifts.find((g) => g.task?.kind === 'scale' && Math.hypot(g.x - pocket.x, g.z - pocket.z) < 0.2);
        // (남동에 쌓을 열이 없으면 전처럼 저울에 두고 돌아간다: 그때는 보지 않는다. 바로 쌓을 때만 두 베일을 이 지게차가 맡는다)
        if (f && onScale.every((b) => b.owner === f.id)) watch = { f, at: { x: f.x, z: f.z }, t0: t, pair: onScale, lifted: -1, stored: d.yard.stats.stored };
      }
      prevOnScale = onScale.length;
      if (!watch) return;
      const w = watch;
      if (w.lifted < 0) {
        // 잴 때까지 저울 앞에서 움직이지 않는다 (대기 자리로 가지 않는다)
        expect(Math.hypot(w.f.x - w.at.x, w.f.z - w.at.z), `t=${t.toFixed(1)} 재는 동안 저울 앞을 떠났다`).toBeLessThan(0.05);
        if (w.pair.every((b) => b.state === 'carried')) {
          // 다시 집은 것은 같은 지게차, 무게를 잰 시간 뒤
          expect(w.pair.every((b) => b.owner === w.f.id)).toBe(true);
          expect(t - w.t0).toBeGreaterThanOrEqual(WEIGH_SEC - 0.1);
          w.lifted = t;
        }
        return;
      }
      // 집은 뒤에는 대기 자리에 들르지 않고 남동 칸에 놓는다
      expect(Math.hypot(w.f.x - w.f.home[0], w.f.z - w.f.home[1]), `t=${t.toFixed(1)} 쌓기 전에 대기 자리로 갔다`).toBeGreaterThan(0.3);
      if (d.yard.stats.stored >= w.stored + 2) {
        expect(w.pair.every((b) => b.state === 'stack')).toBe(true);
        done += 1;
        watch = null;
      }
    });
    expect(done).toBeGreaterThanOrEqual(3);
  });

  it('싣는 지게차가 길에서 막혀 끝나지 않아도 상차 차는 출차 단계에서 오래 기다리지 않고 실은 채 떠난다 (서로 기다려 멈추지 않는다)', () => {
    // 브라우저에서 본 일: 상차 차가 departed 뒤 14개에서 멈춰 떠나지 않았다 (싣는 지게차가 막혀 상차가 끝나지 않고, 차는 그 지게차를 기다렸다).
    // 여기서는 싣는 지게차의 길을 계속 막아 같은 상태를 만든다
    const d = new Director();
    const yard = d.yard as unknown as { hits: (...a: unknown[]) => boolean };
    const realHits = yard.hits.bind(d.yard);
    let id = '';
    let blockAt = -1;
    let departAt = -1;
    let left = -1;
    let loadedAtLeave = -1;
    let want = 0;
    for (let i = 0; i * DT < 900; i += 1) {
      const t = i * DT;
      if (i % 20 === 0) {
        const data = demoData(T0, Math.floor(t));
        const out = data.vehicles.find((v) => v.kind === 'outbound' && (v.id === id || (!id && v.stage === 'loading')));
        if (out && !id) id = out.id;
        // 막힌 뒤 20초에 서버가 출차를 준다 (그 전에는 상차 중)
        if (out && blockAt >= 0 && t >= blockAt + 20) {
          out.stage = 'departed';
          if (departAt < 0) departAt = t;
        } else if (out) out.stage = 'loading';
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
      }
      // 싣는 지게차가 베일을 든 채 움직이기 시작하면 그 뒤로 길을 계속 막는다
      if (blockAt < 0 && t > 60 && d.forklifts.some((f) => f.task?.kind === 'load' && f.carrying)) {
        blockAt = t;
        yard.hits = (f: unknown, ...rest: unknown[]) => ((f as ForkliftSim).task?.kind === 'load' ? true : realHits(f, ...rest));
      }
      d.step(DT);
      const truck = d.trucks.find((x) => x.active && x.id === id);
      if (truck && truck.phase === 'loading') want = Math.min(truck.want, LOAD_ORDER.length);
      if (left < 0 && departAt >= 0 && truck && truck.phase !== 'loading') {
        left = t;
        loadedAtLeave = d.bales.filter((b) => b.active && b.state === 'loaded').length;
      }
    }
    expect(blockAt).toBeGreaterThan(0);
    expect(departAt).toBeGreaterThan(0);
    expect(left, '상차 차가 떠나지 못했다').toBeGreaterThan(0);
    // 출차 뒤 기다리는 시간(150초) + 막힌 상차를 끝내기까지(30초) + 옆판을 올리고 차례를 잡는 몇 초
    expect(left - departAt).toBeLessThan(150 + 30 + 20);
    // 떠날 때 서버가 실었다고 한 수만큼 실려 있다 (든 베일도 적재함에)
    expect(loadedAtLeave).toBe(want);
  });
});
