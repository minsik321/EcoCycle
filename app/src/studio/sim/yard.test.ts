import { describe, expect, it, vi } from 'vitest';
import type { Bale } from '@ecocycle/shared';
import { YARD_CAPACITY, YARD_FLOW, YARD_SEED_BALES } from '../../config/yard';
import { demoData } from '../demo/demoData';
import { YARD } from '../world/layout';
import { Director } from './director';
import { Yard } from './yard';
import type { YardAudit } from './yard';

// 베일 적치 흐름(docs/dashboard-spec.md 3절): 배출 → 받침대(새 베일이 앞 베일을 밀어냄) → 저울(두 개 겹쳐 한 번에) → 남동 칸(한 쌍씩)
// → 남동이 차면 오래된 줄부터 북서로 → 서버 출하(shipped)는 북서에서 빠짐(상차 차량이 있으면 지게차가 북서에서 하나씩 실음).
// 오래 돌려 겹침·칸 정합·서버 값과의 일치를 본다. 월드 시계 20Hz.

vi.setConfig({ testTimeout: 90_000 });

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const DT = 0.05;

type Feed = (tSec: number) => Bale[];

/** 서버 흉내: everySec마다 하나 만들고 shipAfterSec 뒤 출하(실은 차량 없음). 목록에는 출하 안 된 것 모두 + 최근 출하 keep개 */
function steadyFeed(everySec: number, shipAfterSec: number, keep = 14): Feed {
  return (t) => {
    const out: Bale[] = [];
    const last = Math.floor(t / everySec);
    const firstUnshipped = shipAfterSec >= 1e8 ? 0 : Math.max(0, Math.ceil((t - shipAfterSec) / everySec));
    for (let n = Math.max(0, Math.min(firstUnshipped, last) - keep); ; n += 1) {
      const created = n * everySec;
      if (created > t) break;
      const shipped = t >= created + shipAfterSec;
      out.push({
        id: `BL-${String(n).padStart(4, '0')}`,
        batchId: `batch-${n}`,
        stage: shipped ? 'shipped' : 'created',
        vehicleId: null,
        stageTimes: shipped ? { created: iso(T0 + created * 1000), shipped: iso(T0 + (created + shipAfterSec) * 1000) } : { created: iso(T0 + created * 1000) },
        updatedAt: iso(T0 + created * 1000),
      });
    }
    return out;
  };
}

interface RunResult {
  last: YardAudit;
  maxWaiting: number;
  fullSeconds: number;
  minSe: number;
  maxOnStand: number;
  maxOnScale: number;
  /** 서버가 '적치'라 센 베일 − 장면의 서버 베일(대기 포함)이 어긋난 초 */
  mismatchSeconds: number;
  badRot: number;
}

function check(a: YardAudit, t: number): void {
  expect(a.baleOnBale, `t=${t.toFixed(1)} 베일끼리 겹침`).toBe(0);
  expect(a.forkOnBale, `t=${t.toFixed(1)} 지게차와 베일이 겹침`).toBe(0);
  expect(a.forkOnWall, `t=${t.toFixed(1)} 지게차·든 베일이 바탕 베일 벽에 닿음`).toBe(0);
  expect(a.forkOnFork, `t=${t.toFixed(1)} 지게차끼리 겹침`).toBe(0);
  expect(a.forkOnTruck, `t=${t.toFixed(1)} 지게차와 트럭이 겹침`).toBe(0);
  expect(a.slotErrors, `t=${t.toFixed(1)} 칸 정합`).toEqual([]);
}

function run(feed: Feed, seconds: number, director = new Director()): RunResult {
  const r: RunResult = { last: director.yard.audit(), maxWaiting: 0, fullSeconds: 0, minSe: Infinity, maxOnStand: 0, maxOnScale: 0, mismatchSeconds: 0, badRot: 0 };
  let t = 0;
  let nextSync = 0;
  let synced: Bale[] = [];
  while (t < seconds) {
    if (t >= nextSync) {
      synced = feed(t);
      director.sync({ devices: {}, vehicles: [], batches: [], bales: synced }, T0 + t * 1000);
      nextSync += 1;
    }
    director.step(DT);
    t += DT;
    const a = director.yard.audit(director.trucks);
    check(a, t);
    r.maxWaiting = Math.max(r.maxWaiting, a.waiting);
    r.minSe = Math.min(r.minSe, a.seStacked);
    r.maxOnStand = Math.max(r.maxOnStand, a.onStand + a.ejecting);
    r.maxOnScale = Math.max(r.maxOnScale, a.onScale);
    if (director.yardFull) r.fullSeconds += DT;
    if (Math.abs(t - Math.round(t)) < DT / 2) {
      const created = synced.filter((b) => b.stage === 'created').length;
      if (a.active + a.waiting !== created) r.mismatchSeconds += 1;
      // 정돈: 쌓인 베일은 모두 칸 줄 방향 그대로(무작위 회전 없음)
      for (const b of director.bales) if (b.active && b.state === 'stack' && Math.abs(Math.abs(b.rot) - Math.PI / 2) > 1e-9) r.badRot += 1;
    }
    r.last = a;
  }
  return r;
}

