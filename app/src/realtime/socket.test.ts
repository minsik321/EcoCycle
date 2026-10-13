import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ServerMessage } from '@ecocycle/shared';
import { createRealtimeClient } from './socket';
import type { RealtimeClient, SocketLike } from './socket';
import type { ConnectionState, RealtimeSink } from './types';

class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  readyState = 0;
  sent: Array<{ type: string; topics: string[] }> = [];
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  // 서버 쪽 동작을 흉내 낸다
  serverOpen() {
    this.readyState = 1;
    this.onopen?.({});
  }
  serverSend(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  serverClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const heartbeat = (): ServerMessage => ({ type: 'heartbeat', ts: new Date().toISOString() });
const last = () => FakeSocket.instances[FakeSocket.instances.length - 1]!;
/** 비동기(티켓 발급 등)가 끝나도록 한 번 흘려보낸다 */
const flush = () => vi.advanceTimersByTimeAsync(0);

let client: RealtimeClient;
let connections: ConnectionState[];
let sink: RealtimeSink;
let ticketCount: number;
let getTicket: Mock<() => Promise<{ ticket: string }>>;

function setup(resync: () => Promise<void> = async () => undefined) {
  connections = [];
  ticketCount = 0;
  getTicket = vi.fn(async () => ({ ticket: `ticket-${++ticketCount}` }));
  sink = {
    onConnection: (state) => connections.push(state),
    onPlantSummary: vi.fn(),
    onDeviceStates: vi.fn(),
    onAlarm: vi.fn(),
    onCommandResult: vi.fn(),
    onVehicle: vi.fn(),
    onBatch: vi.fn(),
    onBale: vi.fn(),
    resync: vi.fn(resync),
  };
  client = createRealtimeClient({
    sink,
    getTicket,
    wsBase: 'ws://test/ws/v1/stream',
    createSocket: (url) => new FakeSocket(url),
  });
}

async function startAndOpen() {
  client.start();
  await flush();
  last().serverOpen();
  last().serverSend(heartbeat()); // 열린 것만으로는 연결됨이 아니고, 첫 메시지를 받아야 online이다
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T05:00:00.000Z'));
  FakeSocket.instances = [];
  setup();
});

afterEach(() => {
  client.stop();
  vi.useRealTimers();
});

