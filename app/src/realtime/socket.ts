import type { ClientMessage, ServerMessage } from '@ecocycle/shared';
import {
  DISCONNECT_CHECK_INTERVAL_MS,
  DISCONNECT_TIMEOUT_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from '../config/realtime';
import { WS_BASE } from '../config/env';
import { createDispatcher } from './dispatch';
import { createJointBuffer } from './jointBuffer';
import type { JointBuffer } from './jointBuffer';
import { BASE_TOPICS, ROBOT_JOINTS_TOPIC, createSubscriptions } from './subscriptions';
import type { ConnectionStatus, RealtimeSink } from './types';
import { createWatchdog } from './watchdog';

/** 브라우저 WebSocket 중 우리가 쓰는 부분만. 테스트에서 가짜로 바꿔 끼운다. */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
  send(data: string): void;
  close(): void;
}

const OPEN = 1;
const RESYNC_ATTEMPTS = 3;
const RESYNC_RETRY_MS = 2_000;

export interface RealtimeClientOptions {
  sink: RealtimeSink;
  /** 1회용 티켓을 받는다 (api의 getWsTicket). 연결할 때마다 새로 받는다. */
  getTicket: () => Promise<{ ticket: string }>;
  wsBase?: string;
  createSocket?: (url: string) => SocketLike;
  now?: () => number;
}

export interface RealtimeClient {
  /** 연결을 시작한다 (로그인 후 한 번). 끊기면 스스로 다시 연결한다. */
  start(): void;
  /** 연결을 닫고 모든 타이머를 멈춘다 (로그아웃). */
  stop(): void;
  /** 로봇 관절 값이 필요한 화면(홈, 로봇 확대)에 들어가고 나갈 때 */
  setJointsWanted(wanted: boolean): void;
  /** 앱이 화면에 보이는지(visibilitychange, Capacitor 앱 상태). 숨으면 관절 구독을 끊고, 돌아오면 다시 구독하고 REST로 맞춘다. */
  setVisible(visible: boolean): void;
  readonly jointBuffer: JointBuffer;
  getStatus(): ConnectionStatus;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRealtimeClient(options: RealtimeClientOptions): RealtimeClient {
  const { sink, getTicket } = options;
  const wsBase = options.wsBase ?? WS_BASE;
  const now = options.now ?? Date.now;
  const createSocket =
    options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);

  const jointBuffer = createJointBuffer();
  const dispatcher = createDispatcher({ sink, jointBuffer });
  const subscriptions = createSubscriptions();
  const watchdog = createWatchdog({
    timeoutMs: DISCONNECT_TIMEOUT_MS,
    checkIntervalMs: DISCONNECT_CHECK_INTERVAL_MS,
    now,
    // 15초 동안 아무것도 못 받았다: 연결이 죽은 것으로 보고 끊김을 표시한 뒤 새로 연결한다
    onTimeout: () => handleLost(),
  });

  let running = false;
  let socket: SocketLike | null = null;
  /** 연결 시도마다 올려서, 이미 버린 소켓의 늦은 이벤트를 무시한다 */
  let generation = 0;
  let status: ConnectionStatus = 'offline';
  let lastReceivedMs: number | null = null;
  let everOnline = false;
  let backoffMs = RECONNECT_BASE_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let jointsWanted = false;
  let visible = true;

  const setStatus = (next: ConnectionStatus) => {
    if (next === status) return;
    status = next;
    sink.onConnection({
      status,
      lastReceivedAt: lastReceivedMs === null ? null : new Date(lastReceivedMs).toISOString(),
    });
  };

  const send = (message: ClientMessage) => {
    if (socket && socket.readyState === OPEN) socket.send(JSON.stringify(message));
  };

  const desiredTopics = () => (jointsWanted && visible ? [...BASE_TOPICS, ROBOT_JOINTS_TOPIC] : [...BASE_TOPICS]);

