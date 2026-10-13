import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MutableRefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceState } from '@ecocycle/shared';
import type { HomeSceneProps } from '../../scene/HomeScene';
import type { PinElements } from '../../scene/pins/PinProjector';
import { demoSource, fixedSource } from '../../scene/robot/jointSource';
import { cctvToggled, connectionChanged, homeViewChanged } from '../../store';
import { NOW, conveyorState, renderWithStore, robotState, tankState } from '../../test/utils';
import { HomePage } from './HomePage';
import { ScenePins } from './ScenePins';
import { SceneView } from './SceneView';
import * as support from './sceneSupport';

// 핀은 장면이 위치를 써 넣기 전까지 숨겨져 있어(visibility: hidden) 이름표(aria-label)로 찾는다.
// 테스트 환경에는 그래픽(WebGL)이 없으므로 장면 자체는 가짜로 바꾸고, 장면에 무엇을 넘기는지와 그 위의 HTML(핀·안내)을 본다.
const sceneProps = vi.hoisted(() => ({ last: null as HomeSceneProps | null, fail: false }));

vi.mock('../../scene/HomeScene', () => ({
  HomeScene: (props: HomeSceneProps) => {
    if (sceneProps.fail) throw new Error('그래픽 오류');
    sceneProps.last = props;
    return <div data-testid="scene" />;
  },
}));

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getRobotModel: vi.fn(() => new Promise(() => {})),
}));

const devices: Partial<Record<DeviceState['id'], DeviceState>> = {
  'tank-a1': tankState(),
  'robot-1': robotState({ phase: 'move' }),
  'conveyor-z': conveyorState(),
};

const pinsRef = () => ({ current: {} }) as MutableRefObject<PinElements>;

