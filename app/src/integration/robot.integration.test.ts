// @vitest-environment node
// 통합 테스트: 로봇팔 7단위(명세 6절 "로봇팔 7단위")를 실제 모의 서버로 확인한다.
//   1. 수동 두 단계: 집기 → (놓기 대기) → 컨베이어에 놓기. 순서가 틀린 요청은 서버가 409로 거부한다.
//      집기 기록에는 두 단계(집은 시각·놓은 시각, 조작한 사람)가 남는다.
//   2. 자동 · 섹터 지정: 배합 중인 배치에 지정이 걸리고, 서버가 실제로 놓은 부피로 실제 배합을 계산한다(계획과 따로).
//      사건 기록에 지정 시작·해제(누가·어느 섹터)가 남고, 지정이 끝나면 배치의 지정이 풀린다.
// 로봇 상태를 바꾸므로 끝나면 자동 모드로 되돌린다. 실행: npm run test:integration
import { afterAll, describe, expect, it } from 'vitest';
import type { Batch, BatchEvent, Command, CommandResultResponse, DeviceState, PickRecord, ProcessState, RecordPage, RobotState, TankId, TankState } from '@ecocycle/shared';

const API = (process.env.VITE_API_BASE ?? 'http://localhost:4099/api/v1').replace(/\/$/, '');
const ACTOR = '관리자(모의)';

let token = '';
async function login(): Promise<string> {
  if (token) return token;
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'admin', password: '1234' }),
  });
  expect(res.status).toBe(200);
  token = ((await res.json()) as { accessToken: string }).accessToken;
  return token;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await login()}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

let keySeq = 0;
async function send(command: Command): Promise<{ status: number; commandId?: string; message?: string }> {
  const res = await fetch(`${API}/devices/robot-1/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await login()}`, 'Idempotency-Key': `robot-${Date.now()}-${keySeq++}` },
    body: JSON.stringify(command),
  });
  const body = (await res.json()) as { commandId?: string; error?: { message: string } };
  return { status: res.status, commandId: body.commandId, message: body.error?.message };
}

/** 202로 받은 명령이 끝날 때까지 GET /commands/{id}로 기다린다 */
async function result(commandId: string, timeoutMs = 40_000): Promise<CommandResultResponse> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await get<CommandResultResponse>(`/commands/${commandId}`);
    if (r.status !== 'accepted') return r;
    await sleep(300);
  }
  throw new Error(`명령 ${commandId}가 끝나지 않았습니다`);
}

async function run(command: Command): Promise<CommandResultResponse> {
  const sent = await send(command);
  expect(sent.status, sent.message).toBe(202);
  return result(sent.commandId!);
}

const robot = async () => (await get<RobotState>('/devices/robot-1/state'));

async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (ok(value)) return value;
    await sleep(400);
  }
  throw new Error(`${what}: ${timeoutMs / 1000}초 안에 되지 않았습니다`);
}

/** 수동으로 바꾸기 전에 자동 사이클이 끝나 손이 빈 때를 기다린다 */
const idleEmpty = () => until(robot, (r) => r.phase === 'idle' && r.heldSectorId === null, 30_000, '로봇 대기');

afterAll(async () => {
  // 다음 테스트를 위해 들고 있는 것을 놓고 자동으로 되돌린다
  const r = await robot();
  if (r.mode === 'manual' && r.heldSectorId) await run({ type: 'place_on_conveyor', confirm: true });
  if (r.mode !== 'auto') await run({ type: 'set_mode', mode: 'auto', confirm: true });
}, 60_000);

