import { describe, expect, it, vi } from 'vitest';
import type { Bale } from '@ecocycle/shared';
import { YARD_FLOW, YARD_SEED_BALES } from '../../config/yard';
import { Kit } from '../three/kit';
import type { Footprint } from '../three/kit';
import { demoData } from '../demo/demoData';
import { balePlate } from '../world/balePlate';
import { BALE, YARD, YARD_FRAME, plateAt, yardToWorld } from '../world/layout';
import { Director } from './director';
import { Yard } from './yard';

// S2t(2026-11-27 사용자 요청): 압축기 배출구는 레일 대신 바닥 철판, 계근은 두 개를 2단으로 쌓아 한 번에(한 개만 나오면 singleWaitSec 뒤 한 개),
// 지게차는 계근대 → 남동 칸과 북서 → 상차 차량을 두 개씩 나른다. 화면 연출만 바뀌고 서버 값(베일 수)과 칸 정합은 그대로다.

vi.setConfig({ testTimeout: 120_000 });

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const DT = 0.05;

/** 처음 재고(YARD_SEED_BALES개, 오래된 적치)를 가진 서버 + 새 베일: times(초)에 하나씩 만들어진다 (출하 없음) */
function feed(times: readonly number[]): (t: number) => Bale[] {
  const seed: Bale[] = Array.from({ length: YARD_SEED_BALES }, (_, i) => ({
    id: `SEED-${i}`,
    batchId: 'b0',
    stage: 'created',
    vehicleId: null,
    stageTimes: { created: iso(T0 - (YARD_SEED_BALES - i) * 60_000) },
    updatedAt: iso(T0 - (YARD_SEED_BALES - i) * 60_000),
  }));
  return (t) => [
    ...seed,
    ...times
      .filter((c) => c <= t)
      .map((c, i): Bale => ({ id: `NEW-${i}`, batchId: 'b1', stage: 'created', vehicleId: null, stageTimes: { created: iso(T0 + c * 1000) }, updatedAt: iso(T0 + c * 1000) })),
  ];
}

interface Watch {
  maxOnScale: number;
  /** 저울에 한 개만 놓인 채 다른 베일 없이 지난 가장 긴 시간(초) */
  maxSingleWait: number;
  slotErrors: number;
}

function runYard(times: readonly number[], sec: number): { y: Yard; w: Watch } {
  const y = new Yard();
  const f = feed(times);
  const w: Watch = { maxOnScale: 0, maxSingleWait: 0, slotErrors: 0 };
  let single = 0;
  let next = 0;
  for (let i = 0; i * DT < sec; i += 1) {
    const t = i * DT;
    if (t >= next) {
      y.sync(f(t), T0 + t * 1000);
      next += 1;
    }
    y.step(DT, []);
    const a = y.audit();
    w.maxOnScale = Math.max(w.maxOnScale, a.onScale);
    single = a.onScale === 1 ? single + DT : 0;
    w.maxSingleWait = Math.max(w.maxSingleWait, single);
    w.slotErrors += a.slotErrors.length + a.baleOnBale + a.forkOnBale + a.forkOnFork;
    // 서버 적치 수 = 장면의 서버 베일(쌓임·철판·저울·운반) + 압축기가 아직 못 내보낸 것
    expect(a.active + a.waiting, `t=${t.toFixed(1)}`).toBe(f(t).length);
  }
  return { y, w };
}

