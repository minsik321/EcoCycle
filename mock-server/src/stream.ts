import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, Topic } from '@ecocycle/shared';
import { consumeWsTicket } from './auth';
import type { Account } from './fixtures/accounts';
import { streamGate } from './scenarios/gate';
import { onMessage } from './sim/bus';
import { processState } from './sim/process';
import { listDevices, summarize } from './sim/state';

const STREAM_PATH = '/ws/v1/stream';
const HEARTBEAT_MS = 5000;
const TOPICS: readonly string[] = ['plant', 'devices', 'alarms', 'process', 'robot-1.joints'];

interface Client {
  ws: WebSocket;
  account: Account;
  topics: Set<Topic>;
  /** 지연 시나리오에서 순서를 지키기 위한 마지막 전달 예정 시각 */
  lastDeliverAt: number;
}

const clients = new Set<Client>();

/** 메시지가 속한 주제. null이면 구독과 무관하게 모든 연결에 보낸다. */
function topicOf(message: ServerMessage): Topic | null {
  switch (message.type) {
    case 'plant.summary':
      return 'plant';
    case 'device.state':
      return 'devices';
    case 'alarm':
      return 'alarms';
    case 'robot.joints':
      return `${message.deviceId}.joints`;
    case 'process.vehicle':
    case 'process.batch':
    case 'process.bale':
      return 'process';
    case 'command.result':
    case 'heartbeat':
      return null;
  }
}

function send(client: Client, message: ServerMessage): void {
  // disconnect 시나리오: 연결은 열려 있지만 아무것도 보내지 않는다
  if (streamGate.muted) return;
  const text = JSON.stringify(message);
  const deliver = () => {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(text);
  };
  if (streamGate.latencyMs <= 0) return deliver();
  // slow-network 시나리오: 지연을 주되 보낸 순서는 유지한다
  const at = Math.max(Date.now() + streamGate.latencyMs + Math.random() * streamGate.jitterMs, client.lastDeliverAt + 1);
  client.lastDeliverAt = at;
  setTimeout(deliver, at - Date.now());
}

/** 구독한 연결에만 보낸다. `robot.joints`는 구독한 연결에만 간다. */
export function broadcast(message: ServerMessage): void {
  const topic = topicOf(message);
  for (const client of clients) {
    if (topic === null || client.topics.has(topic)) send(client, message);
  }
}

function isTopic(value: unknown): value is Topic {
  return typeof value === 'string' && TOPICS.includes(value);
}

function parseClientMessage(raw: string): ClientMessage | undefined {
  try {
    const data = JSON.parse(raw) as { type?: unknown; topics?: unknown };
    if ((data.type !== 'subscribe' && data.type !== 'unsubscribe') || !Array.isArray(data.topics)) return undefined;
    return { type: data.type, topics: data.topics.filter(isTopic) };
  } catch {
    return undefined;
  }
}

/** 구독 직후 현재 값을 한 번 보내 준다 (처음 화면을 바로 채우기 위해) */
function sendSnapshot(client: Client, topic: Topic): void {
  if (topic === 'plant') send(client, { type: 'plant.summary', summary: summarize() });
  if (topic === 'devices') {
    for (const state of listDevices()) send(client, { type: 'device.state', state: structuredClone(state) });
  }
  if (topic === 'process') {
    const state = processState();
    for (const vehicle of state.vehicles) send(client, { type: 'process.vehicle', vehicle });
    for (const batch of state.batches) send(client, { type: 'process.batch', batch });
    for (const bale of state.bales) send(client, { type: 'process.bale', bale });
  }
}

export function attachStream(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  // 연결 전에 티켓을 확인한다. 1회용이라 쓰고 나면 다시 못 쓴다.
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const account = url.pathname === STREAM_PATH ? consumeWsTicket(url.searchParams.get('ticket') ?? '') : undefined;
    if (!account) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { ws, account, topics: new Set(), lastDeliverAt: 0 };
      clients.add(client);

      ws.on('message', (data) => {
        const message = parseClientMessage(data.toString());
        if (!message) return;
        for (const topic of message.topics) {
          if (message.type === 'subscribe') {
            if (!client.topics.has(topic)) {
              client.topics.add(topic);
              sendSnapshot(client, topic);
            }
          } else {
            client.topics.delete(topic);
          }
        }
      });
      ws.on('close', () => clients.delete(client));
      ws.on('error', () => clients.delete(client));
    });
  });

  onMessage(broadcast);

  // 연결 상태 확인용: 5초마다 서버 시각
  setInterval(() => broadcast({ type: 'heartbeat', ts: new Date().toISOString() }), HEARTBEAT_MS);
}
