import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamInfo } from '@ecocycle/shared';
import * as api from '../../api';
import { AppShell } from '../../components/layout/AppShell';
import { cctvToggled } from '../../store';
import { renderWithStore } from '../../test/utils';
import { CctvButton, CctvOverlay } from './CctvOverlay';
import { VideoPlayer } from './VideoPlayer';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getCameras: vi.fn(),
  getStreamInfo: vi.fn(),
}));

const hls = vi.hoisted(() => {
  const instances: Array<{ loadSource: ReturnType<typeof vi.fn>; attachMedia: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; handlers: Record<string, (e: unknown, d: unknown) => void> }> = [];
  class FakeHls {
    static isSupported = vi.fn(() => true);
    static Events = { ERROR: 'hlsError' };
    handlers: Record<string, (e: unknown, d: unknown) => void> = {};
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    on = vi.fn((event: string, cb: (e: unknown, d: unknown) => void) => {
      this.handlers[event] = cb;
    });
    constructor() {
      instances.push(this);
    }
  }
  return { instances, FakeHls };
});
vi.mock('hls.js', () => ({ default: hls.FakeHls }));

const NOW = Date.parse('2026-10-13T05:00:00.000Z');
const stream = (over: Partial<StreamInfo> = {}): StreamInfo => ({
  protocol: 'hls',
  url: 'https://video.example/live.m3u8',
  expiresAt: new Date(NOW + 5 * 60_000).toISOString(),
  ...over,
});
const cameras = [
  { id: 'cam-1', name: '탱크 구역', location: 'A·B 탱크 전경' },
  { id: 'cam-2', name: '컨베이어·압축기', location: 'Section Z' },
];

