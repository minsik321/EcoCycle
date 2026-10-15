import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bale, Batch, DeviceState, PlantSummary, Vehicle } from '@ecocycle/shared';
import * as api from '../../api';
import { alarmReceived, connectionChanged, plantReceived, processSynced } from '../../store';
import { NOW, conveyorState, renderWithStore, robotState } from '../../test/utils';
import { HomePage } from './HomePage';
import { currentBatch, recentActivity } from './dashboard/dashboardData';
import * as support from './sceneSupport';

// 대시보드 홈 (3D 없는 홈). 3D 묶음을 불러오면 안 되므로 studio 모듈을 불러왔는지 기록한다.
const studio = vi.hoisted(() => ({ loaded: false }));
vi.mock('../../studio', () => {
  studio.loaded = true;
  return { LiveStudio: () => <div data-testid="studio" />, DemoStudio: () => null };
});

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  sendCommand: vi.fn(),
  getCommand: vi.fn(),
  getPlantHistory: vi.fn(),
}));

const tank = (id: 'tank-a1' | 'tank-a2' | 'tank-b1' | 'tank-b2', fill: number, status: 'normal' | 'caution' | 'alarm' = 'normal'): DeviceState => ({
  id,
  type: 'tank',
  section: id.slice(-2).toUpperCase() as 'A1',
  grade: id.startsWith('tank-a') ? 'A' : 'C',
  status,
  fillPercent: fill,
  volumeM3: Math.round(fill) / 10,
  capacityM3: 8,
  moisturePercent: 11.8,
  updatedAt: NOW,
});

const compressor: DeviceState = { id: 'compressor-1', type: 'compressor', status: 'normal', running: true, pressureMpa: 22.5, temperatureC: 42.3, updatedAt: NOW };

const summary: PlantSummary = { averageMoisturePercent: 11.1, totalFillPercent: 51.6, balesToday: 412, compressorUptimePercent: 92, status: 'normal', updatedAt: NOW };

const at = (min: number) => `2026-10-13T05:${String(min).padStart(2, '0')}:00.000Z`;
const vehicle = (id: string, stage: Vehicle['stage'], min: number, plate: string | null = '12가 3456'): Vehicle => ({
  id,
  stage,
  plate,
  companyName: plate ? '한빛자원' : null,
  sectorId: plate ? 'tank-a1' : null,
  stageTimes: { arrived: at(min), ...(plate ? { identified: at(min) } : {}), ...(stage === 'unloading' ? { unloading: at(min) } : {}) },
  updatedAt: at(min),
});
const batch = (id: string, stage: Batch['stage'], min: number): Batch => ({
  id,
  stage,
  mix: [
    { sectorId: 'tank-a1', percent: 60 },
    { sectorId: 'tank-b1', percent: 40 },
  ],
  avgMoisturePercent: 10.6,
  targetPressureMpa: 28.2,
  stageTimes: { planned: at(min), ...(stage !== 'planned' ? { mixing: at(min) } : {}), ...(stage === 'compressing' ? { compressing: at(min) } : {}) },
  updatedAt: at(min),
});
const bale = (id: string, stage: Bale['stage'], min: number): Bale => ({ id, batchId: 'batch-1', stage, stageTimes: { created: at(min), ...(stage === 'shipped' ? { shipped: at(min) } : {}) }, updatedAt: at(min) });

const devices = (): DeviceState[] => [tank('tank-a1', 72.4), tank('tank-a2', 45), tank('tank-b1', 30.5), tank('tank-b2', 82, 'caution'), robotState(), conveyorState(), compressor];

