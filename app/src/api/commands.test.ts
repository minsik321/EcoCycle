import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@ecocycle/shared';
import { clearTokens, createMemoryTokenStore, setRefreshTokenStore, setTokens } from './tokens';
import { PERMISSION_MISSING, newIdempotencyKey, sendCommand } from './commands';
import { ApiError } from './http';

const ALL = { permissions: [...PERMISSIONS] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let calls: Array<{ url: string; init: RequestInit }>;

beforeEach(async () => {
  setRefreshTokenStore(createMemoryTokenStore());
  await clearTokens();
  await setTokens('at', 'rt');
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ commandId: 'cmd-1', status: 'accepted' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const header = (name: string) => (calls[0]!.init.headers as Record<string, string>)[name];

describe('sendCommand', () => {
  it('Idempotency-Key를 붙여 보내고 202 응답과 키를 돌려준다', async () => {
    const result = await sendCommand('robot-1', { type: 'pause' }, ALL);

    expect(calls[0]!.url).toMatch(/\/devices\/robot-1\/commands$/);
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ type: 'pause' });
    expect(header('Idempotency-Key')).toBe(result.idempotencyKey);
    expect(result.idempotencyKey).toMatch(UUID);
    expect(result.accepted).toEqual({ commandId: 'cmd-1', status: 'accepted' });
  });

  it('같은 버튼을 다시 보낼 때는 넘겨 준 키를 그대로 쓴다', async () => {
    const first = await sendCommand('robot-1', { type: 'pause' }, ALL);
    await sendCommand('robot-1', { type: 'pause' }, { ...ALL, idempotencyKey: first.idempotencyKey });
    expect((calls[1]!.init.headers as Record<string, string>)['Idempotency-Key']).toBe(first.idempotencyKey);
  });

  it('새 요청마다 다른 키를 만든다', async () => {
    const a = await sendCommand('robot-1', { type: 'pause' }, ALL);
    const b = await sendCommand('robot-1', { type: 'pause' }, ALL);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it('위험도 높은 명령은 confirm: true 없이는 보내지 않는다', async () => {
    // 타입이 막는 경우를 일부러 우회해 런타임 보호를 확인한다
    const bad = { type: 'set_mode', mode: 'manual' } as unknown as Parameters<typeof sendCommand>[1];
    await expect(sendCommand('robot-1', bad, ALL)).rejects.toThrow('confirm');
    const wrong = { type: 'pick_from', tankId: 'tank-a1', confirm: false } as unknown as Parameters<typeof sendCommand>[1];
    await expect(sendCommand('robot-1', wrong, ALL)).rejects.toThrow('confirm');
    expect(calls).toHaveLength(0);

    await sendCommand('robot-1', { type: 'set_mode', mode: 'manual', confirm: true }, ALL);
    expect(calls).toHaveLength(1);
  });

  it('명령의 필요 권한(COMMAND_RULES)이 없으면 요청을 보내지 않고 403 PERMISSION_MISSING으로 거부한다', async () => {
    // 작업자 권한으로는 위험 조작을, 열람자(권한 없음)로는 어떤 조작도 보내지 않는다
    const operator = { permissions: ['robot.control', 'alarm.ack'] as const };
    await expect(sendCommand('robot-1', { type: 'set_mode', mode: 'manual', confirm: true }, { permissions: [...operator.permissions] })).rejects.toMatchObject({
      status: 403,
      code: PERMISSION_MISSING,
    });
    await expect(sendCommand('robot-1', { type: 'pause' }, { permissions: [] })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(0);

    await sendCommand('robot-1', { type: 'pause' }, { permissions: [...operator.permissions] });
    expect(calls).toHaveLength(1);
  });
});

describe('newIdempotencyKey', () => {
  it('보안 컨텍스트가 아니라 crypto.randomUUID가 없어도 UUID 형식 키를 만든다', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) });
    try {
      const key = newIdempotencyKey();
      expect(key).toMatch(UUID);
      expect(newIdempotencyKey()).not.toBe(key);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
