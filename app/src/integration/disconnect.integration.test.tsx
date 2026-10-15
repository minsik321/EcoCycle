// 통합 테스트: 실제 모의 서버(disconnect 시나리오)에 앱 전체를 붙여 연결 끊김을 끝까지 확인한다.
//   실행: npm run test:integration  (서버는 scripts/integration.mjs가 띄운다)
//
// 시나리오(서버): 시작 35초 뒤 25초 동안 연결은 열어 둔 채 모든 메시지(heartbeat 포함)를 보내지 않는다.
// 홈은 맨 위 전환 "3D | 대시보드" 두 가지라 끊긴 동안 둘 다 본다.
// 확인할 것 (명세 "연결 끊김"):
//  1. 마지막 메시지 뒤 15초 안팎에 "연결 끊김"과 마지막 수신 시각을 표시한다.
//  2. 대시보드: 숫자는 "–", 상태는 "연결 끊김", 마지막 수신 시각을 함께 적고, 정상·주의 같은 마지막 값을 보여 주지 않는다.
//  3. 3D 홈: 무대(움직임)가 멈추고, "연결 끊김 · 모든 움직임을 멈췄습니다"와 마지막 수신 시각을 보여 주며, 조작할 수 없다.
//  4. 로봇팔 관절 값은 멈춘다 (마지막 자세를 유지하고 더 움직이지 않는다).
//  5. 끊긴 동안 보낸 명령은 WebSocket 결과를 못 받아도 GET /commands/{id} 조회로 결과를 알게 된다.
//  6. 서버가 침묵을 끝내면 끊김 표시가 사라지고, 무대가 다시 움직이며, REST로 현재 상태를 다시 받아 맞춘다.
//
// 테스트 환경(jsdom)에는 그래픽(WebGL)이 없어 3D 무대(Stage)만 가짜로 바꾸고, 무대에 넘기는 값(frozen)과 그 위의 화면을 본다
// (studio/studio.test.tsx와 같은 방법). 나머지(LiveStudio·패널·store·실시간 계층)는 실제 코드다.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { WebSocket as NodeWebSocket } from 'ws';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createAppStore, loginUser, sendDeviceCommand } from '../store';
import { acquireJoints, getJointBuffer, stopRealtime } from '../store/realtimeClient';
import type { StageProps } from '../studio/Stage';

// jsdom 환경에서는 Node 내장 WebSocket과 jsdom의 Event가 섞여 오류가 나므로 ws 패키지로 바꿔 쓴다
(globalThis as unknown as { WebSocket: unknown }).WebSocket = NodeWebSocket;

const stage = vi.hoisted(() => ({ last: null as StageProps | null }));

vi.mock('../studio/Stage', () => ({
  Stage: (props: StageProps) => {
    stage.last = props;
    // 실제 무대처럼 첫 장을 그렸다고 알린다 (준비 화면을 걷고 핀을 놓는다)
    const { onReady } = props;
    useEffect(() => onReady?.(), [onReady]);
    return <div data-testid="stage" />;
  },
}));

// jsdom에는 WebGL이 없다: 3D를 고를 수 있게 한다 (그리는 것은 위의 가짜 무대)
vi.mock('../features/home/sceneSupport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/home/sceneSupport')>()),
  supportsWebGL: () => true,
}));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const wait = <T,>(fn: () => T, timeout: number) => vi.waitFor(fn, { timeout, interval: 250 });

/** 3D 홈의 끊김 알림 (앱 틀의 끊김 안내와 구분: "모든 움직임을 멈췄습니다"가 있는 것) */
const studioAlert = () => screen.queryAllByRole('alert').find((el) => el.textContent?.includes('모든 움직임을 멈췄습니다')) ?? null;
/** 앱 틀의 끊김 안내 (대시보드 위) */
const shellAlert = () =>
  screen.queryAllByRole('alert').find((el) => el.textContent?.includes('마지막 수신') && !el.textContent.includes('모든 움직임을 멈췄습니다')) ?? null;

const KPI_NAMES = ['오늘 생산 베일', '평균 수분', '압축기 가동률'];

beforeAll(async () => {
  // 3D 조각(패널·장면)은 lazy다. 끊긴 시간(약 10초) 안에 3D로 바꿔 보므로 미리 한 번 받아 둔다
  await import('../studio');
  await import('../studio/StudioScene');
});

