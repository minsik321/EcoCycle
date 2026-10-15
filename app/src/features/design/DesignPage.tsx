import { useState } from 'react';
import type { PlantMetric } from '@ecocycle/shared';
import { KpiHistoryChart } from '../../components/charts/KpiHistoryChart';
import { KPI_DISPLAY } from '../../config/kpi';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { DataTable } from '../../components/common/DataTable';
import { Dialog } from '../../components/common/Dialog';
import { GlassPanel } from '../../components/common/GlassPanel';
import { KpiCard } from '../../components/common/KpiCard';
import { Tabs } from '../../components/common/Tabs';
import { ToastCard } from '../../components/common/ToastCard';
import { StatusBadge } from '../../components/status/StatusBadge';
import { QUALITY_TEXT, QUALITY_TIERS } from '../../config/quality';
import type { QualityTier } from '../../config/quality';
import { qualityModeChanged } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';

// 디자인 토큰과 공용 컴포넌트를 한눈에 보는 개발용 화면(/design). 값은 모두 보기용 예시다. 로그인·서버가 필요 없다.

const SWATCHES = [
  ['paper', 'bg-paper'],
  ['paper-deep', 'bg-paper-deep'],
  ['surface', 'bg-surface'],
  ['accent', 'bg-accent'],
  ['accent-soft', 'bg-accent-soft'],
  ['kraft', 'bg-kraft'],
  ['safety', 'bg-safety'],
  ['ink', 'bg-ink'],
  ['normal', 'bg-status-normal'],
  ['caution', 'bg-status-caution'],
  ['alarm', 'bg-status-alarm'],
  ['offline', 'bg-status-offline'],
] as const;

const BALES = [
  { id: 'BL-20261013-0412', batch: 'batch-0412', stage: '배출' },
  { id: 'BL-20261013-0411', batch: 'batch-0411', stage: '출하' },
  { id: 'BL-20261013-0410', batch: 'batch-0410', stage: '출하' },
];

type TabKey = 'vehicles' | 'sectors' | 'batches' | 'bales';