  /** 원하는 주제와 서버에 보낸 주제의 차이만 보낸다 */
  const syncSubscriptions = () => {
    if (!socket || socket.readyState !== OPEN) return;
    subscriptions.setDesired(desiredTopics());
    const { subscribe, unsubscribe } = subscriptions.pending();
    if (unsubscribe.length > 0) send({ type: 'unsubscribe', topics: unsubscribe });
    if (subscribe.length > 0) send({ type: 'subscribe', topics: subscribe });
    subscriptions.markSent();
  };

  const runResync = async (gen: number) => {
    for (let attempt = 1; attempt <= RESYNC_ATTEMPTS; attempt += 1) {
      try {
        await sink.resync();
        return;
      } catch {
        if (attempt === RESYNC_ATTEMPTS) return;
        await sleep(RESYNC_RETRY_MS * attempt);
        if (gen !== generation || !running) return;
      }
    }
  };

  const scheduleReconnect = () => {
    if (!running) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
  };

  /** 연결이 끊겼다(소켓 종료, 오류, 15초 무수신). 끊김을 바로 알리고 다시 연결한다. */
  function handleLost() {
    generation += 1;
    watchdog.stop();
    const old = socket;
    socket = null;
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try {
        old.close();
      } catch {
        // 이미 닫힌 소켓
      }
    }
    dispatcher.flush();
    subscriptions.reset();
    setStatus('offline');
    scheduleReconnect();
  }

  async function connect() {
    if (!running) return;
    generation += 1;
    const gen = generation;
    if (!everOnline) setStatus('connecting');

    let ticket: string;
    try {
      ticket = (await getTicket()).ticket;
    } catch {
      if (gen === generation && running) {
        setStatus('offline');
        scheduleReconnect();
      }
      return;
    }
    if (gen !== generation || !running) return;

    const ws = createSocket(`${wsBase}?ticket=${encodeURIComponent(ticket)}`);
    socket = ws;

    ws.onopen = () => {
      if (gen !== generation) return;
      everOnline = true;
      backoffMs = RECONNECT_BASE_MS;
      lastReceivedMs = now();
      // 서버가 다시 시작하면 seq가 처음으로 돌아가므로 새 연결마다 버퍼를 비운다
      jointBuffer.clear();
      subscriptions.reset();
      syncSubscriptions();
      watchdog.start();
      setStatus('online');
      void runResync(gen);
    };

    ws.onmessage = (event) => {
      if (gen !== generation) return;
      const at = now();
      lastReceivedMs = at;
      watchdog.touch();
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      if (typeof message !== 'object' || message === null || typeof message.type !== 'string') return;
      dispatcher.handle(message, at);
    };

    ws.onclose = () => {
      if (gen !== generation) return;
      handleLost();
    };

    // 오류 뒤에는 항상 close가 오므로 거기서 처리한다
    ws.onerror = () => undefined;
  }

  return {
    jointBuffer,
    getStatus: () => status,

    start() {
      if (running) return;
      running = true;
      backoffMs = RECONNECT_BASE_MS;
      void connect();
    },

    stop() {
      running = false;
      generation += 1;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      watchdog.stop();
      const old = socket;
      socket = null;
      if (old) {
        old.onopen = old.onmessage = old.onclose = old.onerror = null;
        old.close();
      }
      dispatcher.dispose();
      jointBuffer.clear();
      subscriptions.reset();
      status = 'offline';
      everOnline = false;
      lastReceivedMs = null;
    },

    setJointsWanted(wanted) {
      if (jointsWanted === wanted) return;
      jointsWanted = wanted;
      // 구독을 끊으면 낡은 값이 남지 않게 비운다
      if (!wanted) jointBuffer.clear();
      syncSubscriptions();
    },

    setVisible(next) {
      if (visible === next) return;
      visible = next;
      if (!next) jointBuffer.clear();
      syncSubscriptions();
      // 돌아왔을 때 연결이 살아 있으면 그동안 놓친 값을 REST로 맞춘다
      if (next && status === 'online') void runResync(generation);
    },
  };
}