function page() {
  const utils = renderWithStore(
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/tanks/:id" element={<div>탱크 페이지</div>} />
    </Routes>,
    { devices: devices() },
  );
  act(() => {
    utils.store.dispatch(plantReceived(summary));
    utils.store.dispatch(
      processSynced({
        vehicles: [vehicle('v1', 'departed', 1), vehicle('v2', 'unloading', 6), vehicle('v3', 'arrived', 7, null)],
        batches: [batch('batch-1128', 'completed', 2), batch('batch-1129', 'compressing', 5)],
        bales: [bale('BL-20261013-0412', 'shipped', 4)],
        updatedAt: at(7),
      }),
    );
  });
  return utils;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ecocycle.homeMode', 'dashboard');
  vi.restoreAllMocks();
  vi.spyOn(support, 'supportsWebGL').mockReturnValue(true);
  vi.mocked(api.getPlantHistory).mockImplementation(async ({ metric }) => ({
    metric,
    interval: '1h',
    from: NOW,
    to: NOW,
    points: [1, 3, 2, 4].map((value, i) => ({ ts: at(i), value })),
  }));
});

describe('대시보드 홈', () => {
  it('3D 묶음을 불러오지 않는다', () => {
    page();
    expect(screen.getByRole('tab', { name: '대시보드' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument();
    expect(studio.loaded).toBe(false);
  });

  it('상태 요약: 시스템 상태, 연결, 마지막 갱신 시각', () => {
    page();
    const region = screen.getByRole('region', { name: '상태 요약' });
    expect(within(region).getByText('정상')).toBeInTheDocument();
    expect(within(region).getByText('실시간')).toBeInTheDocument();
    expect(within(region).getByText('마지막 갱신')).toBeInTheDocument();
    expect(within(region).getByRole('time')).toHaveAttribute('dateTime', NOW);
  });

  it('지표 3장: 오늘 생산 베일, 평균 수분, 압축기 가동률 (작은 추이선 포함)', async () => {
    page();
    expect(within(screen.getByRole('region', { name: '오늘 생산 베일' })).getByText('412')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '평균 수분' })).getByText('11.1')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '압축기 가동률' })).getByText('92.0')).toBeInTheDocument();
    // 추이선은 서버 이력을 받은 뒤에 그린다
    await vi.waitFor(() => expect(screen.getByRole('region', { name: '평균 수분' }).querySelector('svg path')).not.toBeNull());
  });

  it('섹터 4칸: 적재율 막대, 등급, 수분, 상태. 누르면 섹터 페이지', async () => {
    page();
    const sectors = screen.getByRole('region', { name: '섹터' });
    expect(within(sectors).getAllByRole('link')).toHaveLength(4);
    const b2 = within(sectors).getByRole('link', { name: '섹터 B2 페이지 열기' });
    expect(within(b2).getByText('C등급')).toBeInTheDocument();
    expect(within(b2).getByText('82.0%')).toBeInTheDocument();
    expect(within(b2).getByText('수분 11.8%')).toBeInTheDocument();
    expect(within(b2).getByText('주의')).toBeInTheDocument();
    expect(within(b2).getByRole('meter')).toHaveAttribute('aria-valuenow', '82');
    await userEvent.click(b2);
    expect(screen.getByText('탱크 페이지')).toBeInTheDocument();
  });

  it('지금 배치: 배합, 평균 수분, 목표·현재 압력', () => {
    page();
    const card = screen.getByRole('region', { name: '지금 배치' });
    expect(within(card).getByText('batch-1129')).toBeInTheDocument();
    expect(within(card).getByText('압축 중')).toBeInTheDocument();
    expect(within(card).getByText('A1 60 : B1 40')).toBeInTheDocument();
    expect(within(card).getByText('10.6%')).toBeInTheDocument();
    expect(within(card).getByText('28.2 MPa')).toBeInTheDocument();
    expect(within(card).getByText('22.5 MPa')).toBeInTheDocument();
  });

  it('6단계 공정 추적: 순서대로, 지금 단계를 표시한다', () => {
    page();
    const tracker = screen.getByRole('region', { name: '공정 추적' });
    const steps = within(tracker).getAllByRole('listitem');
    expect(steps.map((li) => li.querySelector('span.block')?.textContent)).toEqual(['입고', '차량 인식', '하역', '배합', '압축', '출하']);
    expect(steps[4]).toHaveAttribute('aria-current', 'step');
    expect(within(tracker).getByText('지금 압축')).toBeInTheDocument();
  });

  it('최근 차량·베일: 늦은 것부터', () => {
    page();
    const list = within(screen.getByRole('region', { name: '최근 차량·베일' })).getAllByRole('listitem');
    expect(list.map((li) => li.textContent)).toEqual([
      expect.stringContaining('번호판 인식 전'),
      expect.stringContaining('하역 중'),
      expect.stringContaining('베일 #0412'),
      expect.stringContaining('출차'),
    ]);
  });

  it('열린 알람은 맨 위에 보이고 확인할 수 있다', () => {
    const { store } = page();
    act(() => {
      store.dispatch(alarmReceived({ id: 'al-1', level: 'alarm', deviceId: 'tank-b2', message: '적재율 80% 초과', state: 'active', ts: NOW }));
    });
    const alarms = screen.getByRole('region', { name: '알람' });
    expect(within(alarms).getByText(/탱크 B2 · 적재율 80% 초과/)).toBeInTheDocument();
    // 알람은 상태 요약보다 앞에 있다
    expect(alarms.compareDocumentPosition(screen.getByRole('region', { name: '상태 요약' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: '알람 확인' })).toBeEnabled();
  });

  it('알람이 없으면 알람 영역을 그리지 않는다', () => {
    page();
    expect(screen.queryByRole('region', { name: '알람' })).not.toBeInTheDocument();
  });
});