describe('배출구 바닥 철판과 두 개 계근 (S2t)', () => {
  it('배출구에 레일·받침대가 없다: 바닥에 깐 철판(얇은 판)과 경사 철판뿐이고, 서 있는 조각은 저울 표시 기둥뿐이다', () => {
    const k = new Kit();
    const fp: Footprint[] = [];
    k.footprints = fp;
    balePlate(k, 0);
    const scale = { x: 0, z: 0 };
    yardToWorld(YARD.scale.x, YARD.scale.z, scale);
    // 바닥 투영이 남는 서 있는 조각(높이 0.22 넘게): 저울 표시 기둥과 표시판만
    expect(fp.length).toBeGreaterThan(0);
    for (const p of fp) expect(Math.hypot((p.x0 + p.x1) / 2 - scale.x, (p.z0 + p.z1) / 2 - scale.z)).toBeLessThan(YARD.scale.size);
    // 철판 윗면: 바닥 철판은 얇고, 경사 철판은 통로 바닥에서 바닥 철판까지 이어진다
    const at = { y: 0, tilt: 0 };
    expect(plateAt(YARD.stand.outletZ - 0.1, at).y).toBeCloseTo(YARD.stand.outletY, 6);
    expect(plateAt(YARD.stand.slopeEnd + 0.01, at).y).toBeCloseTo(YARD.stand.y, 6);
    expect(plateAt((YARD.stand.outletZ + YARD.stand.slopeEnd) / 2, at).tilt).toBeCloseTo(YARD.stand.slope, 6);
    // 지게차가 집는 바닥 철판 자리(0·1번)는 평평한 철판 위, 베일이 철판 안에 든다
    for (const z of YARD.stand.slots.slice(0, 2)) {
      expect(z - BALE.d / 2).toBeGreaterThanOrEqual(YARD.stand.slopeEnd - 1e-9);
      expect(z + BALE.d / 2).toBeLessThanOrEqual(YARD.stand.outletZ + YARD.stand.length + 1e-9);
    }
    void YARD_FRAME;
  });

  it('베일이 연달아 나오면 저울에 바로 2단으로 쌓아 한 번에 재고, 두 개를 한 번에 남동 칸에 쌓는다 (한 개 계근 없음)', () => {
    // 두 개씩 연달아(배출 한 번 3.2초 + 틈) 나오고, 다음 두 개는 지게차가 한 쌍을 다 옮긴 뒤 (실제 축척 속도)
    const times = Array.from({ length: 6 }, (_, i) => [5 + i * 70, 9 + i * 70]).flat();
    const { y, w } = runYard(times, 440);
    expect(w.maxOnScale).toBe(2);
    expect(y.stats.singles).toBe(0);
    expect(y.stats.stored).toBe(12);
    expect(y.stats.weighed).toBe(6);
    expect(w.slotErrors).toBe(0);
    // 다 쌓였다: 철판·저울·운반 중인 베일 없음
    const a = y.audit();
    expect(a.onStand + a.onScale + a.ejecting + a.carried).toBe(0);
  });

  it('한 개만 나오고 다음 베일이 singleWaitSec 안에 안 나오면 한 개만 재서 옮긴다 (저울에서 끝없이 기다리지 않는다)', () => {
    const gap = YARD_FLOW.singleWaitSec * 6;
    const times = [2, 2 + gap, 2 + gap * 2, 2 + gap * 2 + 4];
    const { y, w } = runYard(times, 2 + gap * 3.5);
    // 앞의 두 개는 따로따로 한 개씩, 마지막 둘은 함께
    expect(y.stats.singles).toBe(2);
    expect(y.stats.weighed).toBe(3);
    expect(y.stats.stored).toBe(4);
    // 한 개는 singleWaitSec 넘게 기다렸다 잰다 (철판에 다음 베일이 없을 때만), 너무 오래 두지 않는다
    expect(w.maxSingleWait).toBeGreaterThanOrEqual(YARD_FLOW.singleWaitSec);
    expect(w.maxSingleWait).toBeLessThan(YARD_FLOW.singleWaitSec + 40);
    expect(w.slotErrors).toBe(0);
    expect(y.audit().onScale).toBe(0);
  });

  it('상차: 지게차는 북서에서 두 개(2단)를 한 번에 집어 상차 차량 한 자리에 아래·위로 함께 내려놓는다', () => {
    const d = new Director();
    let next = 0;
    let pairs = 0;
    let lastOut = 0;
    for (let i = 0; i * DT < 800; i += 1) {
      const t = i * DT;
      if (t >= next) {
        const data = demoData(T0, Math.floor(t));
        d.sync({ devices: data.devices, vehicles: data.vehicles, batches: data.batches, bales: data.bales }, T0 + t * 1000);
        next += 1;
      }
      d.step(DT);
      const out = d.yard.stats.loadedOut;
      if (out - lastOut === 2) {
        pairs += 1;
        // 한 번에 실린 두 개는 같은 자리의 아래·위 단
        const loaded = d.bales.filter((b) => b.active && b.state === 'loaded').sort((p, q) => p.load - q.load);
        const [lo, hi] = loaded.slice(-2);
        expect(hi!.load).toBe(lo!.load + 1);
        expect(Math.hypot(hi!.x - lo!.x, hi!.z - lo!.z)).toBeLessThan(1e-6);
        expect(hi!.y - lo!.y).toBeCloseTo(BALE.h, 6);
      }
      lastOut = out;
    }
    expect(pairs).toBeGreaterThanOrEqual(5);
    // 거의 모든 상차가 두 개씩이다 (남은 게 한 개일 때만 한 개)
    expect(d.yard.stats.loadedOut).toBeGreaterThanOrEqual(d.yard.stats.loadTrips * 1.6);
  });
});
