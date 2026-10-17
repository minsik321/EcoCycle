import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpiHistoryResponse } from '@ecocycle/shared';
import { getKpiHistory } from '../../api/process';
import { connectionChanged } from '../../store';
import { NOW, renderWithStore } from '../../test/utils';
import { KpiDetail } from './KpiDetail';

vi.mock('../../api/process', () => ({ getKpiHistory: vi.fn() }));
vi.mock('../../components/charts/KpiHistoryChart', () => ({ KpiHistoryChart: () => <div>구간 그래프</div> }));
const data: KpiHistoryResponse = { metric: 'averageMoisturePercent', range: 'today', interval: '1h', from: NOW, to: NOW, updatedAt: NOW, points: [{ ts: NOW, value: 12 }], statistics: { current: 12, average: 11.5, min: 10, max: 13 }, targetBand: { min: 10, max: 14 } };

describe('KPI 상세', () => {
  beforeEach(() => { vi.mocked(getKpiHistory).mockReset(); vi.mocked(getKpiHistory).mockResolvedValue(data); });
  it('서버 통계와 목표 범위 표시, 기간 변경 때 이전 요청 취소', async () => {
    renderWithStore(<KpiDetail metric="averageMoisturePercent" onClose={() => {}} />);
    await screen.findByText('11.5%');
    expect(screen.getByText('목표 범위 10~14% · 옅은 파랑 영역')).toBeInTheDocument();
    const previousSignal = vi.mocked(getKpiHistory).mock.calls[0]![2];
    await userEvent.click(screen.getByRole('tab', { name: '30일' }));
    expect(previousSignal?.aborted).toBe(true);
    expect(getKpiHistory).toHaveBeenLastCalledWith('averageMoisturePercent', '30d', expect.any(AbortSignal));
  });
  it('실패 후 같은 구간 재시도', async () => {
    vi.mocked(getKpiHistory).mockRejectedValueOnce(new Error('network'));
    renderWithStore(<KpiDetail metric="averageMoisturePercent" onClose={() => {}} />);
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('11.5%');
    expect(getKpiHistory).toHaveBeenCalledTimes(2);
  });
  it('끊기면 현재값을 숨기고 지난 이력 유지, 재연결 시 재조회', async () => {
    const { store } = renderWithStore(<KpiDetail metric="averageMoisturePercent" onClose={() => {}} />);
    await screen.findByText('12%');
    act(() => { store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW })); });
    expect(screen.queryByText('12%')).not.toBeInTheDocument();
    expect(screen.getByText('구간 그래프')).toBeInTheDocument();
    expect(screen.getByText('11.5%')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '7일' })).toBeDisabled();
    expect(getKpiHistory).toHaveBeenCalledTimes(1);
    act(() => { store.dispatch(connectionChanged({ status: 'online', lastReceivedAt: NOW })); });
    await waitFor(() => expect(getKpiHistory).toHaveBeenCalledTimes(2));
  });
  it('빈 구간 안내', async () => {
    vi.mocked(getKpiHistory).mockResolvedValue({ ...data, points: [] });
    renderWithStore(<KpiDetail metric="averageMoisturePercent" onClose={() => {}} />);
    await screen.findByText('이 기간에 기록이 없습니다');
    expect(screen.queryByText('구간 그래프')).not.toBeInTheDocument();
  });
});