describe('대시보드: 연결 끊김 (마지막 값을 정상처럼 보여 주지 않는다)', () => {
  const disconnect = (store: ReturnType<typeof page>['store']) =>
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });

  it('숫자는 "–"이고 마지막 수신 시각을 함께 보여 주며, 정상·주의 표시가 남지 않는다', () => {
    const { store } = page();
    disconnect(store);
    const summaryRegion = screen.getByRole('region', { name: '상태 요약' });
    expect(within(summaryRegion).getByText('마지막 수신')).toBeInTheDocument();
    expect(within(summaryRegion).getAllByText('연결 끊김').length).toBeGreaterThan(0);
    for (const name of ['오늘 생산 베일', '평균 수분', '압축기 가동률']) {
      const card = screen.getByRole('region', { name });
      expect(within(card).getByText('–')).toBeInTheDocument();
      expect(within(card).getByText(/마지막 수신/)).toBeInTheDocument();
    }
    const sectors = screen.getByRole('region', { name: '섹터' });
    expect(within(sectors).queryByText('정상')).not.toBeInTheDocument();
    expect(within(sectors).queryByText('주의')).not.toBeInTheDocument();
    expect(within(sectors).getAllByText('연결 끊김')).toHaveLength(4);
    expect(within(sectors).queryByText('82.0%')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '지금 배치' })).queryByText('22.5 MPa')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '공정 추적' })).queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument();
  });

  it('연결이 돌아오면 값이 다시 보인다', () => {
    const { store } = page();
    disconnect(store);
    act(() => {
      store.dispatch(connectionChanged({ status: 'online', lastReceivedAt: NOW }));
    });
    expect(within(screen.getByRole('region', { name: '섹터' })).getByText('82.0%')).toBeInTheDocument();
  });
});

describe('대시보드 값 고르기', () => {
  it('지금 배치는 배합·압축 중인 것을 먼저 고른다', () => {
    expect(currentBatch([batch('a', 'completed', 9), batch('b', 'mixing', 1), batch('c', 'planned', 5)])?.id).toBe('b');
    expect(currentBatch([batch('a', 'completed', 9), batch('c', 'planned', 5)])?.id).toBe('c');
    expect(currentBatch([batch('a', 'completed', 9)])?.id).toBe('a');
    expect(currentBatch([])).toBeUndefined();
  });

  it('최근 활동은 개수를 넘지 않고 늦은 것부터다', () => {
    const many = Array.from({ length: 9 }, (_, i) => vehicle(`v${i}`, 'departed', i));
    expect(recentActivity(many, [], 5)).toHaveLength(5);
    expect(recentActivity(many, [], 5)[0]?.key).toBe('veh:v8');
  });
});
