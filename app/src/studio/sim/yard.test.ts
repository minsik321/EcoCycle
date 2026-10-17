import { describe, expect, it, vi } from 'vitest';
import type { Bale } from '@ecocycle/shared';
import { YARD_CAPACITY } from '../../config/yard';
import { demoData } from '../demo/demoData';
import { Director } from './director';
import type { YardAudit } from './yard';

// 출하 마당: 베일이 쌓여도 마당이 한정되고, 어떤 것도 겹치지 않고, 서버 값(적치/출하)과 장면이 맞는지 오래 돌려 본다.
// 값은 서버 단계를 흉내 낸 생산 속도(만든 뒤 얼마 만에 출하 단계가 오는가)이고, 월드 시계를 20Hz로 돌린다.

// 수십 분어치 월드 시계를 돌리므로 다른 시험과 함께 돌 때를 위해 여유를 둔다
vi.setConfig({ testTimeout: 60_000 });

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const DT = 0.05;

/** 베일 n번째를 (만든 시각, 출하 시각)으로 정하는 서버 흉내 */
type Feed = (tSec: number) => Bale[];

function steadyFeed(everySec: number, shipAfterSec: number, keep = 14): Feed {
  // 서버 목록: 아직 출하 안 된 베일은 모두, 출하된 것은 최근 keep개
  return (t) => {
    const out: Bale[] = [];
    const last = Math.floor(t / everySec);
    const firstUnshipped = shipAfterSec >= 1e8 ? 0 : Math.max(0, Math.ceil((t - shipAfterSec) / everySec) - 0);
    for (let n = Math.max(0, Math.min(firstUnshipped, last) - keep); ; n += 1) {
      const created = n * everySec;
      if (created > t) break;
      const shipped = t >= created + shipAfterSec;
      out.push({
        id: `BL-${String(n).padStart(4, '0')}`,
        batchId: `batch-${n}`,
        stage: shipped ? 'shipped' : 'created',
        stageTimes: shipped ? { created: iso(T0 + created * 1000), shipped: iso(T0 + (created + shipAfterSec) * 1000) } : { created: iso(T0 + created * 1000) },
        updatedAt: iso(T0 + created * 1000),
      });
    }
    return out;
  };
}

interface RunResult {
  audits: YardAudit[];
  maxStacked: number;
  maxOnSite: number;
  maxWaiting: number;
  fullSeconds: number;
  maxBlocked: number;
  shippedCount: number;
  /** 서버가 '적치'라 센 베일 − 장면의 베일(대기 중 포함)이 어긋난 시각(초) */
  mismatchSeconds: number;
  /** 출하 단계가 온 뒤 장면에서 나가기까지 걸린 가장 긴 시간(초) */
  maxShipLag: number;
  stored: number;
  shipped: number;
  swaps: number;
}

