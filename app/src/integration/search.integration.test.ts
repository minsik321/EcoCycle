// @vitest-environment node
// 통합 테스트: 기록·알람 검색(`q`)을 실제 모의 서버로 확인한다 (명세 6절 "기록 목록"의 검색).
//   결과 = 기간 AND 검색어, 대소문자·공백 무시 부분 일치("12가3456"이 "12가 3456"을 찾는다), 너무 긴 검색어는 422.
// 실행: npm run test:integration
import { describe, expect, it } from 'vitest';
import { RECORD_SEARCH_MAX_LENGTH, normalizeSearch } from '@ecocycle/shared';
import type { Alarm, BaleRecord, BatchEvent, BatchRecord, PickRecord, RecordPage, UnloadRecord, VehicleRecord } from '@ecocycle/shared';

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
const range = (days: number) => ({ from: new Date(Date.now() - days * DAY).toISOString(), to: new Date(Date.now() + 60_000).toISOString() });

async function get(path: string, query: Record<string, string | number | undefined>): Promise<Response> {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  return fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
}

async function records<T>(path: string, q?: string, days = 30): Promise<RecordPage<T>> {
  const res = await get(path, { ...range(days), page: 1, pageSize: 100, q });
  expect(res.status).toBe(200);
  return (await res.json()) as RecordPage<T>;
}

describe('기록 검색 (실제 모의 서버)', () => {
  it('번호판의 공백을 무시하고 대소문자를 가리지 않고 부분 일치한다', async () => {
    const all = await records<UnloadRecord>('/devices/tank-a1/unloads/records');
    expect(all.items.length).toBeGreaterThan(0);
    const plate = all.items[0]!.plate;
    expect(plate).toMatch(/\s/); // 모의 번호판은 "12가 3456"처럼 공백이 있다
    const squeezed = plate.replace(/\s+/g, '');
    for (const q of [squeezed, plate, squeezed.slice(0, 4), ` ${squeezed} `]) {
      const found = await records<UnloadRecord>('/devices/tank-a1/unloads/records', q);
      expect(found.items.some((r) => r.id === all.items[0]!.id), q).toBe(true);
      expect(found.items.every((r) => normalizeSearch(r.plate).includes(normalizeSearch(q)) || normalizeSearch(r.companyName).includes(normalizeSearch(q)))).toBe(true);
      expect(found.total).toBe(found.items.length);
    }
  });

  it('회사 이름으로도 찾고, 없는 글이면 total 0', async () => {
    const all = await records<VehicleRecord>('/vehicles/records');
    const company = all.items.find((r) => r.companyName)!.companyName!;
    const found = await records<VehicleRecord>('/vehicles/records', company.slice(1, 3));
    expect(found.items.length).toBeGreaterThan(0);
    expect(found.items.every((r) => normalizeSearch(`${r.plate} ${r.companyName}`).includes(normalizeSearch(company.slice(1, 3))))).toBe(true);
    const none = await records<VehicleRecord>('/vehicles/records', 'zzzz-없는-검색어');
    expect(none).toMatchObject({ items: [], total: 0 });
  });

  it('기간과 검색어를 함께 적용한다 (기간 안의 기록 중에서만 찾는다)', async () => {
    const month = await records<VehicleRecord>('/vehicles/records');
    const oldest = month.items.filter((r) => r.plate).at(-1)!; // 시각 내림차순이라 마지막이 가장 오래된 것
    const q = oldest.plate!;
    const wide = await records<VehicleRecord>('/vehicles/records', q, 30);
    expect(wide.items.some((r) => r.id === oldest.id)).toBe(true);
    // 오래된 기록이 속하지 않는 아주 짧은 기간(지금 -1분 ~ 지금)에서는 같은 검색어라도 나오지 않는다
    const res = await get('/vehicles/records', { from: new Date(Date.now() - 60_000).toISOString(), to: new Date().toISOString(), page: 1, pageSize: 100, q });
    const narrow = (await res.json()) as RecordPage<VehicleRecord>;
    expect(narrow.items.some((r) => r.id === oldest.id)).toBe(false);
  });

  it('쪽 나누기는 검색 결과 기준이다 (total·쪽 수)', async () => {
    // 전체를 100줄씩 모두 받아 직접 거른 건수와, 서버가 2줄씩 나눠 준 검색 결과의 total이 같다
    const everything: UnloadRecord[] = [];
    for (let page = 1; ; page++) {
      const res = await get('/devices/tank-a1/unloads/records', { ...range(30), page, pageSize: 100 });
      const body = (await res.json()) as RecordPage<UnloadRecord>;
      everything.push(...body.items);
      if (everything.length >= body.total) break;
    }
    const q = '가';
    const expected = everything.filter((r) => normalizeSearch(`${r.plate}${r.companyName}`).includes(q));
    expect(expected.length).toBeGreaterThan(2);
    expect(expected.length).toBeLessThan(everything.length); // 검색이 실제로 거른다
    const res = await get('/devices/tank-a1/unloads/records', { ...range(30), page: 1, pageSize: 2, q });
    const first = (await res.json()) as RecordPage<UnloadRecord>;
    expect(first.total).toBe(expected.length);
    expect(first.items).toHaveLength(2);
    // 마지막 쪽은 검색 결과 기준으로 계산된다
    const lastPage = Math.ceil(expected.length / 2);
    const last = (await (await get('/devices/tank-a1/unloads/records', { ...range(30), page: lastPage, pageSize: 2, q })).json()) as RecordPage<UnloadRecord>;
    expect(last.items.length).toBe(expected.length - (lastPage - 1) * 2);
    const beyond = (await (await get('/devices/tank-a1/unloads/records', { ...range(30), page: lastPage + 1, pageSize: 2, q })).json()) as RecordPage<UnloadRecord>;
    expect(beyond.items).toEqual([]);
  });

  it('배치는 배치 ID와 섹터로, 베일은 베일 ID와 배치 ID로 찾는다', async () => {
    const batches = await records<BatchRecord>('/batches/records');
    const batch = batches.items[0]!;
    expect((await records<BatchRecord>('/batches/records', batch.id.toLowerCase())).items.some((r) => r.id === batch.id)).toBe(true);
    const bySector = await records<BatchRecord>('/batches/records', '섹터 A1');
    expect(bySector.items.every((r) => r.mix.some((m) => m.sectorId === 'tank-a1'))).toBe(true);
    expect((await records<BatchRecord>('/batches/records', 'tank-a1')).total).toBe(bySector.total);

    const bales = await records<BaleRecord>('/bales/records');
    const bale = bales.items[0]!;
    expect((await records<BaleRecord>('/bales/records', bale.id)).items.some((r) => r.id === bale.id)).toBe(true);
    const byBatch = await records<BaleRecord>('/bales/records', bale.batchId);
    expect(byBatch.items.length).toBeGreaterThan(0);
    expect(byBatch.items.every((r) => r.batchId === bale.batchId || r.id.includes(bale.batchId))).toBe(true);
  });

  it('집기 기록은 섹터와 배치 ID로 찾는다', async () => {
    const picks = await records<PickRecord>('/robots/robot-1/picks/records');
    expect(picks.items.length).toBeGreaterThan(0);
    const b2 = await records<PickRecord>('/robots/robot-1/picks/records', 'b2');
    expect(b2.items.length).toBeGreaterThan(0);
    expect(b2.items.every((r) => r.sectorId === 'tank-b2')).toBe(true);
  });

  it('사건 기록은 사건 종류·수행자·배치 ID로 찾는다', async () => {
    const events = await records<BatchEvent>('/batches/events/records');
    expect(events.items.length).toBeGreaterThan(0);
    const created = await records<BatchEvent>('/batches/events/records', '배치생성');
    expect(created.items.every((e) => e.type === 'created')).toBe(true);
    const actor = events.items[0]!.actor;
    const byActor = await records<BatchEvent>('/batches/events/records', actor);
    expect(byActor.items.every((e) => e.actor === actor || e.batchId.includes(actor))).toBe(true);
  });

  it('너무 긴 검색어는 422', async () => {
    const res = await get('/vehicles/records', { ...range(1), page: 1, pageSize: 10, q: 'a'.repeat(RECORD_SEARCH_MAX_LENGTH + 1) });
    expect(res.status).toBe(422);
  });
});

