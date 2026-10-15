import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { DeviceState, Me } from '@ecocycle/shared';
import { connectionChanged, createAppStore, devicesReceived, loginUser, restoreUserSession } from '../store';

export const OPERATOR: Me = { id: 'operator', name: '작업자', role: 'operator', permissions: ['robot.control', 'alarm.ack'] };
export const ADMIN: Me = {
  id: 'admin',
  name: '관리자',
  role: 'admin',
  permissions: ['batch.control', 'robot.control', 'robot.manual', 'settings.write', 'alarm.ack'],
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
  grade: 'A',
  status: 'normal',
  fillPercent: 72.4,
  volumeM3: 5.8,
  capacityM3: 8,
  moisturePercent: 11.8,
  cautionThresholdPercent: 80,
  updatedAt: NOW,
});

export interface StoreOptions {
  /** Me: 로그인됨, null: 로그아웃 상태, 'unknown': 저장된 세션을 확인하는 중(앱 시작 직후) */
  me?: Me | null | 'unknown';
  connection?: 'online' | 'offline' | 'connecting';
  lastReceivedAt?: string | null;
  devices?: DeviceState[];
  /** 화면의 현재 주소 (기본 /) */
  route?: string;
}

/** 로그인·연결·기기 상태가 정해진 store를 만든다 (서버 호출 없이 액션으로 바로 채운다) */
export function makeStore({ me = OPERATOR, connection = 'online', lastReceivedAt = NOW, devices = [] }: StoreOptions = {}) {
  const store = createAppStore();
  if (me === null) store.dispatch(restoreUserSession.fulfilled({ kind: 'none' }, 'test'));
  else if (me !== 'unknown') store.dispatch(loginUser.fulfilled(me, 'test', { id: me.id, password: '' }));
  store.dispatch(connectionChanged({ status: connection, lastReceivedAt }));
  if (devices.length > 0) store.dispatch(devicesReceived(devices));
  return store;
}

export function renderWithStore(ui: ReactElement, options: StoreOptions = {}) {
  const store = makeStore(options);
  const utils = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
    </Provider>,
  );
  return { store, ...utils };
}
