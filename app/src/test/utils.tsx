import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import type { DeviceState, Me } from '@ecocycle/shared';
import { connectionChanged, createAppStore, devicesReceived, loginUser } from '../store';

export const OPERATOR: Me = { id: 'operator', name: '작업자', role: 'operator', permissions: ['robot.control', 'alarm.ack'] };
export const ADMIN: Me = {
  id: 'admin',
  name: '관리자',
  role: 'admin',
  permissions: ['robot.control', 'robot.manual', 'settings.write', 'alarm.ack'],
};
export const VIEWER: Me = { id: 'viewer', name: '열람자', role: 'viewer', permissions: [] };

export const NOW = '2026-10-13T05:00:00.000Z';

export const robotState = (over: Partial<Extract<DeviceState, { type: 'robot' }>> = {}): DeviceState => ({
  id: 'robot-1',
  type: 'robot',
  status: 'running',
  mode: 'auto',
  phase: 'idle',
  targetTankId: null,
  gripper: { closed: false, holding: false },
  updatedAt: NOW,
  ...over,
});

export const conveyorState = (): DeviceState => ({
  id: 'conveyor-z',
  type: 'conveyor',
  status: 'normal',
  running: true,
  loadPercent: 40,
  updatedAt: NOW,
});

export const tankState = (): DeviceState => ({
  id: 'tank-a1',
  type: 'tank',
  section: 'A1',
  status: 'normal',
  fillPercent: 72.4,
  volumeM3: 5.8,
  capacityM3: 8,
  moisturePercent: 11.8,
  updatedAt: NOW,
});

export interface StoreOptions {
  me?: Me | null;
  connection?: 'online' | 'offline' | 'connecting';
  lastReceivedAt?: string | null;
  devices?: DeviceState[];
}

/** 로그인·연결·기기 상태가 정해진 store를 만든다 (서버 호출 없이 액션으로 바로 채운다) */
export function makeStore({ me = OPERATOR, connection = 'online', lastReceivedAt = NOW, devices = [] }: StoreOptions = {}) {
  const store = createAppStore();
  if (me) store.dispatch(loginUser.fulfilled(me, 'test', { id: me.id, password: '' }));
  store.dispatch(connectionChanged({ status: connection, lastReceivedAt }));
  if (devices.length > 0) store.dispatch(devicesReceived(devices));
  return store;
}

export function renderWithStore(ui: ReactElement, options: StoreOptions = {}) {
  const store = makeStore(options);
  const utils = render(<Provider store={store}>{ui}</Provider>);
  return { store, ...utils };
}
