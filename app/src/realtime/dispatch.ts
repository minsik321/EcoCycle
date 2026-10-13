import type { DeviceState, PlantSummary, ServerMessage } from '@ecocycle/shared';
import { STORE_BATCH_MS } from '../config/realtime';
import type { JointBuffer } from './jointBuffer';
import type { RealtimeSink } from './types';

export interface Dispatcher {
  /** 메시지 하나를 type별로 나눠 보낸다. heartbeat는 받았다는 사실(감시 갱신)만으로 충분해 여기서는 할 일이 없다. */
  handle(message: ServerMessage, receivedAtMs: number): void;
  /** 모아 둔 값을 바로 보낸다 (연결이 끊길 때) */
  flush(): void;
  /** 예약된 반영을 취소한다 */
  dispose(): void;
}

export interface DispatcherOptions {
  sink: RealtimeSink;
  jointBuffer: JointBuffer;
  batchMs?: number;
}

/**
 * 저빈도 값은 sink(store)로, 고빈도 robot.joints는 jointBuffer로 보낸다.
 * plant.summary와 device.state는 batchMs 동안 모아서 한 번에 보낸다 (같은 기기는 마지막 값만).
 * alarm, command.result, process.*는 드물고 바로 보여야 해서 모으지 않는다.
 */
export function createDispatcher({ sink, jointBuffer, batchMs = STORE_BATCH_MS }: DispatcherOptions): Dispatcher {
  const devices = new Map<string, DeviceState>();
  let summary: PlantSummary | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (summary) {
      const s = summary;
      summary = null;
      sink.onPlantSummary(s);
    }
    if (devices.size > 0) {
      const states = [...devices.values()];
      devices.clear();
      sink.onDeviceStates(states);
    }
  };

  const schedule = () => {
    timer ??= setTimeout(flush, batchMs);
  };

  return {
    handle(message, receivedAtMs) {
      switch (message.type) {
        case 'robot.joints':
          jointBuffer.push(message, receivedAtMs);
          return;
        case 'device.state':
          devices.set(message.state.id, message.state);
          schedule();
          return;
        case 'plant.summary':
          summary = message.summary;
          schedule();
          return;
        case 'alarm':
          sink.onAlarm(message.alarm);
          return;
        case 'command.result':
          sink.onCommandResult({
            commandId: message.commandId,
            status: message.status,
            reason: message.reason,
          });
          return;
        case 'process.vehicle':
          sink.onVehicle(message.vehicle);
          return;
        case 'process.batch':
          sink.onBatch(message.batch);
          return;
        case 'process.bale':
          sink.onBale(message.bale);
          return;
        case 'heartbeat':
          return;
      }
    },
    flush,
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      devices.clear();
      summary = null;
    },
  };
}