describe('수동 두 단계: 집기 → 컨베이어에 놓기 (실제 모의 서버)', () => {
  it('자동 모드에서는 집기·놓기를 받지 않는다 (409)', async () => {
    const r = await robot();
    expect(r.mode).toBe('auto');
    expect((await send({ type: 'pick_from', tankId: 'tank-a1', confirm: true })).status).toBe(409);
    expect((await send({ type: 'place_on_conveyor', confirm: true })).status).toBe(409);
  });

  it('놓기 → 집기 순서는 거부하고, 집기 → 놓기만 받는다. 들고 있는 동안은 다시 집기·모드 전환을 거부한다', async () => {
    await idleEmpty();
    expect((await run({ type: 'set_mode', mode: 'manual', confirm: true })).status).toBe('completed');
    // 모드가 바뀌기 전에 시작한 자동 사이클은 끝까지 마친다
    await idleEmpty();

    // 들고 있지 않은데 놓기 → 409
    const early = await send({ type: 'place_on_conveyor', confirm: true });
    expect(early.status).toBe(409);
    expect(early.message).toMatch(/집어 든 파지가 없습니다/);

    // 가장 많이 찬 섹터에서 집는다 (빈 섹터면 집지 못한다)
    const devices = await get<DeviceState[]>('/devices');
    const fullest = devices.filter((d): d is TankState => d.type === 'tank').sort((a, b) => b.volumeM3 - a.volumeM3)[0]!;
    const tankId: TankId = fullest.id;
    const revision = (await robot()).pickRecordsRevision;

    const pick = await send({ type: 'pick_from', tankId, confirm: true });
    expect(pick.status).toBe(202);
    // 집는 동안(작업 중) 놓기 → 409
    await until(robot, (r) => r.phase !== 'idle', 5_000, '집기 시작');
    expect((await send({ type: 'place_on_conveyor', confirm: true })).status).toBe(409);
    expect((await result(pick.commandId!)).status).toBe('completed');

    // 놓기 대기: 집어 든 섹터와 닫힌 그리퍼, 대기 단계
    const holding = await robot();
    expect(holding).toMatchObject({ mode: 'manual', phase: 'idle', heldSectorId: tankId, gripper: { closed: true, holding: true } });
    expect(holding.pickRecordsRevision).toBe(revision); // 놓기 전에는 집기 기록이 없다

    // 들고 있는데 또 집기 → 409, 모드 전환 → 409
    const twice = await send({ type: 'pick_from', tankId, confirm: true });
    expect(twice.status).toBe(409);
    expect(twice.message).toMatch(/먼저 컨베이어에 놓으세요/);
    const switching = await send({ type: 'set_mode', mode: 'auto', confirm: true });
    expect(switching.status).toBe(409);

    // 확인(confirm) 없는 놓기는 형식 오류 422
    const raw = await fetch(`${API}/devices/robot-1/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await login()}`, 'Idempotency-Key': `robot-raw-${Date.now()}` },
      body: JSON.stringify({ type: 'place_on_conveyor' }),
    });
    expect(raw.status).toBe(422);

    // 놓기
    expect((await run({ type: 'place_on_conveyor', confirm: true })).status).toBe('completed');
    const placed = await robot();
    expect(placed).toMatchObject({ phase: 'idle', heldSectorId: null, gripper: { holding: false } });
    expect(placed.pickRecordsRevision).toBe(revision + 1);

    // 집기 기록 한 줄에 두 단계가 남는다
    const page = await get<RecordPage<PickRecord>>(`/robots/robot-1/picks/records?from=${encodeURIComponent(new Date(Date.now() - 600_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}&page=1&pageSize=10`);
    const latest = page.items[0]!;
    expect(latest).toMatchObject({ mode: 'manual', sectorId: tankId, grabbedBy: ACTOR, placedBy: ACTOR });
    expect(Date.parse(latest.grabbedAt)).toBeLessThan(Date.parse(latest.pickedAt));
    expect(latest.volumeM3).toBeGreaterThan(0);

    // 자동으로 되돌린다 (들고 있지 않으니 받는다)
    expect((await run({ type: 'set_mode', mode: 'auto', confirm: true })).status).toBe('completed');
  });
});

