// @vitest-environment node
// 통합 테스트: 상차 차량·출차 계근을 실제 모의 서버로 확인한다 (명세 6절 "공정 기록"·"공정 흐름", decisions 2026-11-25, B41).
//   차량 기록에 입고·상차가 섞이고, 둘 다 출차 계근(weighing_out)을 거쳐 출차, 상차 차량의 baleIds와 베일 vehicleId가 같고,
//   종류 이름("입고"·"상차")으로 검색된다.
// 실행: npm run test:integration
import { describe, expect, it } from 'vitest';
import type { BaleDetail, BaleRecord, ProcessState, RecordPage, VehicleRecord } from '@ecocycle/shared';

const API = (process.env.VITE_API_BASE ?? 'http://localhost:4099/api/v1').replace(/\/$/, '');

let tokenPromise: Promise<string> | undefined;
const token = () =>
  (tokenPromise ??= fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'viewer', password: '1234' }),
  })
    .then((res) => res.json() as Promise<{ accessToken: string }>)
    .then((body) => body.accessToken));

const DAY = 86_400_000;

async function get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
  expect(res.status, path).toBe(200);
  return (await res.json()) as T;
}

const window30 = () => ({ from: new Date(Date.now() - 30 * DAY).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), page: 1, pageSize: 100 });
const records = <T>(path: string, q?: string) => get<RecordPage<T>>(path, { ...window30(), q });

describe('상차 차량·출차 계근 (실제 모의 서버)', () => {
  it('"상차"로 찾으면 상차 차량만, "입고"로 찾으면 입고 차량만 나온다', async () => {
    const outbound = await records<VehicleRecord>('/vehicles/records', '상차');
    const inbound = await records<VehicleRecord>('/vehicles/records', '입고');
    expect(outbound.total).toBeGreaterThan(0);
    expect(inbound.total).toBeGreaterThan(outbound.total);
    expect(outbound.items.every((r) => r.kind === 'outbound')).toBe(true);
    expect(inbound.items.every((r) => r.kind === 'inbound')).toBe(true);
  });

  it('출차한 차량은 모두 출차 계근을 거쳤고, 무게 셋이 있고 순중량 = 총중량 − 공차', async () => {
    const page = await records<VehicleRecord>('/vehicles/records');
    const departed = page.items.filter((r) => r.status === 'departed');
    expect(departed.length).toBeGreaterThan(0);
    for (const r of departed) {
      expect(r.stageTimes.weighing_out, r.id).toBeDefined();
      expect(Date.parse(r.stageTimes.weighing_out!)).toBeLessThan(Date.parse(r.stageTimes.departed!));
      expect(r.netT).toBeCloseTo(r.grossT! - r.tareT!, 2);
      if (r.kind === 'outbound') expect(r.sectorId).toBeNull();
    }
  });

  it('상차 차량의 baleIds가 가리키는 베일은 shipped + 같은 vehicleId (한 건 조회·베일 목록 모두)', async () => {
    const outbound = (await records<VehicleRecord>('/vehicles/records', '상차')).items.find((r) => r.status === 'departed' && r.baleIds.length > 0)!;
    expect(outbound).toBeDefined();
    const one = await get<VehicleRecord>(`/vehicles/${outbound.id}`);
    expect(one).toMatchObject({ kind: 'outbound', baleIds: outbound.baleIds });
    const baleRows = await records<BaleRecord>('/bales/records', outbound.baleIds[0]);
    expect(baleRows.items.find((b) => b.id === outbound.baleIds[0])).toMatchObject({ stage: 'shipped', vehicleId: outbound.id });
    for (const id of outbound.baleIds) {
      const bale = await get<BaleDetail>(`/bales/${id}`);
      expect(bale).toMatchObject({ stage: 'shipped', vehicleId: outbound.id });
    }
  });

  it('공정 흐름 상태의 차량에 kind·baleIds가 있고, 베일에 vehicleId가 있다', async () => {
    const state = await get<ProcessState>('/process/state');
    expect(state.vehicles.length).toBeGreaterThan(0);
    for (const v of state.vehicles) {
      expect(['inbound', 'outbound']).toContain(v.kind);
      expect(Array.isArray(v.baleIds)).toBe(true);
      if (v.kind === 'inbound') expect(v.baleIds).toEqual([]);
    }
    for (const b of state.bales) expect(b.stage === 'shipped' ? typeof b.vehicleId : b.vehicleId).toBe(b.stage === 'shipped' ? 'string' : null);
  });
});