describe('베일 적치: 받침대 → 저울 → 남동 → 북서', () => {
  it('시연 원본을 20분 돌려도 겹침·칸 어긋남이 없고, 남동은 비지 않으며, 서버 값과 장면 베일 수가 맞는다', () => {
    const feed: Feed = (t) => demoData(T0, Math.floor(t)).bales as Bale[];
    const d = new Director();
    const r = run(feed, 1200, d);
    expect(r.maxWaiting).toBeLessThanOrEqual(1);
    expect(r.fullSeconds).toBe(0);
    // 남동은 처음부터 쌓여 있고 비어 사라지지 않는다 (S2j: 상차가 한 대 20개라 출하가 많아 북서로 옮기는 줄이 늘어, 옮기는 한 쌍만큼 잠깐 처음보다 낮을 수 있다)
    expect(r.minSe).toBeGreaterThanOrEqual(YARD_FLOW.seStartColumns * YARD_FLOW.levels - 2);
    expect(r.mismatchSeconds).toBe(0);
    expect(r.badRot).toBe(0);
    expect(r.maxOnStand).toBeLessThanOrEqual(3);
    expect(r.maxOnScale).toBeLessThanOrEqual(2);
    expect(d.yard.stats.weighed).toBeGreaterThanOrEqual(8);
    // 한 번 잴 때 두 개(2단), 다음 베일이 singleWaitSec 안에 안 오면 한 개 (S2t)
    expect(d.yard.stats.stored).toBe(d.yard.stats.weighed * 2 - d.yard.stats.singles);
    expect(d.yard.stats.singles).toBeLessThan(d.yard.stats.weighed);
  });

  it('남동이 차면 오래된 줄부터 줄 단위로 북서로 옮긴다', () => {
    const d = new Director();
    // 출하가 북서에서 빠져 북서에 자리가 생기면, 차오른 남동의 오래된 줄을 옮긴다
    run(steadyFeed(20, 300, 30), 1500, d);
    expect(d.yard.stats.transferred).toBeGreaterThan(0);
    // 옮긴 열은 그때 비어 있지 않은 열 중 가장 오래된 것이다 (나이 차 0)
    expect(d.yard.transferAges.every((age) => age === 0)).toBe(true);
    expect(d.yard.transferAges.length).toBeGreaterThan(0);
  });

  it('출하 단계가 오지 않으면 남동·북서가 차고 받침대가 차서 압축기가 기다린다 (얹어 떨어뜨리지 않는다)', () => {
    const d = new Director();
    const r = run(steadyFeed(12, 1e9, 300), 2400, d);
    expect(r.fullSeconds).toBeGreaterThan(0);
    expect(r.last.waiting).toBeGreaterThan(0);
    expect(r.last.slotsUsed).toBeLessThanOrEqual(YARD_CAPACITY);
    expect(r.last.seStacked).toBe(YARD.seXs.length * YARD.levels);
  });

  it('모의 서버 같은 생산(30초에 하나, 40초 뒤 출하)을 15분 돌려도 쌓이지 않고 서버 값과 맞는다', () => {
    const r = run(steadyFeed(30, 40), 900);
    expect(r.maxWaiting).toBeLessThanOrEqual(2);
    expect(r.mismatchSeconds).toBe(0);
  });

  it('출하(shipped)는 북서에서 하나가 빠진다: 남동 베일이면 그 베일은 이름 없는 재고가 되고 북서 맨 위가 빠진다', () => {
    const d = new Director();
    const feed = steadyFeed(20, 1e9, 200);
    run(feed, 300, d);
    const named = d.bales.filter((b) => b.active && b.id && b.state === 'stack');
    expect(named.length).toBeGreaterThan(0);
    const targetId = named[0]!.id;
    const before = d.yard.audit();
    const bales = feed(300).map((b) => (b.id === targetId ? { ...b, stage: 'shipped' as const, stageTimes: { ...b.stageTimes, shipped: iso(T0 + 300_000) } } : b));
    d.sync({ devices: {}, vehicles: [], batches: [], bales }, T0 + 300_000);
    const after = d.yard.audit();
    expect(after.nwStacked).toBe(before.nwStacked - 1);
    expect(after.seStacked + after.onStand + after.onScale + after.carried).toBe(before.seStacked + before.onStand + before.onScale + before.carried);
    expect(after.active).toBe(before.active - 1);
    expect(d.bales.some((b) => b.active && b.id === targetId)).toBe(false);
  });

  it('처음 본 오래된 적치 베일은 바탕 재고에 이름을 붙인다: 재고 칸 수만큼이면 장면 베일 수 = 서버 적치 수, 오래된 것은 북서 (S2q)', () => {
    /** 모의 서버 시작 상태 흉내: n개의 오래된 적치 베일(1분 간격, 가장 새 것도 FRESH_MS보다 오래됨) */
    const seeded = (n: number): Bale[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `BL-S${String(i).padStart(3, '0')}`,
        batchId: `batch-${i}`,
        stage: 'created' as const,
        vehicleId: null,
        stageTimes: { created: iso(T0 - (n - i) * 60_000) },
        updatedAt: iso(T0 - (n - i) * 60_000),
      }));
    const stacked = (y: Yard) => y.bales.filter((b) => b.active && b.state === 'stack');
    const nwFrom = YARD_FLOW.seColumns * YARD_FLOW.levels;

    // 연결 전: 바탕 재고만(이름 없음)
    const y = new Yard();
    expect(stacked(y)).toHaveLength(YARD_SEED_BALES);
    expect(stacked(y).every((b) => !b.id)).toBe(true);

    // 재고 칸 수만큼 오면 모두 이름이 붙고 새 베일은 늘지 않는다
    const list = seeded(YARD_SEED_BALES);
    y.sync(list, T0);
    expect(stacked(y)).toHaveLength(YARD_SEED_BALES);
    expect(y.bales.filter((b) => b.active)).toHaveLength(YARD_SEED_BALES);
    expect(new Set(stacked(y).map((b) => b.id))).toEqual(new Set(list.map((b) => b.id)));
    expect(y.audit().active).toBe(YARD_SEED_BALES);
    expect(y.audit().slotErrors).toEqual([]);
    // 오래된 36개는 북서, 나머지는 남동
    const nwIds = new Set(list.slice(0, YARD_FLOW.nwColumns * YARD_FLOW.levels).map((b) => b.id));
    for (const b of stacked(y)) expect(b.slot >= nwFrom).toBe(nwIds.has(b.id));

    // 서버가 오래된 20개를 출하하면 북서에서 20개가 빠지고 장면 베일 수가 서버 적치 수를 따른다
    const after = list.map((b, i) => (i < 20 ? { ...b, stage: 'shipped' as const, stageTimes: { ...b.stageTimes, shipped: iso(T0 + 60_000) }, updatedAt: iso(T0 + 60_000) } : b));
    const nwBefore = y.audit().nwStacked;
    y.sync(after, T0 + 60_000);
    expect(y.audit().active).toBe(YARD_SEED_BALES - 20);
    expect(y.audit().nwStacked).toBe(nwBefore - 20);

    // 재고보다 적으면 남는 칸은 이름 없는 재고로 남는다(시연·실서버 초기)
    const few = new Yard();
    few.sync(seeded(10), T0);
    expect(stacked(few)).toHaveLength(YARD_SEED_BALES);
    expect(stacked(few).filter((b) => b.id)).toHaveLength(10);
    expect(stacked(few).filter((b) => b.id).every((b) => b.slot >= nwFrom)).toBe(true);

    // 재고보다 많으면 남는 베일은 남동 빈 칸으로
    const many = new Yard();
    many.sync(seeded(YARD_SEED_BALES + 6), T0);
    expect(stacked(many)).toHaveLength(YARD_SEED_BALES + 6);
    expect(stacked(many).every((b) => b.id)).toBe(true);
    expect(many.audit().slotErrors).toEqual([]);
    expect(many.audit().baleOnBale).toBe(0);
  });

  it('지게차 한 대 설정으로도 시연 원본을 따라가고 겹침이 없다', async () => {
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
    expect(r.maxWaiting).toBeLessThanOrEqual(2);
    expect(r.mismatchSeconds).toBe(0);
    vi.doUnmock('../../config/yard');
    vi.resetModules();
  });
});

describe('화면을 떠났다가 돌아온 베일 적치 구역', () => {
  it.each(['new-scene', 'paused-with-sync'] as const)('%s: 밀린 베일을 반영하고 재개해도 겹치지 않고 서버 값과 맞는다', (mode) => {
    const d = new Director();
    const feed = steadyFeed(20, 1e9, 80);
    const sync = (t: number) => d.sync({ devices: {}, vehicles: [], batches: [], bales: feed(t) }, T0 + t * 1000);
    if (mode !== 'new-scene') {
      sync(0);
      for (let i = 0; i < 100; i += 1) d.step(DT);
    }
    if (mode === 'paused-with-sync') for (let t = 5; t <= 600; t += 1) sync(t);
    sync(600);
    check(d.yard.audit(d.trucks), 600);
    // 밀린 베일은 남동 칸에 바로 놓이거나 압축기 대기로 들어간다 (서버가 적치라 한 수와 같다)
    expect(d.yard.audit().active + d.yard.audit().waiting).toBe(31);
    d.step(600);
    for (let i = 0; i < 300 / DT; i += 1) {
      d.step(DT);
      check(d.yard.audit(d.trucks), i * DT);
    }
  });
});
