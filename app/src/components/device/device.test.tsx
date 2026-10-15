import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Alarm } from '@ecocycle/shared';
import { alarmReceived, connectionChanged } from '../../store';
import { ADMIN, NOW, OPERATOR, VIEWER, conveyorState, renderWithStore, tankState } from '../../test/utils';
import { DeviceActionBar } from './ActionBar';
import { DetailsSection } from './DetailsSection';
import { DeviceHero } from './DeviceHero';
import { DevicePage } from './DevicePage';
import { KeyTiles } from './KeyTile';
import { NowNext } from './NowNext';

function Example() {
  return (
    <DevicePage
      hero={<DeviceHero name="컨베이어" status="normal" activity="베일 쪽으로 이송 중" updatedAt={NOW} illustration={<div data-testid="art" />} />}
      tiles={<KeyTiles tiles={[{ label: '적재 정도', value: '40', unit: '%', trend: [30, 35, 40] }, { label: '가동', value: '가동' }]} />}
      now={<NowNext now="batch-0412 이송" next="batch-0413" />}
      details={
        <DetailsSection>
          <p>이력 그래프</p>
        </DetailsSection>
      }
    />
  );
}

const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: 'al-1',
  level: 'caution',
  deviceId: 'tank-a1',
  message: '적재율 80% 초과',
  state: 'active',
  ts: NOW,
  ...over,
});

describe('기기 페이지 틀', () => {
  it('맨 위에 이름·상태·지금 하는 일, 이어서 주요 수치와 지금/다음을 보여 준다', () => {
    renderWithStore(<Example />);
    expect(screen.getByRole('heading', { name: '컨베이어' })).toBeInTheDocument();
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('베일 쪽으로 이송 중');
    expect(within(screen.getByLabelText('컨베이어 상태')).getByText('정상')).toBeInTheDocument();
    expect(within(screen.getByLabelText('적재 정도')).getByText('40')).toBeInTheDocument();
    expect(screen.getByLabelText('지금과 다음')).toHaveTextContent('batch-0412 이송');
  });

  it('연결이 끊기면 값은 "–", 상태는 연결 끊김, 마지막 수신 시각을 보이고 그림을 멈춘다', () => {
    const { store } = renderWithStore(<Example />);
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    const hero = screen.getByLabelText('컨베이어 상태');
    expect(within(hero).getByText('연결 끊김')).toBeInTheDocument();
    expect(within(hero).getByText(/마지막 수신/)).toBeInTheDocument();
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('–');
    expect(screen.getByTestId('art').parentElement).toHaveAttribute('data-frozen', 'true');
    expect(screen.getByLabelText('적재 정도')).toHaveTextContent('–');
    expect(within(screen.getByLabelText('적재 정도')).queryByText('40')).not.toBeInTheDocument();
    expect(screen.getByLabelText('지금과 다음')).not.toHaveTextContent('batch-0412');
  });

  it('주요 수치는 4개까지만 그린다', () => {
    const tiles = ['가', '나', '다', '라', '마'].map((label) => ({ label, value: '1' }));
    renderWithStore(<KeyTiles tiles={tiles} />);
    expect(within(screen.getByLabelText('주요 수치')).getAllByRole('group')).toHaveLength(4);
  });

  it('"자세히"는 처음에 닫혀 있고 열어야 내용을 그린다', async () => {
    renderWithStore(<Example />);
    const toggle = screen.getByRole('button', { name: '자세히' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('이력 그래프')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('이력 그래프')).toBeInTheDocument();
  });
});

describe('기기 페이지 틀 배치', () => {
  const page = (illustrated: boolean) => (
    <DevicePage
      illustrated={illustrated}
      hero={<DeviceHero name="컨베이어" status="normal" activity="이송 중" updatedAt={NOW} {...(illustrated ? { illustration: <div data-testid="art" /> } : {})} />}
      tiles={<KeyTiles wide={!illustrated} tiles={[{ label: '가', value: '1' }, { label: '나', value: '2' }, { label: '다', value: '3' }]} />}
      now={<NowNext now="a" />}
      details={<DetailsSection side={<p>설정</p>}><p>그래프</p></DetailsSection>}
    />
  );

  it('그림이 없으면 주요 수치가 폭 전체 격자이고 그림 칸이 없다', () => {
    renderWithStore(page(false));
    expect(screen.queryByTestId('art')).not.toBeInTheDocument();
    expect(screen.getByLabelText('주요 수치')).toHaveClass('md:grid-cols-3');
  });

  it('"자세히"는 어느 쪽이든 오른쪽 칸 밖에 폭 전체로 있고, 열면 왼쪽 그래프와 오른쪽 설정으로 펼친다', async () => {
    for (const illustrated of [true, false]) {
      const { unmount } = renderWithStore(page(illustrated));
      const section = screen.getByRole('button', { name: '자세히' }).closest('section')!;
      // 주요 수치·지금/다음이 있는 칸과 형제이지 그 안이 아니다
      expect(section.parentElement).not.toContainElement(screen.getByLabelText('주요 수치'));
      await userEvent.click(screen.getByRole('button', { name: '자세히' }));
      const body = screen.getByText('그래프').parentElement!.parentElement!;
      expect(body).toHaveClass('md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]');
      expect(screen.getByText('설정')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('조작 줄', () => {
  it('작업자에게는 시작·일시정지·재개·정지가 보이고 비상정지처럼 보이는 버튼은 없다', () => {
    renderWithStore(<DeviceActionBar deviceId="conveyor-z" />, { me: OPERATOR, devices: [conveyorState()] });
    const bar = screen.getByRole('region', { name: '조작' });
    expect(within(bar).getByRole('button', { name: '정지' })).toBeEnabled();
    expect(within(bar).queryByRole('button', { name: /비상/ })).not.toBeInTheDocument();
    // 위험 조작은 조작 줄에 두지 않는다
    expect(within(bar).queryByRole('button', { name: /적용|집기/ })).not.toBeInTheDocument();
  });

  it('열람자에게는 조작 줄이 없다', () => {
    renderWithStore(<DeviceActionBar deviceId="conveyor-z" />, { me: VIEWER, devices: [conveyorState()] });
    expect(screen.queryByRole('region', { name: '조작' })).not.toBeInTheDocument();
  });

  it('탱크는 확인할 알람이 있을 때만 알람 확인이 나온다', () => {
    const { store } = renderWithStore(<DeviceActionBar deviceId="tank-a1" />, { me: ADMIN, devices: [tankState()] });
    expect(screen.queryByRole('region', { name: '조작' })).not.toBeInTheDocument();
    act(() => {
      store.dispatch(alarmReceived(alarm()));
    });
    expect(within(screen.getByRole('region', { name: '조작' })).getByRole('button', { name: '알람 확인' })).toBeEnabled();
  });

  it('연결이 끊기면 조작 버튼이 비활성이다', () => {
    renderWithStore(<DeviceActionBar deviceId="conveyor-z" />, { me: OPERATOR, devices: [conveyorState()], connection: 'offline' });
    expect(screen.getByRole('button', { name: '정지' })).toBeDisabled();
  });
});