function run(feed: Feed, seconds: number, director = new Director()): RunResult {
  const result: RunResult = { audits: [], maxStacked: 0, maxOnSite: 0, maxWaiting: 0, fullSeconds: 0, maxBlocked: 0, shippedCount: 0, mismatchSeconds: 0, maxShipLag: 0, stored: 0, shipped: 0, swaps: 0 };
  let t = 0;
  let nextSync = 0;
  const shipAsked = new Map<string, number>();
  let wasFull = false;
  let synced: Bale[] = [];
  while (t < seconds) {
    if (t >= nextSync) {
      const bales = feed(t);
      synced = bales;
      director.sync({ devices: {}, vehicles: [], batches: [], bales }, T0 + t * 1000);
      for (const b of bales) if (b.stage === 'shipped' && !shipAsked.has(b.id)) shipAsked.set(b.id, t);
      nextSync += 1;
    }
    director.step(DT);
    t += DT;
    const audit = director.yard.audit(director.trucks);
    // 겹침과 칸 정합은 매 걸음 본다
    expect(audit.baleOnBale, `t=${t.toFixed(1)} 베일끼리 겹침`).toBe(0);
    expect(audit.forkOnBale, `t=${t.toFixed(1)} 지게차와 베일이 겹침`).toBe(0);
    expect(audit.forkOnFork, `t=${t.toFixed(1)} 지게차끼리 겹침`).toBe(0);
    expect(audit.forkOnTruck, `t=${t.toFixed(1)} 지게차와 트럭이 겹침`).toBe(0);
    expect(audit.slotErrors, `t=${t.toFixed(1)} 칸 정합`).toEqual([]);
    expect(audit.active).toBeLessThanOrEqual(audit.slots + 3);
    result.maxStacked = Math.max(result.maxStacked, audit.stacked);
    result.maxOnSite = Math.max(result.maxOnSite, audit.active);
    result.maxWaiting = Math.max(result.maxWaiting, audit.waiting);
    if (director.yardFull) {
      result.fullSeconds += DT;
      // 가득 찼다면 정말 칸이 모두 차 있거나 배정돼 있다
      expect(audit.waiting).toBeGreaterThan(0);
    }
    if (director.yardFull !== wasFull) wasFull = director.yardFull;
    result.maxBlocked = Math.max(result.maxBlocked, audit.maxBlockedSec);

    // 데이터 일치: 서버가 '적치'라 한 베일은 장면(또는 압축기 대기)에 있고, 장면의 베일은 서버가 '적치'거나 출하 단계가 막 와서 지게차를 기다리는 것이다
    if (Math.abs(t - Math.round(t)) < DT / 2) {
      const bales = synced;
      const created = bales.filter((b) => b.stage === 'created').length;
      const shipReq = bales.filter((b) => b.stage === 'shipped' && director.bales.some((s) => s.active && s.id === b.id)).length;
      if (audit.active + audit.waiting !== created + shipReq) result.mismatchSeconds += 1;
      for (const [id, at] of shipAsked) {
        if (director.bales.some((s) => s.active && s.id === id)) result.maxShipLag = Math.max(result.maxShipLag, t - at);
        else shipAsked.delete(id);
      }
    }
  }
  result.audits.push(director.yard.audit(director.trucks));
  Object.assign(result, director.yard.stats);
  return result;
}