describe('연결', () => {
  it('티켓을 받아 연결하고, 기본 주제를 구독하고, 첫 메시지를 받으면 online이 되어 REST로 맞춘다', async () => {
    client.start();
    expect(client.getStatus()).toBe('connecting');
    await flush();

    expect(getTicket).toHaveBeenCalledTimes(1);
    expect(last().url).toBe('ws://test/ws/v1/stream?ticket=ticket-1');

    last().serverOpen();
    await flush();
    expect(last().sent).toEqual([{ type: 'subscribe', topics: ['plant', 'devices', 'alarms', 'process'] }]);
    expect(client.getStatus()).toBe('connecting'); // 소켓이 열렸을 뿐 아직 아무것도 못 받았다
    expect(sink.resync).not.toHaveBeenCalled();

    last().serverSend(heartbeat());
    await flush();
    expect(client.getStatus()).toBe('online');
    expect(sink.resync).toHaveBeenCalledTimes(1);
    expect(connections.map((c) => c.status)).toEqual(['connecting', 'online']);
  });

  it('소켓은 열렸는데 서버가 침묵하면 online이 되지 않고, 15초 뒤 끊김으로 표시하고 다시 연결한다', async () => {
    client.start();
    await flush();
    last().serverOpen();
    await vi.advanceTimersByTimeAsync(14_000);
    expect(client.getStatus()).toBe('connecting');
    expect(sink.resync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(client.getStatus()).toBe('offline');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('끊겼다가 다시 연결되어도 첫 메시지를 받기 전에는 끊김을 유지하고, 마지막 수신 시각은 실제 마지막 메시지의 것이다', async () => {
    await startAndOpen();
    const lastMessageAt = new Date(Date.now()).toISOString();
    last().serverClose();
    expect(client.getStatus()).toBe('offline');

    await vi.advanceTimersByTimeAsync(1_000);
    last().serverOpen(); // 서버가 소켓은 열어 주지만 아직 침묵
    await vi.advanceTimersByTimeAsync(5_000);
    expect(client.getStatus()).toBe('offline');
    expect(connections.at(-1)).toEqual({ status: 'offline', lastReceivedAt: lastMessageAt });
    expect(sink.resync).toHaveBeenCalledTimes(1); // 처음 연결 때뿐

    last().serverSend(heartbeat());
    await flush();
    expect(client.getStatus()).toBe('online');
    expect(sink.resync).toHaveBeenCalledTimes(2);
  });

  it('받은 메시지는 type별로 나뉘어 sink로 간다', async () => {
    await startAndOpen();
    last().serverSend({
      type: 'alarm',
      alarm: { id: 'al-1', level: 'caution', deviceId: 'tank-a1', message: 'm', state: 'active', ts: '2026-10-13T05:00:00.000Z' },
    });
    last().serverSend({ type: 'command.result', commandId: 'cmd-1', status: 'completed', reason: null });
    expect(sink.onAlarm).toHaveBeenCalledTimes(1);
    expect(sink.onCommandResult).toHaveBeenCalledWith({ commandId: 'cmd-1', status: 'completed', reason: null });
  });

  it('JSON이 아닌 메시지는 무시한다', async () => {
    await startAndOpen();
    last().onmessage?.({ data: 'not json' });
    last().onmessage?.({ data: '123' });
    expect(client.getStatus()).toBe('online');
  });

  it('티켓을 못 받으면 offline으로 표시하고 다시 시도한다', async () => {
    getTicket.mockRejectedValueOnce(new Error('network'));
    client.start();
    await flush();
    expect(client.getStatus()).toBe('offline');
    expect(FakeSocket.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(getTicket).toHaveBeenCalledTimes(2);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('끊김', () => {
  it('15초 동안 아무것도 못 받으면 연결 끊김과 마지막 수신 시각을 알리고 새로 연결한다', async () => {
    await startAndOpen();
    const lastMessageAt = Date.now();
    vi.advanceTimersByTime(5_000);
    last().serverSend(heartbeat());
    const receivedAt = Date.now();
    expect(receivedAt).toBeGreaterThan(lastMessageAt);

    await vi.advanceTimersByTimeAsync(14_000);
    expect(client.getStatus()).toBe('online');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(client.getStatus()).toBe('offline');
    expect(connections.at(-1)).toEqual({ status: 'offline', lastReceivedAt: new Date(receivedAt).toISOString() });
    expect(FakeSocket.instances[0]!.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000); // 첫 재연결 대기
    expect(FakeSocket.instances).toHaveLength(2);
    expect(getTicket).toHaveBeenCalledTimes(2);
    expect(last().url).toContain('ticket-2'); // 새 티켓
  });

  it('heartbeat가 계속 오면 끊김으로 보지 않는다', async () => {
    await startAndOpen();
    for (let i = 0; i < 20; i += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      last().serverSend(heartbeat());
    }
    expect(client.getStatus()).toBe('online');
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('소켓이 닫히면 바로 offline으로 표시하고, 재연결 간격은 1초 → 2초 → 4초로 늘어난다', async () => {
    await startAndOpen();
    last().serverClose();
    expect(client.getStatus()).toBe('offline');

    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(2); // 1초 뒤

    last().serverClose(); // 열리기도 전에 다시 실패
    await vi.advanceTimersByTimeAsync(1_999);
    expect(FakeSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(3); // 2초 뒤

    last().serverClose();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(FakeSocket.instances).toHaveLength(4); // 4초 뒤
  });

  it('재연결이 성공하면 간격이 처음으로 돌아가고, 구독을 다시 보내고 REST로 다시 맞춘다', async () => {
    await startAndOpen();
    last().serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    last().serverClose();
    await vi.advanceTimersByTimeAsync(2_000);
    last().serverOpen();
    last().serverSend(heartbeat());
    await flush();

    expect(client.getStatus()).toBe('online');
    expect(last().sent).toEqual([{ type: 'subscribe', topics: ['plant', 'devices', 'alarms', 'process'] }]);
    expect(sink.resync).toHaveBeenCalledTimes(2);

    last().serverClose();
    await vi.advanceTimersByTimeAsync(1_000); // 다시 1초부터 (2초가 아니다)
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it('끊긴 소켓이 늦게 보내는 이벤트는 무시한다', async () => {
    await startAndOpen();
    const old = last();
    old.serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    last().serverOpen();
    last().serverSend(heartbeat());
    await flush();

    old.serverSend({ type: 'command.result', commandId: 'late', status: 'completed', reason: null });
    old.serverClose();
    expect(sink.onCommandResult).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe('online');
  });

  it('REST 재동기화가 실패하면 몇 번 다시 시도한다', async () => {
    setup(vi.fn().mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined));
    await startAndOpen();
    expect(sink.resync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sink.resync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(sink.resync).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sink.resync).toHaveBeenCalledTimes(3);
  });
});

describe('관절 값 구독', () => {
  it('로봇 화면에 들어가면 구독하고 나가면 해제한다', async () => {
    await startAndOpen();
    last().sent.length = 0;

    client.setJointsWanted(true);
    expect(last().sent).toEqual([{ type: 'subscribe', topics: ['robot-1.joints'] }]);
    client.setJointsWanted(true); // 같은 값이면 다시 보내지 않는다
    expect(last().sent).toHaveLength(1);

    client.setJointsWanted(false);
    expect(last().sent[1]).toEqual({ type: 'unsubscribe', topics: ['robot-1.joints'] });
  });

  it('연결되기 전에 정한 구독도 연결되면 함께 보낸다', async () => {
    client.setJointsWanted(true);
    await startAndOpen();
    expect(last().sent).toEqual([{ type: 'subscribe', topics: ['plant', 'devices', 'alarms', 'process', 'robot-1.joints'] }]);
  });

  it('재연결하면 관절 구독도 다시 보낸다', async () => {
    client.setJointsWanted(true);
    await startAndOpen();
    last().serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    last().serverOpen();
    await flush();
    expect(last().sent[0]!.topics).toContain('robot-1.joints');
  });

  it('앱이 숨으면 관절 구독을 해제하고, 돌아오면 다시 구독하고 REST로 맞춘다', async () => {
    client.setJointsWanted(true);
    await startAndOpen();
    last().sent.length = 0;
    expect(sink.resync).toHaveBeenCalledTimes(1);

    client.setVisible(false);
    expect(last().sent).toEqual([{ type: 'unsubscribe', topics: ['robot-1.joints'] }]);

    client.setVisible(true);
    expect(last().sent[1]).toEqual({ type: 'subscribe', topics: ['robot-1.joints'] });
    expect(sink.resync).toHaveBeenCalledTimes(2);
  });

  it('끊겨 있는 동안에는 마지막 관절 자세를 남겨 두고, 새 연결의 첫 메시지에서 비워 서버가 다시 시작해도 seq가 처음부터 받아들여진다', async () => {
    client.setJointsWanted(true);
    await startAndOpen();
    const send = (seq: number, ts: string) =>
      last().serverSend({
        type: 'robot.joints',
        deviceId: 'robot-1',
        seq,
        ts,
        joints: [seq],
        gripper: { closed: false, holding: false },
        phase: 'idle',
        targetTankId: null,
      });
    send(900, '2026-10-13T05:00:00.000Z');
    expect(client.jointBuffer.sample(Date.now())!.joints).toEqual([900]);

    last().serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    last().serverOpen();
    await flush();
    // 다시 연결을 시도하는 동안에도 마지막 자세는 그대로 있다 (로봇팔이 그 자세로 멈춰 있다)
    expect(client.getStatus()).toBe('offline');
    expect(client.jointBuffer.sample(Date.now())!.joints).toEqual([900]);
    send(1, '2026-10-13T05:00:10.000Z');
    expect(client.jointBuffer.sample(Date.now())!.joints).toEqual([1]);
  });
});

describe('stop', () => {
  it('소켓을 닫고 더는 재연결하지 않는다', async () => {
    await startAndOpen();
    const socket = last();
    client.stop();
    expect(socket.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(getTicket).toHaveBeenCalledTimes(1);
  });

  it('재연결을 기다리는 중에 stop해도 다시 연결하지 않는다', async () => {
    await startAndOpen();
    last().serverClose();
    client.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
