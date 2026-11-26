import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Vehicle } from '@ecocycle/shared';
import { matchesSearch, vehicleSearchTerms } from '@ecocycle/shared';
import { onSiteVehicles } from '../config/processDisplay';
import { RECORD_SEARCH_HINT } from '../config/display';
import { createAppStore, processSynced } from '../store';
import { selectOnSiteVehicles } from '../store/selectors';
import { EMPTY_DATA } from '../studio/types';
import type { StudioData } from '../studio/types';
import { PhoneSheet, Tables } from '../studio/overlay/Panels';
import { NOW } from './utils';

// 회사 안 차량 (명세 3절: 3D 홈 표·시트 "차량" 탭은 departed가 아닌 입고·상차 차량만, 그 수가 탭 숫자) · 차량 기록 검색(명세 6절, B41)

const at = (min: number) => `2026-11-25T05:${String(min).padStart(2, '0')}:00.000Z`;
const vehicle = (id: string, kind: Vehicle['kind'], stage: Vehicle['stage'], min: number, plate: string): Vehicle => ({
  id,
  kind,
  stage,
  plate,
  companyName: kind === 'inbound' ? '한빛자원' : '대한판지',
  sectorId: kind === 'inbound' ? 'sector-a' : null,
  baleIds: [],
  stageTimes: { arrived: at(min), [stage]: at(min) },
  updatedAt: at(min),
});

const VEHICLES: Vehicle[] = [
  vehicle('v-gone-in', 'inbound', 'departed', 9, '11가 1111'),
  vehicle('v-unload', 'inbound', 'unloading', 3, '12가 3456'),
  vehicle('v-weigh', 'inbound', 'weighing_out', 5, '34다 7781'),
  vehicle('v-load', 'outbound', 'loading', 7, '82바 1047'),
  vehicle('v-gone-out', 'outbound', 'departed', 8, '64사 5512'),
];
const ON_SITE = ['v-load', 'v-weigh', 'v-unload'];

describe('회사 안 차량 선택자', () => {
  it('출차한 차량은 빼고 입고·상차(출차 계근 중 포함)를 최근 것부터 돌려준다', () => {
    expect(onSiteVehicles(VEHICLES).map((v) => v.id)).toEqual(ON_SITE);
    expect(onSiteVehicles([])).toEqual([]);
  });

  it('store 선택자도 같은 목록이고, 차량이 바뀌지 않으면 같은 배열을 돌려준다', () => {
    const store = createAppStore();
    act(() => {
      store.dispatch(processSynced({ vehicles: VEHICLES, batches: [], bales: [], updatedAt: NOW }));
    });
    const first = selectOnSiteVehicles(store.getState());
    expect(first.map((v) => v.id)).toEqual(ON_SITE);
    expect(selectOnSiteVehicles(store.getState())).toBe(first);
  });
});

describe('3D 홈 표·시트의 "차량" 탭', () => {
  const data: StudioData = { ...EMPTY_DATA, vehicles: VEHICLES };
  beforeEach(() => localStorage.clear());

  it('넓은 화면 표: 탭 숫자 = 회사 안 차량 수, 줄은 회사 안 차량만(상차는 "상차")', () => {
    render(<Tables data={data} disconnected={false} selection={null} onSelect={() => {}} />);
    expect(screen.getByRole('tab', { name: /^차량/ })).toHaveTextContent(String(ON_SITE.length));
    const rows = screen.getAllByRole('row');
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['82바 1047대한판지', '34다 7781한빛자원', '12가 3456한빛자원']);
    expect(screen.queryByText('11가 1111')).not.toBeInTheDocument();
    expect(screen.queryByText('64사 5512')).not.toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('상차')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('출차 계근')).toBeInTheDocument();
  });

  it('폰 시트: 펼친 "차량" 탭의 숫자와 줄도 같은 선택자', async () => {
    render(<PhoneSheet data={data} disconnected={false} selection={null} onSelect={() => {}} />);
    expect(screen.getByText(`차량 ${ON_SITE.length}대`, { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /펼치기|공정 기록/ }));
    await userEvent.click(screen.getByRole('tab', { name: /^차량/ }));
    expect(screen.getByRole('tab', { name: /^차량/ })).toHaveTextContent(String(ON_SITE.length));
    expect(screen.queryByText('11가 1111')).not.toBeInTheDocument();
    expect(screen.getByText('82바 1047')).toBeInTheDocument();
  });
});

describe('차량 기록 검색 (번호판·회사·종류 이름)', () => {
  const inbound = { plate: '12가 3456', companyName: '한빛자원', kind: 'inbound' as const };
  const outbound = { plate: '82바 1047', companyName: '대한판지', kind: 'outbound' as const };

  it('종류 이름 "입고"·"상차"로 찾는다', () => {
    expect(matchesSearch('상차', vehicleSearchTerms(outbound))).toBe(true);
    expect(matchesSearch('상차', vehicleSearchTerms(inbound))).toBe(false);
    expect(matchesSearch('입고', vehicleSearchTerms(inbound))).toBe(true);
    expect(matchesSearch('입고', vehicleSearchTerms(outbound))).toBe(false);
  });

  it('번호판·회사는 그대로: 공백 무시·부분 일치', () => {
    expect(matchesSearch('82바1047', vehicleSearchTerms(outbound))).toBe(true);
    expect(matchesSearch('판지', vehicleSearchTerms(outbound))).toBe(true);
    expect(matchesSearch('한빛', vehicleSearchTerms(outbound))).toBe(false);
    expect(matchesSearch('', vehicleSearchTerms(inbound))).toBe(true);
  });

  it('검색 상자 안내 글이 서버가 찾는 값(종류 포함)과 같다', () => {
    expect(RECORD_SEARCH_HINT.vehicles).toBe('번호판, 회사, 입고·상차 검색');
  });
});