describe('자동 · 섹터 지정: 계획 배합과 실제 배합 (실제 모의 서버)', () => {
  const mixing = async () => (await get<ProcessState>('/process/state')).batches.find((b) => b.stage === 'mixing');

  it('지정하면 배합 중인 배치에 지정이 걸리고, 실제 배합은 실제로 놓은 섹터로 서버가 계산한다. 지정 변경은 사건 기록에 남는다', async () => {
    // 배합 중인 배치가 있을 때 지정한다
    const before = await until(mixing, (b) => !!b, 60_000, '배합 중인 배치');
    // 계획에 없는 섹터를 고를 수 있으면 그것을 지정해 실제 배합이 계획과 달라지게 한다
    const devices = await get<DeviceState[]>('/devices');
    const tanks = devices.filter((d): d is TankState => d.type === 'tank' && d.volumeM3 > 0.5);
    const outside = tanks.filter((t) => !before!.mix.some((m) => m.sectorId === t.id)).sort((a, b) => b.volumeM3 - a.volumeM3)[0];
    const pin: TankId = (outside ?? tanks.sort((a, b) => b.volumeM3 - a.volumeM3)[0]!).id;

    expect((await run({ type: 'set_mode', mode: 'auto_pinned', pinnedSectors: [pin], confirm: true })).status).toBe('completed');
    const pinned = await until(mixing, (b) => !!b?.pinning, 20_000, '배치에 지정이 걸림');
    expect(pinned!.pinning).toMatchObject({ sectors: [pin], actor: ACTOR });
    expect(pinned!.actualMix).not.toBeNull();
    expect(pinned!.pinChanges.at(-1)).toMatchObject({ actor: ACTOR, sectors: [pin] });

    // 지정 섹터에서 하나 이상 놓으면 실제 배합에 그 섹터가 들어간다. 계획(mix)은 그대로다
    const withPick = await until(
      async () => (await get<ProcessState>('/process/state')).batches.find((b) => b.id === pinned!.id),
      (b) => !!b?.actualMix?.some((m) => m.sectorId === pin),
      60_000,
      '지정 섹터를 놓은 실제 배합',
    );
    const batch = withPick as Batch;
    expect(batch.mix).toEqual(pinned!.mix);
    expect(batch.actualMix!.reduce((sum, m) => sum + m.percent, 0)).toBe(100);
    if (outside) expect(batch.actualMix).not.toEqual(batch.mix);

    // 사건 기록: 섹터 지정(누가·어느 섹터)
    const from = encodeURIComponent(new Date(Date.now() - 600_000).toISOString());
    const to = encodeURIComponent(new Date(Date.now() + 60_000).toISOString());
    const events = await get<RecordPage<BatchEvent>>(`/batches/events/records?from=${from}&to=${to}&page=1&pageSize=50`);
    const started = events.items.find((e) => (e.type === 'pin_started' || e.type === 'pin_changed') && e.actor === ACTOR);
    expect(started?.detail).toContain(pin.replace('tank-', '').toUpperCase());

    // 지정을 끝내면 배합 중인 배치의 지정이 풀리고(실제 배합 기록은 남는다) 해제 사건이 남는다
    expect((await run({ type: 'set_mode', mode: 'auto', confirm: true })).status).toBe('completed');
    expect((await robot()).pinnedSectors).toEqual([]);
    const after = await get<RecordPage<BatchEvent>>(`/batches/events/records?from=${from}&to=${to}&page=1&pageSize=50`);
    const current = (await get<ProcessState>('/process/state')).batches.find((b) => b.stage === 'mixing');
    if (current) expect(current.pinning).toBeNull();
    // 지정이 걸린 채 배합을 마친 배치면 해제 사건 없이 다음 배치로 넘어갔을 수 있다. 그 밖에는 해제 사건이 있다
    const ended = after.items.find((e) => e.type === 'pin_ended' && e.actor === ACTOR);
    if (current?.pinChanges.length) expect(ended).toBeDefined();

    // 배치 기록에도 지정 기록과 실제 배합이 남는다
    const record = await get<{ actualMix: unknown; pinChanges: Array<{ actor: string; sectors: TankId[] }> }>(`/batches/${batch.id}`);
    expect(record.actualMix).not.toBeNull();
    expect(record.pinChanges[0]).toMatchObject({ actor: ACTOR, sectors: [pin] });
  });
});