export function DesignPage() {
  const dispatch = useAppDispatch();
  const quality = useAppSelector((state) => state.ui.qualityMode);
  const [tab, setTab] = useState<TabKey>('bales');
  const [dialog, setDialog] = useState(false);

  return (
    <div className="min-h-full bg-paper p-6 text-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">디자인 시스템</h1>
            <p className="text-sm text-ink-soft">토큰과 공용 컴포넌트 미리 보기 · 값은 모두 보기용 예시</p>
          </div>
          <div role="radiogroup" aria-label="화질 단계" className="flex gap-1">
            {QUALITY_TIERS.map((tier: QualityTier) => (
              <Button key={tier} role="radio" aria-checked={quality === tier} variant={quality === tier ? 'primary' : 'secondary'} onClick={() => dispatch(qualityModeChanged(tier))}>
                {QUALITY_TEXT[tier].label}
              </Button>
            ))}
          </div>
        </header>

        <Card title="색">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {SWATCHES.map(([name, cls]) => (
              <div key={name} className="flex flex-col gap-1">
                <div className={`h-12 rounded-control border border-line ${cls}`} />
                <span className="text-xs text-ink-soft">{name}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 유리 패널은 뒤에 무언가 있어야 보인다. 장면 대신 색 띠를 깔아 화질 단계별 차이를 확인한다. */}
        <Card>
          <h2 className="mb-4 font-semibold">KPI 상세 차트 · 예시 데이터</h2>
          {(Object.keys(KPI_DISPLAY) as PlantMetric[]).map(metric => <section key={metric} aria-label={KPI_DISPLAY[metric].label} className="mb-6">
            <h3 className="mb-2 text-sm">{KPI_DISPLAY[metric].label}</h3>
            <KpiHistoryChart history={{ metric, range: 'today', interval: '1h', from: '2026-10-15T00:00:00Z', to: '2026-10-15T05:00:00Z', updatedAt: '2026-10-15T05:00:00Z', statistics: { current: 12, average: 11, min: 10, max: 14 }, targetBand: metric === 'averageMoisturePercent' ? { min: 10, max: 14 } : null, points: [10, 12, 11, 14, 12, 13].map((value, i) => ({ ts: `2026-10-15T0${i}:00:00Z`, value: metric === 'compressorUptimePercent' ? value * 6 : value, runningMinutes: value * 3.6, stoppedMinutes: 60 - value * 3.6 })) }} />
          </section>)}
        </Card>
        <section
          aria-label="유리 패널"
          className="relative overflow-hidden rounded-panel p-5"
          style={{ background: 'linear-gradient(120deg, #cfe0ff 0%, #f3e9d8 45%, #f5b301 70%, #2563eb 100%)' }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="오늘 처리량" value="412" unit="베일" trend={[380, 386, 391, 397, 402, 407, 412]} />
            <KpiCard label="평균 함수율" value="11.8" unit="%" trend={[11.2, 11.5, 11.4, 11.9, 12.1, 11.7, 11.8]} />
            <KpiCard label="압축기 가동률" value="92.0" unit="%" trend={[90, 91, 93, 92, 91, 92, 92]} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_20rem]">
            <GlassPanel className="p-3">
              <Tabs<TabKey>
                label="실시간 목록"
                items={[
                  { key: 'vehicles', label: '차량', count: 2 },
                  { key: 'sectors', label: '섹터', count: 4 },
                  { key: 'batches', label: '배치' },
                  { key: 'bales', label: '베일', count: BALES.length },
                ]}
                value={tab}
                onChange={setTab}
              >
                <DataTable
                  label="베일"
                  rows={BALES}
                  rowKey={(r) => r.id}
                  selectedKey="BL-20261013-0412"
                  onRowClick={() => {}}
                  columns={[
                    { key: 'id', header: '베일', cell: (r) => r.id },
                    { key: 'batch', header: '배치', cell: (r) => r.batch, hideOnNarrow: true },
                    { key: 'stage', header: '단계', cell: (r) => r.stage, align: 'right' },
                  ]}
                />
              </Tabs>
            </GlassPanel>
            <GlassPanel level="minor" className="flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold text-ink-soft">보조 패널 (고화질에서만 유리)</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="normal" />
                <StatusBadge status="caution" />
                <StatusBadge status="alarm" />
                <StatusBadge status="offline" />
              </div>
            </GlassPanel>
          </div>
          <div className="mt-3 flex max-w-md flex-col gap-2">
            <ToastCard tone="alarm" role="status" title="섹터 A1" onDismiss={() => {}}>
              적재율 95% 초과
            </ToastCard>
            <ToastCard tone="normal" title="압축기 · 시작">
              완료
            </ToastCard>
          </div>
        </section>

        <Card title="버튼과 대화상자">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">시작</Button>
            <Button>일시정지</Button>
            <Button variant="quiet">닫기</Button>
            <Button variant="primary" loading>
              보내는 중
            </Button>
            <Button disabled>권한 없음</Button>
            <Button onClick={() => setDialog(true)}>대화상자 열기</Button>
          </div>
        </Card>

        <Card title="글자">
          <p className="text-3xl font-bold">28.7 MPa · 지표 숫자</p>
          <p className="text-xl font-bold">화면 제목 — 스마트 폐지 처리 대시보드</p>
          <p className="text-base">본문 — 한빛자원 차량이 섹터 A1에 하역 중입니다.</p>
          <p className="text-sm text-ink-soft">보조 — 마지막 수신 14:23:11</p>
          <p className="text-xs text-ink-faint">주석 — 실제로 할 수 있는 조작은 서버가 다시 확인합니다.</p>
        </Card>
      </div>

      <Dialog
        open={dialog}
        title="운전 모드 전환"
        onClose={() => setDialog(false)}
        actions={
          <>
            <Button data-autofocus onClick={() => setDialog(false)}>
              취소
            </Button>
            <Button variant="primary" onClick={() => setDialog(false)}>
              확인
            </Button>
          </>
        }
      >
        보기용 대화상자입니다. 실제 명령은 보내지 않습니다.
      </Dialog>
    </div>
  );
}