beforeEach(() => {
  sceneProps.last = null;
  sceneProps.fail = false;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ScenePins: 장면 위 HTML 핀', () => {
  it('기기 7개의 핀을 만들고 상태를 글자·기호로 함께 알려 준다', () => {
    render(<ScenePins pins={pinsRef()} devices={devices} selectedId={null} disconnected={false} onSelect={() => {}} />);
    expect(screen.getAllByRole('button', { hidden: true })).toHaveLength(7);
    expect(screen.getByLabelText('탱크 A1 72.4%, 정상')).toBeInTheDocument();
    expect(screen.getByLabelText('로봇팔 이동, 작동 중')).toBeInTheDocument();
    // 아직 값을 못 받은 기기는 값을 지어내지 않는다
    expect(screen.getByLabelText('압축기 불러오는 중')).toBeInTheDocument();
  });

  it('연결이 끊기면 모든 핀이 "연결 끊김"이 되고 마지막 값을 보여 주지 않는다', () => {
    render(<ScenePins pins={pinsRef()} devices={devices} selectedId={null} disconnected onSelect={() => {}} />);
    expect(screen.getByLabelText('탱크 A1 연결 끊김')).toBeInTheDocument();
    expect(screen.queryByText('72.4%')).not.toBeInTheDocument();
  });

  it('핀을 누르면 그 기기를 고르고, 고른 핀을 다시 누르면 전체 보기로 돌아간다', () => {
    const onSelect = vi.fn();
    const pins = pinsRef();
    const { rerender } = render(<ScenePins pins={pins} devices={devices} selectedId={null} disconnected={false} onSelect={onSelect} />);
    // 장면이 위치를 써 넣을 수 있게 요소를 넘겨 준다
    expect(pins.current['tank-a1']).toBeInstanceOf(HTMLButtonElement);

    screen.getByLabelText(/탱크 A1/).click();
    expect(onSelect).toHaveBeenLastCalledWith('tank-a1');

    rerender(<ScenePins pins={pins} devices={devices} selectedId="tank-a1" disconnected={false} onSelect={onSelect} />);
    const pin = screen.getByLabelText(/탱크 A1/);
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    pin.click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('SceneView: 장면 영역', () => {
  const base = { devices, selectedId: null, onSelect: () => {}, qualityMode: 'standard' as const, onFailed: () => {} };

  it('시연 동작이면 실제 값이 아님을 화면에 표시한다', async () => {
    render(<SceneView {...base} jointSource={demoSource(0)} disconnected={false} paused={false} />);
    expect(await screen.findByTestId('scene')).toBeInTheDocument();
    expect(screen.getByText(/시연 동작/)).toBeInTheDocument();
  });

  it('실제 값이면 시연 표시가 없다', async () => {
    render(<SceneView {...base} jointSource={fixedSource()} disconnected={false} paused={false} />);
    await screen.findByTestId('scene');
    expect(screen.queryByText(/시연 동작/)).not.toBeInTheDocument();
  });

  it('연결이 끊기면 장면을 멈추게 하고 끊김을 표시한다', async () => {
    render(<SceneView {...base} jointSource={fixedSource()} disconnected paused={false} />);
    await screen.findByTestId('scene');
    expect(sceneProps.last?.frozen).toBe(true);
    expect(screen.getByText(/연결 끊김 · 로봇팔과 설비의 움직임을 멈췄습니다/)).toBeInTheDocument();
  });

  it('화질 모드에 맞는 설정을 장면에 넘긴다', async () => {
    render(<SceneView {...base} qualityMode="low" jointSource={fixedSource()} disconnected={false} paused={false} />);
    await screen.findByTestId('scene');
    expect(sceneProps.last?.quality.maxFps).toBeLessThanOrEqual(30);
    expect(sceneProps.last?.quality.antialias).toBe(false);
  });

  it('장면을 그리다 오류가 나면 화면이 죽지 않고 알린다', async () => {
    sceneProps.fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onFailed = vi.fn();
    render(<SceneView {...base} onFailed={onFailed} jointSource={fixedSource()} disconnected={false} paused={false} />);
    await vi.waitFor(() => expect(onFailed).toHaveBeenCalled());
    // 핀(HTML)은 장면과 분리되어 있어 그대로 남는다
    expect(screen.getAllByRole('button', { hidden: true })).toHaveLength(7);
  });
});

describe('홈: 3D 장면과 2D 카드', () => {
  const storeDevices = [tankState(), robotState(), conveyorState()];

  it('3D를 그릴 수 없는 기기에서는 같은 정보를 2D 카드로 보여 준다', () => {
    vi.spyOn(support, 'supportsWebGL').mockReturnValue(false);
    renderWithStore(<HomePage />, { devices: storeDevices });
    expect(screen.getByRole('region', { name: '기기 상태' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '3D 장면' })).not.toBeInTheDocument();
    expect(screen.getByText(/3D 장면을 표시할 수 없어 2D로/)).toBeInTheDocument();
  });

  it('3D와 2D를 버튼으로 바꾸고, 고른 모드를 기억한다', async () => {
    vi.spyOn(support, 'supportsWebGL').mockReturnValue(true);
    const user = userEvent.setup();
    const { store } = renderWithStore(<HomePage />, { devices: storeDevices });

    expect(await screen.findByTestId('scene')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2D' }));
    expect(screen.getByRole('region', { name: '기기 상태' })).toBeInTheDocument();
    expect(screen.queryByTestId('scene')).not.toBeInTheDocument();
    expect(store.getState().ui.homeView).toBe('cards');
    expect(localStorage.getItem('ecocycle.homeView')).toBe('cards');
  });

  it('핀을 누르면 그 기기의 상세 카드가 열리고 장면에도 전해진다', async () => {
    vi.spyOn(support, 'supportsWebGL').mockReturnValue(true);
    const user = userEvent.setup();
    const { store } = renderWithStore(<HomePage />, { devices: storeDevices });
    await screen.findByTestId('scene');

    await user.click(screen.getByLabelText(/탱크 A1 72.4%/));
    expect(store.getState().ui.selectedDeviceId).toBe('tank-a1');
    expect(sceneProps.last?.selectedId).toBe('tank-a1');
  });

  it('CCTV가 열리면 그리기를 멈추고, 연결이 끊기면 장면을 멈춘다', async () => {
    vi.spyOn(support, 'supportsWebGL').mockReturnValue(true);
    const { store } = renderWithStore(<HomePage />, { devices: storeDevices });
    await screen.findByTestId('scene');
    expect(sceneProps.last?.paused).toBe(false);
    expect(sceneProps.last?.frozen).toBe(false);

    act(() => void store.dispatch(cctvToggled(true)));
    expect(sceneProps.last?.paused).toBe(true);

    act(() => void store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW })));
    expect(sceneProps.last?.frozen).toBe(true);
  });

  it('장면에서 오류가 나면 2D 카드로 바꾼다', async () => {
    vi.spyOn(support, 'supportsWebGL').mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sceneProps.fail = true;
    const { store } = renderWithStore(<HomePage />, { devices: storeDevices });
    act(() => void store.dispatch(homeViewChanged('scene')));
    expect(await screen.findByText(/문제가 생겨 2D로 보여 줍니다/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '기기 상태' })).toBeInTheDocument();
  });
});
