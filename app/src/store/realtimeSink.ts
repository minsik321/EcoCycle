import { getAlarms, getDevices, getPlantSummary } from '../api';
import type { RealtimeSink } from '../realtime';
import type { AppDispatch } from './index';
import { alarmReceived, alarmsReplaced } from './slices/alarms';
import { commandResultReceived } from './slices/commands';
import { connectionChanged } from './slices/connection';
import { devicesReceived } from './slices/devices';
import { plantReceived } from './slices/plant';

/**
 * realtime이 내보내는 값을 store에 넣는 연결부. realtime은 store를 모르고, 여기서 둘을 잇는다.
 * resync는 연결(재연결 포함)될 때마다 REST로 요약·기기 상태·열린 알람을 한 번 다시 받아 맞춘다.
 */
export function createStoreSink(dispatch: AppDispatch): RealtimeSink {
  return {
    onConnection: (state) => dispatch(connectionChanged(state)),
    onPlantSummary: (summary) => dispatch(plantReceived(summary)),
    onDeviceStates: (states) => dispatch(devicesReceived(states)),
    onAlarm: (alarm) => dispatch(alarmReceived(alarm)),
    onCommandResult: (result) => dispatch(commandResultReceived(result)),
    async resync() {
      // 확인 처리(acknowledged)된 알람도 아직 열려 있으므로 함께 받는다
      const [summary, devices, active, acknowledged] = await Promise.all([
        getPlantSummary(),
        getDevices(),
        getAlarms({ state: 'active' }),
        getAlarms({ state: 'acknowledged' }),
      ]);
      dispatch(plantReceived(summary));
      dispatch(devicesReceived(devices));
      dispatch(alarmsReplaced([...active, ...acknowledged]));
    },
  };
}
