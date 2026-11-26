import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@ecocycle/shared';
import { VEHICLE_TIMING_SEC } from '../../../../mock-server/src/fixtures/process';
import { demoData } from '../demo/demoData';
import { Director, PLATE_READ_SEC } from './director';

// S2l: 번호판은 계근대에서 인식한다(명세 6절 "입구 → 계근대(arrived, 번호판 인식 장면, identified까지 대기)").
//  - 입구에 막 들어온 차는 서버가 번호판을 줘도(늦게 그린 장면) 계근대에 서서 읽기 전에는 보이지 않는다
//  - 모의 서버의 인식 시간(VEHICLE_TIMING_SEC.identify)은 3D 차가 입구 → 계근대에 닿아 읽는 시간보다 길다

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const DT = 0.05;
const iso = (ms: number) => new Date(ms).toISOString();

/** 막 들어온 차 한 대를 돌리며 단계·번호판을 본다. plate가 있으면 처음부터 서버가 인식 값을 준 것처럼 넣는다 */
function drive(kind: Vehicle['kind'], plate: string | null, seconds: number) {
  const d = new Director();
  const data = demoData(T0, 0);
  const v: Vehicle = {
    id: 'p1',
    kind,
    baleIds: [],
    stage: plate ? 'identified' : 'arrived',
    plate,
    companyName: plate ? '예시 회사' : null,
    sectorId: plate && kind === 'inbound' ? 'sector-a' : null,
    stageTimes: { arrived: iso(T0), ...(plate ? { identified: iso(T0) } : {}) },
    updatedAt: iso(T0),
  };
  // 서버 값이 이미 identified면 "fresh" 판정(arrived)에 걸리지 않으므로 arrived로 먼저 들인 뒤 바로 바꾼다
  d.sync({ devices: data.devices, vehicles: [{ ...v, stage: 'arrived', plate: null, companyName: null, sectorId: null }], batches: [], bales: [] }, T0);
  const samples: Array<{ t: number; phase: string; plate: string | null; company: string | null; scan: string | null }> = [];
  for (let t = 0; t < seconds; t += DT) {
    d.sync({ devices: data.devices, vehicles: [v], batches: [], bales: [] }, T0 + t * 1000);
    d.step(DT);
    const tr = d.trucks.find((x) => x.active && x.id === 'p1');
    if (tr) samples.push({ t, phase: tr.phase, plate: tr.plate, company: tr.company, scan: d.plateScan.active ? d.plateScan.plate : null });
  }
  return samples;
}

describe.each(['inbound', 'outbound'] as const)('번호판은 계근대에서 (%s)', (kind) => {
  it('서버가 번호판을 일찍 줘도 도로·경사로에서는 보이지 않고, 계근대에서 읽은 뒤에 보인다', () => {
    const samples = drive(kind, '12가 3456', 30);
    const atScale = samples.find((s) => s.phase === 'atScale');
    expect(atScale).toBeDefined();
    for (const s of samples.filter((x) => x.t < atScale!.t)) {
      expect(s.plate, `${s.phase}@${s.t.toFixed(2)}`).toBeNull();
      expect(s.company).toBeNull();
    }
    // 계근대에 막 선 뒤 PLATE_READ_SEC 동안은 "인식 중"
    const reading = samples.filter((s) => s.phase === 'atScale' && s.t < atScale!.t + PLATE_READ_SEC - DT);
    expect(reading.length).toBeGreaterThan(0);
    for (const s of reading) expect(s.scan).toBeNull();
    const shown = samples.find((s) => s.plate !== null);
    expect(shown?.phase).toBe('atScale');
    expect(samples.some((s) => s.scan === '12가 3456')).toBe(true);
  });

  it('모의 서버의 인식(identified)은 3D 차가 계근대에 서서 읽기 시작한 뒤에 온다', () => {
    const samples = drive(kind, null, 30);
    const atScale = samples.find((s) => s.phase === 'atScale');
    expect(atScale).toBeDefined();
    expect(VEHICLE_TIMING_SEC.identify).toBeGreaterThanOrEqual(atScale!.t + PLATE_READ_SEC);
    // 인식 전에는 계근대에서 "인식 중" 장면으로 기다린다(번호판 없음)
    expect(samples.filter((s) => s.phase === 'atScale').every((s) => s.plate === null && s.scan === null)).toBe(true);
  });
});