describe('알람 검색 (실제 모의 서버)', () => {
  it('기기 이름·알람 메시지를 찾고 기간(from·to)과 함께 적용한다', async () => {
    const all = (await (await get('/alarms', { from: range(30).from })).json()) as Alarm[];
    expect(all.length).toBeGreaterThan(2);
    const byDevice = (await (await get('/alarms', { from: range(30).from, q: '압축기' })).json()) as Alarm[];
    expect(byDevice.length).toBeGreaterThan(0);
    expect(byDevice.every((a) => a.deviceId === 'compressor-1')).toBe(true);
    const bySector = (await (await get('/alarms', { from: range(30).from, q: '섹터a1' })).json()) as Alarm[];
    expect(bySector.every((a) => a.deviceId === 'tank-a1')).toBe(true);
    const byMessage = (await (await get('/alarms', { from: range(30).from, q: '적재율80%' })).json()) as Alarm[];
    expect(byMessage.length).toBeGreaterThan(0);
    // 기간: 사흘 전~이틀 전 사이로 좁히면 그 사이의 알람만 남는다
    const from = new Date(Date.now() - 3 * DAY).toISOString();
    const to = new Date(Date.now() - 2 * DAY).toISOString();
    const window = (await (await get('/alarms', { from, to })).json()) as Alarm[];
    expect(window.every((a) => a.ts >= from && a.ts < to)).toBe(true);
    const windowSearch = (await (await get('/alarms', { from, to, q: '압축기' })).json()) as Alarm[];
    expect(windowSearch.every((a) => a.deviceId === 'compressor-1' && a.ts >= from && a.ts < to)).toBe(true);
  });

  it('잘못된 to·너무 긴 q는 422', async () => {
    expect((await get('/alarms', { to: 'nope' })).status).toBe(422);
    expect((await get('/alarms', { q: 'a'.repeat(RECORD_SEARCH_MAX_LENGTH + 1) })).status).toBe(422);
  });
});