describe('연결 끊김 통합 점검 (disconnect 시나리오)', () => {
  it('끊김 표시 → 대시보드·3D 홈·조작·관절 값 정지 → 명령 결과 조회 → 복구 후 재동기화', async () => {
    localStorage.setItem('ecocycle.homeMode', 'dashboard');
    const store = createAppStore();
    await store.dispatch(loginUser({ id: 'operator', password: 'mock-operator' }));
    expect(store.getState().auth.status).toBe('loggedIn');
    expect(store.getState().ui.homeMode).toBe('dashboard');

    const releaseJoints = acquireJoints(); // 3D 홈처럼 관절 값을 구독하는 화면이 있다고 본다
    render(
      <Provider store={store}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </Provider>,
    );

    // ── 평소: 연결됨, 대시보드에 값이 채워지고, 끊김 안내는 없다 ──
    await wait(() => {
      expect(store.getState().connection.status).toBe('online');
      expect(Object.keys(store.getState().devices.byId)).toHaveLength(7);
      expect(store.getState().plant.summary).not.toBeNull();
    }, 20_000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '대시보드' })).toHaveAttribute('aria-selected', 'true');
    const sectors = screen.getByRole('region', { name: '섹터' });
    await wait(() => expect(within(sectors).getAllByText(/%$/).length).toBeGreaterThan(0), 10_000);
    expect(within(sectors).queryByText('연결 끊김')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '상태 요약' })).getByText('실시간')).toBeInTheDocument();
    await wait(() => expect(getJointBuffer()?.sample(Date.now())).not.toBeNull(), 10_000);

    // ── 1. 끊김 감지: 서버가 침묵하기 시작하면 15초 안팎에 표시한다 ──
    await wait(() => expect(shellAlert()).toHaveTextContent('연결 끊김'), 70_000);
    const detectedAt = Date.now();
    const { lastReceivedAt, status } = store.getState().connection;
    expect(status).toBe('offline');
    expect(lastReceivedAt).not.toBeNull();
    const silenceMs = detectedAt - Date.parse(lastReceivedAt!);
    console.log(`[통합] 마지막 수신 후 ${(silenceMs / 1000).toFixed(1)}초 만에 끊김 표시`);
    expect(silenceMs).toBeGreaterThanOrEqual(14_500);
    expect(silenceMs).toBeLessThanOrEqual(19_000);
    expect(shellAlert()!.querySelector('time')).toHaveAttribute('datetime', lastReceivedAt!);

    // ── 2. 대시보드: 숫자는 "–", "연결 끊김"과 마지막 수신 시각, 마지막 값을 정상처럼 보여 주지 않는다 ──
    const summary = screen.getByRole('region', { name: '상태 요약' });
    expect(within(summary).getAllByText('연결 끊김').length).toBeGreaterThan(0);
    expect(within(summary).getByText('마지막 수신')).toBeInTheDocument();
    expect(within(summary).getByRole('time')).toHaveAttribute('dateTime', lastReceivedAt!);
    for (const name of KPI_NAMES) {
      const card = screen.getByRole('region', { name });
      expect(within(card).getByText('–')).toBeInTheDocument();
      expect(within(card).getByText(/연결 끊김 · 마지막 수신/)).toBeInTheDocument();
    }
    const sectorsOff = screen.getByRole('region', { name: '섹터' });
    expect(within(sectorsOff).queryByText('정상')).not.toBeInTheDocument();
    expect(within(sectorsOff).queryByText('주의')).not.toBeInTheDocument();
    expect(within(sectorsOff).getAllByText('연결 끊김')).toHaveLength(4);
    expect(within(sectorsOff).queryByText(/\d%$/)).not.toBeInTheDocument();
    for (const meter of within(sectorsOff).getAllByRole('meter')) expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(within(screen.getByRole('region', { name: '공정 추적' })).queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument();

    // ── 3. 3D 홈: 무대가 멈추고, 끊김 알림과 마지막 수신 시각, 조작할 수 없다 ──
    await userEvent.click(screen.getByRole('tab', { name: '3D' }));
    await wait(() => expect(screen.getByTestId('stage')).toBeInTheDocument(), 10_000);
    expect(stage.last?.frozen).toBe(true);
    const alert3d = studioAlert();
    expect(alert3d).not.toBeNull();
    expect(within(alert3d!).getByText('연결 끊김')).toBeInTheDocument();
    expect(alert3d!.querySelector('time')).toHaveAttribute('datetime', lastReceivedAt!);
    expect(screen.getByLabelText('압축기 연결 끊김')).toBeInTheDocument();
    expect(screen.getByLabelText('섹터 A1 연결 끊김')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '공정 추적' })).queryByText('진행 중')).not.toBeInTheDocument();
    // 로봇팔을 골라도 시작·일시정지 같은 조작은 누를 수 없다
    await userEvent.click(screen.getByLabelText('로봇팔 연결 끊김'));
    const panel = screen.getByRole('complementary', { name: '로봇팔 상세' });
    const controls = within(panel).queryAllByRole('button', { name: /^(시작|일시정지|재개|정지)$/ });
    expect(controls.length).toBeGreaterThan(0);
    for (const button of controls) expect(button).toBeDisabled();

    // ── 4. 로봇팔 정지: 관절 값이 더 이상 움직이지 않는다 ──
    const before = getJointBuffer()!.sample(Date.now())!.joints;
    await sleep(1_500);
    const after = getJointBuffer()!.sample(Date.now())!.joints;
    expect(after).toEqual(before);
    expect(store.getState().connection.status).toBe('offline');
    expect(stage.last?.frozen).toBe(true);

    // ── 5. 끊긴 동안 보낸 명령: WebSocket 결과가 안 와도 조회로 결과를 알게 된다 ──
    const key = await store.dispatch(sendDeviceCommand({ deviceId: 'conveyor-z', command: { type: 'pause' } })).unwrap();
    await wait(() => expect(store.getState().commands.byKey[key]?.status).toBe('completed'), 20_000);
    expect(store.getState().commands.byKey[key]?.commandId).toMatch(/^cmd-/);

    // ── 6. 복구: 끊김 표시가 사라지고, 무대가 다시 움직이고, 현재 상태로 맞춰진다 ──
    const offlineLastReceived = lastReceivedAt!;
    await wait(() => expect(store.getState().connection.status).toBe('online'), 40_000);
    await wait(() => {
      expect(studioAlert()).toBeNull();
      expect(stage.last?.frozen).toBe(false);
    }, 5_000);
    expect(screen.queryByLabelText('압축기 연결 끊김')).not.toBeInTheDocument();
    // 복구 뒤의 마지막 수신 시각은 끊기기 전보다 나중이다
    expect(Date.parse(store.getState().connection.lastReceivedAt ?? '0')).toBeGreaterThan(Date.parse(offlineLastReceived));
    // 끊긴 동안 일어난 일(컨베이어 정지)이 반영되어 있다
    await wait(() => {
      const conveyor = store.getState().devices.byId['conveyor-z'];
      expect(conveyor?.type === 'conveyor' && conveyor.running).toBe(false);
    }, 10_000);
    // 관절 값이 다시 흐른다
    await wait(() => {
      const a = getJointBuffer()!.sample(Date.now())!.joints;
      return expect(a).not.toEqual(after);
    }, 20_000);

    // 대시보드로 돌아가면 값이 다시 보이고 끊김 표시가 없다
    await userEvent.click(screen.getByRole('tab', { name: '대시보드' }));
    await wait(() => {
      expect(shellAlert()).toBeNull();
      const back = screen.getByRole('region', { name: '섹터' });
      expect(within(back).queryByText('연결 끊김')).not.toBeInTheDocument();
      expect(within(back).getAllByText(/^\d+(\.\d+)?%$/)).toHaveLength(4); // 적재율 4칸 (수분 줄은 "수분 …%")
      expect(within(screen.getByRole('region', { name: '상태 요약' })).getByText('실시간')).toBeInTheDocument();
      for (const name of KPI_NAMES) expect(within(screen.getByRole('region', { name })).queryByText('–')).not.toBeInTheDocument();
    }, 10_000);
    console.log(`[통합] 복구 확인 (끊기기 전 마지막 수신 ${offlineLastReceived})`);

    releaseJoints();
    act(() => stopRealtime());
  });
});