describe('출하 마당: 생산 속도를 지게차가 따라간다', () => {
  it('시연 원본(52초에 하나)을 10분 돌려도 마당이 쌓이지 않고 겹침이 없다', () => {
    const feed: Feed = (t) => demoData(T0, Math.floor(t)).bales as Bale[];
    const r = run(feed, 600);
    expect(r.maxStacked).toBeLessThanOrEqual(3);
    expect(r.maxWaiting).toBe(0);
    expect(r.fullSeconds).toBe(0);
    expect(r.maxBlocked).toBeLessThan(15);
    expect(r.maxShipLag).toBeLessThan(40);
    expect(r.shipped).toBeGreaterThanOrEqual(9);
  });

  it.each([
    [62, 25],
    [40, 25],
    [30, 20],
  ])('모의 서버 같은 생산(%s초에 하나, %s초 뒤 출하)을 15분 돌려도 마당이 쌓이지 않는다', (every, shipAfter) => {
    const r = run(steadyFeed(every, shipAfter), 900);
    expect(r.maxStacked).toBeLessThanOrEqual(4);
    expect(r.maxWaiting).toBe(0);
    expect(r.fullSeconds).toBe(0);
    expect(r.maxBlocked).toBeLessThan(15);
    expect(r.shipped).toBeGreaterThanOrEqual(Math.floor((900 - shipAfter - 30) / every));
  });

  it('서버 값과 장면이 맞는다: 서버가 적치라 센 베일은 모두 장면에 있고, 출하 단계가 온 베일은 지게차가 가져가면 사라진다', () => {
    const r = run(steadyFeed(40, 25), 600);
    // 출하 단계가 온 뒤 지게차가 가져갈 때까지의 짧은 어긋남뿐이다
    expect(r.mismatchSeconds).toBeLessThanOrEqual(2);
    expect(r.maxShipLag).toBeLessThan(40);
  });

  it('지게차가 못 따라갈 만큼 빠른 생산(8초에 하나)에서는 압축기가 기다리고, 마당은 칸 수를 넘지 않으며 겹치지 않는다', () => {
    const r = run(steadyFeed(8, 6, 40), 3000);
    // 생산이 지게차를 앞질러도 압축기가 기다릴 뿐 마당은 늘지 않는다 (서버 목록에서 빠진 베일은 출하된 것으로 본다)
    expect(r.maxOnSite).toBeLessThanOrEqual(YARD_CAPACITY);
    expect(r.maxWaiting).toBeGreaterThan(0);
    expect(r.maxBlocked).toBeLessThan(25);
    // 막히지 않고 계속 출하한다 (지게차 두 대가 낼 수 있는 만큼)
    expect(r.shipped).toBeGreaterThanOrEqual(80);
  });

  it('출하 단계가 오지 않으면 칸이 차고 압축기가 기다린다 (베일을 얹어 떨어뜨리지 않는다)', () => {
    const r = run(steadyFeed(20, 1e9, 60), 1200);
    expect(r.maxStacked).toBe(YARD_CAPACITY);
    expect(r.fullSeconds).toBeGreaterThan(0);
    expect(r.audits[0]!.yardFull).toBe(true);
    expect(r.audits[0]!.waiting).toBeGreaterThan(0);
    // 칸마다 한 베일, 한 칸 위로 쌓인 단 수는 칸 수와 같다
    expect(r.audits[0]!.slotsUsed).toBe(YARD_CAPACITY);
  });

  it('가득 찬 뒤 출하가 한꺼번에 오면 가장 먼저 만들어진 베일부터 나가고, 깔린 베일은 이름표를 바꿔 달아 서버 값과 맞는다', () => {
    const d = new Director();
    const every = 20;
    // 40분 동안 출하 없이 쌓는다
    const feedFull = steadyFeed(every, 1e9, 80);
    run(feedFull, 1500, d);
    expect(d.yardFull).toBe(true);
    const stacked = d.bales.filter((b) => b.active && b.state === 'stack');
    expect(stacked).toHaveLength(YARD_CAPACITY);
    // 이제 가장 오래된 베일 몇 개의 출하 단계가 온다 (맨 아래 단에 깔린 것들)
    const oldest = [...stacked].sort((a, b) => a.seq - b.seq).slice(0, 4).map((b) => b.id);
    const bales = feedFull(1500).map((b) => (oldest.includes(b.id) ? { ...b, stage: 'shipped' as const, stageTimes: { ...b.stageTimes, shipped: iso(T0 + 1500_000) } } : b));
    d.sync({ devices: {}, vehicles: [], batches: [], bales }, T0 + 1500_000);
    const order: string[] = [];
    for (let i = 0; i < 20 * 240; i += 1) {
      d.step(DT);
      for (const id of oldest) if (!order.includes(id) && !d.bales.some((b) => b.active && b.id === id)) order.push(id);
      const audit = d.yard.audit(d.trucks);
      expect(audit.baleOnBale + audit.forkOnBale + audit.forkOnFork).toBe(0);
      expect(audit.slotErrors).toEqual([]);
    }
    // 출하 단계가 온 이름은 모두 장면에서 사라졌다 (같은 이름표가 마당에 남지 않는다)
    expect(order.sort()).toEqual([...oldest].sort());
    expect(d.yard.stats.swaps).toBeGreaterThan(0);
  });

  it('길에 트럭이 서 있으면 지게차는 닿지 않고 기다렸다가, 트럭이 비키면 간다', () => {
    const d = new Director();
    const truck = d.trucks[0]!;
    truck.active = true;
    truck.x = -6.4;
    truck.z = -7.08;
    truck.heading = 0;
    truck.phase = 'atBay';
    const feed = steadyFeed(40, 25);
    const bale = feed(0);
    d.sync({ devices: {}, vehicles: [], batches: [], bales: bale }, T0);
    let waited = 0;
    for (let i = 0; i < 20 * 40; i += 1) {
      d.step(DT);
      const a = d.yard.audit(d.trucks);
      expect(a.forkOnTruck).toBe(0);
      if (d.forklifts.some((f) => f.waiting)) waited += DT;
    }
    expect(waited).toBeGreaterThan(5);
    expect(d.yard.stats.stored).toBe(0);
    truck.active = false;
    for (let i = 0; i < 20 * 40; i += 1) d.step(DT);
    expect(d.yard.stats.stored).toBe(1);
  });
});

