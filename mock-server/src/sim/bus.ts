import { EventEmitter } from 'node:events';
import type { ServerMessage } from '@ecocycle/shared';

// 시뮬레이터(sim/)와 WebSocket(stream.ts)을 느슨하게 잇는 메시지 통로.
// sim은 publish만 하고, stream은 구독해서 연결된 클라이언트에게 나눠 보낸다.
const emitter = new EventEmitter();

export const publish = (message: ServerMessage): void => {
  emitter.emit('message', message);
};

export const onMessage = (handler: (message: ServerMessage) => void): void => {
  emitter.on('message', handler);
};