beforeEach(() => {
  hls.instances.length = 0;
  hls.FakeHls.isSupported.mockReturnValue(true);
  vi.mocked(api.getCameras).mockReset().mockResolvedValue(cameras);
  vi.mocked(api.getStreamInfo).mockReset().mockResolvedValue(stream());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const open = (store: ReturnType<typeof renderWithStore>['store']) =>
  act(() => {
    store.dispatch(cctvToggled(true));
  });

describe('CctvOverlay', () => {
  it('닫혀 있으면 아무것도 요청하지 않는다', () => {
    renderWithStore(<CctvOverlay now={() => NOW} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.getCameras).not.toHaveBeenCalled();
  });

  it('CCTV 버튼을 누르면 열리고 ui.cctvOpen이 켜진다', async () => {
    const { store } = renderWithStore(
      <>
        <CctvButton />
        <CctvOverlay now={() => NOW} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'CCTV' }));
    expect(store.getState().ui.cctvOpen).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'CCTV' })).toBeInTheDocument();
  });

  it('카메라 목록을 받아 첫 카메라의 재생 주소로 영상을 재생한다', async () => {
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));

    expect(api.getStreamInfo).toHaveBeenCalledWith('cam-1');
    expect(hls.instances[0]!.loadSource).toHaveBeenCalledWith('https://video.example/live.m3u8');
    expect(hls.instances[0]!.attachMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByText('A·B 탱크 전경')).toBeInTheDocument();
    expect(screen.getByText(/수 초 늦습니다/)).toBeInTheDocument();
  });

  it('카메라를 고르면 그 카메라의 영상으로 바뀐다', async () => {
    vi.mocked(api.getStreamInfo).mockImplementation(async (id) => stream({ url: `https://video.example/${id}.m3u8` }));
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: '컨베이어·압축기' }));
    await vi.waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(hls.instances[0]!.destroy).toHaveBeenCalled();
    expect(hls.instances[1]!.loadSource).toHaveBeenCalledWith('https://video.example/cam-2.m3u8');
    expect(screen.getByRole('button', { name: '컨베이어·압축기' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('닫으면 영상을 멈추고(해제) ui.cctvOpen이 꺼진다', async () => {
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(store.getState().ui.cctvOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hls.instances[0]!.destroy).toHaveBeenCalled();
  });

  it('Esc로도 닫힌다', async () => {
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(store.getState().ui.cctvOpen).toBe(false);
  });

  it('서명 주소가 만료되기 30초 전에 새 주소를 받는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getStreamInfo)
      .mockResolvedValueOnce(stream({ url: 'https://video.example/a.m3u8', expiresAt: new Date(NOW + 60_000).toISOString() }))
      .mockResolvedValue(stream({ url: 'https://video.example/b.m3u8' }));
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));
    expect(api.getStreamInfo).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(api.getStreamInfo).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await vi.waitFor(() => expect(api.getStreamInfo).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(hls.instances[1]!.loadSource).toHaveBeenCalledWith('https://video.example/b.m3u8');
  });

  it('카메라 목록을 못 받으면 오류와 다시 시도 버튼을 보여 주고, 다시 시도하면 영상이 나온다', async () => {
    vi.mocked(api.getCameras).mockRejectedValueOnce(new api.ApiError(503, 'X', ''));
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('카메라 목록을 불러오지 못했습니다.');
    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('재생 주소를 못 받아도 오류를 보여 준다', async () => {
    vi.mocked(api.getStreamInfo).mockRejectedValue(new api.ApiError(503, 'X', ''));
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    expect(await screen.findByRole('alert')).toHaveTextContent('영상 주소를 받지 못했습니다.');
  });

  it('카메라가 없으면 없다고 알린다', async () => {
    vi.mocked(api.getCameras).mockResolvedValue([]);
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    expect(await screen.findByText('등록된 카메라가 없습니다.')).toBeInTheDocument();
  });

  it('WebRTC 주소는 아직 지원하지 않는다고 알린다', async () => {
    vi.mocked(api.getStreamInfo).mockResolvedValue(stream({ protocol: 'webrtc' }));
    const { store } = renderWithStore(<CctvOverlay now={() => NOW} />);
    open(store);
    expect(await screen.findByRole('alert')).toHaveTextContent('webrtc');
    expect(hls.instances).toHaveLength(0);
  });
});

describe('VideoPlayer', () => {
  it('기본 재생이 되는 기기(안드로이드, 사파리)는 hls.js 없이 주소를 그대로 쓴다', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    const { container } = renderWithStore(<VideoPlayer url="https://v.example/a.m3u8" protocol="hls" onError={vi.fn()} />);
    expect(container.querySelector('video')!.getAttribute('src')).toBe('https://v.example/a.m3u8');
    expect(hls.instances).toHaveLength(0);
  });

  it('hls.js가 지원되지 않는 기기는 재생할 수 없다고 알린다', async () => {
    hls.FakeHls.isSupported.mockReturnValue(false);
    const onError = vi.fn();
    renderWithStore(<VideoPlayer url="https://v.example/a.m3u8" protocol="hls" onError={onError} />);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('이 기기에서는 영상을 재생할 수 없습니다.'));
  });

  it('치명적인 재생 오류가 나면 알리고, 치명적이지 않은 오류는 무시한다', async () => {
    const onError = vi.fn();
    renderWithStore(<VideoPlayer url="https://v.example/a.m3u8" protocol="hls" onError={onError} />);
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));
    hls.instances[0]!.handlers.hlsError!({}, { fatal: false });
    expect(onError).not.toHaveBeenCalled();
    hls.instances[0]!.handlers.hlsError!({}, { fatal: true });
    expect(onError).toHaveBeenCalledWith('영상을 불러오지 못했습니다.');
  });

  it('영상은 소리 없이 자동 재생하고 컨트롤을 보여 준다', () => {
    const { container } = renderWithStore(<VideoPlayer url="u" protocol="hls" onError={vi.fn()} />);
    const video = container.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
  });
});

describe('AppShell의 CCTV 연결', () => {
  it('상단 줄에 끼워 넣은 CCTV 버튼이 보인다', () => {
    renderWithStore(<AppShell headerExtra={<CctvButton />} overlays={<CctvOverlay now={() => NOW} />} />);
    expect(screen.getByRole('button', { name: 'CCTV' })).toBeInTheDocument();
  });
});