describe('화면을 떠났다가 돌아온 출하 마당', () => {
  it('클램프를 닫고 운반하며 적치 후 열고 출하 후 빈 집게로 돌아온다', () => {
    const d = new Director();
    const bales = steadyFeed(40, 25)(0);
    d.sync({ devices: {}, vehicles: [], batches: [], bales }, T0);
    let closing = false;
    let opening = false;
    let carried = false;
    let requestedShip = false;
    for (let i = 0; i < 120 / DT; i += 1) {
      d.step(DT);
      for (const f of d.forklifts) {
        if (f.clamp > 0 && f.clamp < 1) {
          closing ||= d.yard.stats.stored === 0;
          opening ||= d.yard.stats.stored > 0;
        }
        if (f.carrying) {
          carried = true;
          expect(f.clamp).toBe(1);
        }
      }
      if (!requestedShip && d.yard.stats.stored > 0 && d.forklifts.every((f) => f.clamp === 0)) {
        requestedShip = true;
        d.sync({ devices: {}, vehicles: [], batches: [], bales: bales.map((b) => ({ ...b, stage: 'shipped' })) }, T0 + i * DT * 1000);
      }
    }
    expect(closing && opening && carried && requestedShip).toBe(true);
    expect(d.yard.stats.shipped).toBe(1);
    expect(d.forklifts.every((f) => !f.away && !f.carrying && f.clamp === 0)).toBe(true);
  });

  it.each(['new-scene', 'paused-with-sync', 'paused-without-sync'] as const)('%s: 밀린 베일을 반영하고 재개해도 겹치지 않는다', (mode) => {
    const d = new Director();
    const feed = steadyFeed(20, 1e9, 80);
    const sync = (t: number, ship = false) => {
      const bales = feed(t).map((b) => ship ? { ...b, stage: 'shipped' as const } : b);
      d.sync({ devices: {}, vehicles: [], batches: [], bales }, T0 + t * 1000);
    };
    const check = () => {
      const a = d.yard.audit(d.trucks);
      expect(a.baleOnBale + a.forkOnBale + a.forkOnFork + a.forkOnTruck).toBe(0);
      // 복귀 직후에는 운반 중인 아래 칸 위로 오래된 베일이 먼저 배치될 수 있다.
      // 겹침 검사와 별개로 아래에서 이 일시적인 공중 적치를 기록한다.
      expect(a.slotErrors.filter((error) => !error.includes('공중에 있다'))).toEqual([]);
      expect(a.slotsUsed).toBeLessThanOrEqual(YARD_CAPACITY);
    };
    if (mode !== 'new-scene') {
      sync(0);
      for (let i = 0; i < 100; i += 1) d.step(DT);
    }
    // 10분 동안 프레임이 멈춘 사이 서버 데이터만 진행한 경우도 확인한다.
    if (mode === 'paused-with-sync') {
      for (let t = 5; t <= 600; t += 1) {
        sync(t);
        check();
      }
    }
    sync(600);
    check();
    expect(d.yard.audit().slotErrors).toEqual(mode === 'paused-without-sync' ? ['칸 8의 베일이 공중에 있다'] : []);
    expect(d.yard.audit().active + d.yard.audit().waiting).toBe(31);
    // 복귀 첫 프레임의 큰 delta와 이후 적치·출하 동작을 모두 검사한다.
    d.step(600);
    check();
    for (let i = 0; i < 600 / DT; i += 1) {
      if (i === 60 / DT) sync(660, true);
      d.step(DT);
      check();
    }
    expect(d.yard.stats.shipped).toBeGreaterThan(0);
    expect(d.yard.audit().active + d.yard.audit().waiting).toBe(0);
    expect(d.yard.audit().slotErrors).toEqual([]);
  });
});

describe('지게차 한 대 설정', () => {
  it('지게차 한 대로도 시연 원본(52초에 하나)을 따라가고, 겹침이 없다', async () => {
    vi.resetModules();
    vi.doMock('../../config/yard', async (importOriginal) => {
      const original = await importOriginal<typeof import('../../config/yard')>();
      return { ...original, YARD_FLOW: { ...original.YARD_FLOW, forkliftCount: 1 } };
    });
    const { Director: One } = await import('./director');
    const d = new One();
    expect(d.forklifts).toHaveLength(1);
    const feed: Feed = (t) => demoData(T0, Math.floor(t)).bales as Bale[];
    const r = run(feed, 900, d as unknown as Director);
    expect(r.maxStacked).toBeLessThanOrEqual(4);
    expect(r.maxWaiting).toBeLessThanOrEqual(1);
    expect(r.fullSeconds).toBe(0);
    expect(r.maxShipLag).toBeLessThan(60);
    vi.doUnmock('../../config/yard');
    vi.resetModules();
  });
});
