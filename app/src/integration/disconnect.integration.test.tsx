// 통합 테스트: 실제 모의 서버(disconnect 시나리오)에 앱 전체를 붙여 연결 끊김을 끝까지 확인한다.
//   실행: npm run test:integration  (서버는 scripts/integration.mjs가 띄운다)
//
// 시나리오(서버): 시작 35초 뒤 25초 동안 연결은 열어 둔 채 모든 메시지(heartbeat 포함)를 보내지 않는다.
// 확인할 것 (명세 "연결 끊김"):
//  1. 마지막 메시지 뒤 15초 안팎에 "연결 끊김"과 마지막 수신 시각을 표시한다.
//  2. 끊긴 동안 모든 기기 상태가 "연결 끊김"이고, 마지막 값을 정상처럼 보여 주지 않으며, 조작할 수 없다.
//  3. 로봇팔 관절 값은 멈춘다 (마지막 자세를 유지하고 더 움직이지 않는다).
//  4. 끊긴 동안 보낸 명령은 WebSocket 결과를 못 받아도 GET /commands/{id} 조회로 결과를 알게 된다.
//  5. 서버가 침묵을 끝내면 끊김 표시가 사라지고, REST로 현재 상태를 다시 받아 맞춘다.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { WebSocket as NodeWebSocket } from 'ws';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createAppStore, loginUser, sendDeviceCommand } from '../store';
import { acquireJoints, getJointBuffer, stopRealtime } from '../store/realtimeClient';

// jsdom 환경에서는 Node 내장 WebSocket과 jsdom의 Event가 섞여 오류가 나므로 ws 패키지로 바꿔 쓴다
(globalThis as unknown as { WebSocket: unknown }).WebSocket = NodeWebSocket;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const wait = <T,>(fn: () => T, timeout: number) => vi.waitFor(fn, { timeout, interval: 250 });

describe('연결 끊김 통합 점검 (disconnect 시나리오)', () => {
  it('끊김 표시 → 화면·조작·관절 값 정지 → 명령 결과 조회 → 복구 후 재동기화', async () => {
    const store = createAppStore();
    await store.dispatch(loginUser({ id: 'operator', password: 'mock-operator' }));
    expect(store.getState().auth.status).toBe('loggedIn');

    const releaseJoints = acquireJoints(); // 3D 홈처럼 관절 값을 구독하는 화면이 있다고 본다
    render(
      <Provider store={store}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </Provider>,
    );

    // ── 평소: 연결됨, 값이 채워지고, 끊김 안내는 없다 ──
    await wait(() => {
      expect(store.getState().connection.status).toBe('online');
      expect(Object.keys(store.getState().devices.byId)).toHaveLength(7);
    }, 20_000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const grid = screen.getByLabelText('기기 상태');
    expect(within(grid).getAllByText('정상').length).toBeGreaterThan(0);
    expect(within(grid).queryByText('연결 끊김')).not.toBeInTheDocument();
    await wait(() => expect(getJointBuffer()?.sample(Date.now())).not.toBeNull(), 10_000);

    // ── 1. 끊김 감지: 서버가 침묵하기 시작하면 15초 안팎에 표시한다 ──
    await wait(() => expect(screen.getByRole('alert')).toHaveTextContent('연결 끊김'), 70_000);
    const detectedAt = Date.now();
    const { lastReceivedAt, status } = store.getState().connection;
    expect(status).toBe('offline');
    expect(lastReceivedAt).not.toBeNull();
    const silenceMs = detectedAt - Date.parse(lastReceivedAt!);
    console.log(`[통합] 마지막 수신 후 ${(silenceMs / 1000).toFixed(1)}초 만에 끊김 표시`);
    expect(silenceMs).toBeGreaterThanOrEqual(14_500);
    expect(silenceMs).toBeLessThanOrEqual(19_000);
    expect(screen.getByRole('alert')).toHaveTextContent('마지막 수신');
    expect(screen.getByRole('alert').querySelector('time')).toHaveAttribute('datetime', lastReceivedAt!);

    // ── 2. 끊긴 동안의 화면: 정상·주의·작동 중 같은 마지막 값 표시가 없고 모두 "연결 끊김" ──
    const gridNow = screen.getByLabelText('기기 상태');
    expect(within(gridNow).queryByText('정상')).not.toBeInTheDocument();
    expect(within(gridNow).queryByText('주의')).not.toBeInTheDocument();
    expect(within(gridNow).queryByText('작동 중')).not.toBeInTheDocument();
    expect(within(gridNow).getAllByText('연결 끊김')).toHaveLength(7);
    expect(within(screen.getByLabelText('시스템 상태')).getByText('연결 끊김')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '작업 단계' })).toHaveAttribute('data-tone', 'offline');
    expect(within(screen.getByLabelText('함수율')).getByText('마지막 값')).toBeInTheDocument();

    // 조작할 수 없다
    await userEvent.click(within(gridNow).getByRole('button', { name: /^로봇팔/ }));
    const panel = screen.getByLabelText('로봇팔 확대 화면');
    for (const name of ['시작', '일시정지', '재개', '정지']) {
      expect(within(panel).getByRole('button', { name })).toBeDisabled();
    }
    expect(within(panel).getByRole('note')).toHaveTextContent('연결 끊김');

    // ── 3. 로봇팔 정지: 관절 값이 더 이상 움직이지 않는다 ──
    const before = getJointBuffer()!.sample(Date.now())!.joints;
    await sleep(1_500);
    const after = getJointBuffer()!.sample(Date.now())!.joints;
    expect(after).toEqual(before);
    expect(store.getState().connection.status).toBe('offline');

    // ── 4. 끊긴 동안 보낸 명령: WebSocket 결과가 안 와도 조회로 결과를 알게 된다 ──
    const key = await store.dispatch(sendDeviceCommand({ deviceId: 'conveyor-z', command: { type: 'pause' } })).unwrap();
    await wait(() => expect(store.getState().commands.byKey[key]?.status).toBe('completed'), 20_000);
    expect(store.getState().commands.byKey[key]?.commandId).toMatch(/^cmd-/);

    // ── 5. 복구: 서버가 침묵을 끝내면 끊김 표시가 사라지고 현재 상태로 맞춰진다 ──
    const offlineLastReceived = lastReceivedAt!;
    await wait(() => expect(store.getState().connection.status).toBe('online'), 40_000);
    await wait(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument(), 5_000);
    // 복구 뒤의 마지막 수신 시각은 끊기기 전보다 나중이다
    expect(Date.parse(store.getState().connection.lastReceivedAt ?? '0')).toBeGreaterThan(Date.parse(offlineLastReceived));
    const gridBack = screen.getByLabelText('기기 상태');
    await wait(() => {
      expect(within(gridBack).queryByText('연결 끊김')).not.toBeInTheDocument();
      expect(within(gridBack).getAllByText('정상').length).toBeGreaterThan(0);
    }, 10_000);
    // 끊긴 동안 일어난 일(컨베이어 정지)이 반영되어 있다
    await wait(() => expect(within(gridBack).getByRole('button', { name: /^컨베이어/ })).toHaveTextContent('정지'), 10_000);
    // 관절 값이 다시 흐른다
    await wait(() => {
      const a = getJointBuffer()!.sample(Date.now())!.joints;
      return expect(a).not.toEqual(after);
    }, 20_000);
    console.log(`[통합] 복구 확인 (끊기기 전 마지막 수신 ${offlineLastReceived})`);

    releaseJoints();
    act(() => stopRealtime());
  });
});
