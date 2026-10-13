import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import { GlassPanel } from './GlassPanel';
import { KpiCard } from './KpiCard';
import { Sparkline } from './Sparkline';
import { Tabs } from './Tabs';
import { ToastCard } from './ToastCard';

describe('GlassPanel', () => {
  it('주요 패널과 보조 패널이 다른 유리 클래스를 쓴다 (화질 단계별 처리는 CSS가 한다)', () => {
    render(
      <>
        <GlassPanel aria-label="주요">a</GlassPanel>
        <GlassPanel level="minor" aria-label="보조">
          b
        </GlassPanel>
      </>,
    );
    expect(screen.getByLabelText('주요')).toHaveClass('glass');
    expect(screen.getByLabelText('보조')).toHaveClass('glass-minor');
  });
});

describe('KpiCard', () => {
  it('이름, 값, 단위를 보여 준다', () => {
    render(<KpiCard label="평균 함수율" value="11.8" unit="%" trend={[11, 11.4, 11.8]} />);
    const card = screen.getByRole('region', { name: '평균 함수율' });
    expect(card).toHaveTextContent('11.8%');
  });

  it('값을 아직 받지 못했으면 지어내지 않고 줄표를 보여 준다', () => {
    render(<KpiCard label="오늘 처리량" value={null} unit="베일" />);
    const card = screen.getByRole('region', { name: '오늘 처리량' });
    expect(card).toHaveTextContent('–');
    expect(card).not.toHaveTextContent('베일');
  });
});

describe('Sparkline', () => {
  it('값이 2개보다 적으면 선을 그리지 않는다', () => {
    const { container, rerender } = render(<Sparkline values={[3]} />);
    expect(container.querySelector('path')).toBeNull();
    rerender(<Sparkline values={[3, 5, 4]} />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('값이 모두 같아도 그릴 수 있다', () => {
    const { container } = render(<Sparkline values={[7, 7, 7]} />);
    expect(container.querySelector('path')?.getAttribute('d')).not.toContain('NaN');
  });
});

function TabsHarness() {
  const [tab, setTab] = useState<'vehicles' | 'bales'>('vehicles');
  return (
    <Tabs
      label="실시간 목록"
      items={[
        { key: 'vehicles', label: '차량', count: 3 },
        { key: 'bales', label: '베일' },
      ]}
      value={tab}
      onChange={setTab}
    >
      {tab === 'vehicles' ? '차량 표' : '베일 표'}
    </Tabs>
  );
}

describe('Tabs', () => {
  it('고른 탭의 내용을 보여 주고 누르면 바뀐다', async () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tab', { name: /차량/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('차량 표');
    await userEvent.click(screen.getByRole('tab', { name: '베일' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('베일 표');
  });

  it('좌우 화살표로 옮길 수 있고 탭마다 최소 48px 높이를 둔다', async () => {
    render(<TabsHarness />);
    screen.getByRole('tab', { name: /차량/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '베일' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('베일 표');
    for (const tab of screen.getAllByRole('tab')) expect(tab).toHaveClass('min-h-12');
  });
});

describe('DataTable', () => {
  const rows = [
    { id: 'BL-20261013-0411', stage: '출하' },
    { id: 'BL-20261013-0412', stage: '배출' },
  ];
  const columns = [
    { key: 'id', header: '베일', cell: (r: (typeof rows)[number]) => r.id },
    { key: 'stage', header: '단계', cell: (r: (typeof rows)[number]) => r.stage },
  ];

  it('줄을 누르거나 엔터를 치면 그 줄을 알려 준다', async () => {
    const onRowClick = vi.fn();
    render(<DataTable label="베일" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} selectedKey="BL-20261013-0412" />);
    const table = screen.getByRole('table', { name: '베일' });
    const [, first, second] = within(table).getAllByRole('row');
    expect(second).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(first!);
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    second!.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1]);
  });

  it('줄이 없으면 안내 문구를 보여 준다', () => {
    render(<DataTable label="베일" columns={columns} rows={[]} rowKey={(r) => r.id} empty="아직 베일이 없습니다." />);
    expect(screen.getByText('아직 베일이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('ToastCard', () => {
  it('닫기를 주면 닫기 버튼이 생기고, 알람은 alert로 알린다', async () => {
    const onDismiss = vi.fn();
    render(
      <ToastCard tone="alarm" role="alert" title="탱크 A1" onDismiss={onDismiss}>
        적재율 95% 초과
      </ToastCard>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('적재율 95% 초과');
    await userEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
