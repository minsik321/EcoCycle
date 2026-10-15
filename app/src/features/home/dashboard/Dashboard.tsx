import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TANK_IDS } from '@ecocycle/shared';
import type { CompressorState, TankId, TankState } from '@ecocycle/shared';
import { KpiCard } from '../../../components/common/KpiCard';
import { StatusBadge } from '../../../components/status/StatusBadge';
import { BAR_CLASS } from '../../../components/status/tone';
import { formatLocalClock, formatPercent, formatPressureMpa } from '../../../config/display';
import { devicePagePath, recordsPath } from '../../../config/navigation';
import { BATCH_STAGE_TEXT, SECTOR_LABEL, cycleSteps, mixText } from '../../../config/processDisplay';
import { useAppSelector } from '../../../store/hooks';
import { selectConnection, selectDevice, selectIsDisconnected, selectPlantSummary } from '../../../store/selectors';
import { usePlantTrends } from '../../../store/usePlantTrends';
import { HomeAlarms } from '../HomeAlarms';
import { currentBatch, recentActivity } from './dashboardData';

// 대시보드 홈: 3D 없이 빠르게 읽는 홈 화면. 폰 1단 → 태블릿 2단 → 데스크톱 3단.
// 값은 모두 store(서버 값)에서 온다. 연결이 끊기면 숫자는 "–"이고 마지막 수신 시각을 함께 적는다.
// three.js를 import하지 않는다(이 화면을 보는 동안 3D 묶음을 내려받지 않는다).

const oneDecimal = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const integer = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/** 대시보드의 카드 한 장 (디자인 토큰의 흰 카드) */
function Panel({ title, aside, className = '', children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={`min-w-0 rounded-card border border-line bg-surface p-4 shadow-soft-1 ${className}`}>
      <header className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <h2 className="truncate text-sm font-semibold whitespace-nowrap text-ink-soft">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** 카드 제목 줄 오른쪽의 "전체 보기" 링크 (공정 기록 화면으로). 터치 대상은 48px 이상 */
function SeeAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} aria-label={label} className="-my-2 -mr-2 inline-flex min-h-12 items-center rounded-control px-2 text-xs font-semibold whitespace-nowrap text-accent-strong active:bg-paper-deep">
      전체 보기
    </Link>
  );
}

/** 이름 · 값 한 줄. 같은 기준선에 맞추고 숫자는 고정 폭 숫자로 */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <dt className="shrink-0 text-sm whitespace-nowrap text-ink-soft">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function StatusSummary() {
  const summary = useAppSelector(selectPlantSummary);
  const { status, lastReceivedAt } = useAppSelector(selectConnection);
  const offline = status === 'offline';
  const connection =
    status === 'online' ? { text: '실시간', dot: 'bg-status-normal' } : status === 'connecting' ? { text: '연결 중', dot: 'bg-status-caution' } : { text: '연결 끊김', dot: 'bg-status-offline' };
  return (
    <section aria-label="상태 요약" className="min-w-0 rounded-card border border-line bg-surface px-4 py-3 shadow-soft-1 xl:col-span-3">
      <dl className="grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <dt className="text-xs whitespace-nowrap text-ink-soft">시스템</dt>
          <dd className="mt-1">{summary ? <StatusBadge status={offline ? 'offline' : summary.status} size="sm" /> : <span className="text-ink-faint">–</span>}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs whitespace-nowrap text-ink-soft">연결</dt>
          <dd className="mt-1 flex min-h-6 items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-ink">
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${connection.dot}`} />
            {connection.text}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs whitespace-nowrap text-ink-soft">{offline ? '마지막 수신' : '마지막 갱신'}</dt>
          <dd className="mt-1 min-h-6 text-sm font-semibold whitespace-nowrap text-ink tabular-nums">
            {(() => {
              const iso = offline ? lastReceivedAt : (summary?.updatedAt ?? null);
              return iso ? <time dateTime={iso}>{formatLocalClock(iso, true)}</time> : '–';
            })()}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Kpis() {
  const summary = useAppSelector(selectPlantSummary);
  const disconnected = useAppSelector(selectIsDisconnected);
  const { lastReceivedAt } = useAppSelector(selectConnection);
  const trends = usePlantTrends(!disconnected);
  const live = summary && !disconnected ? summary : null;
  const note = disconnected ? `연결 끊김 · 마지막 수신 ${formatLocalClock(lastReceivedAt)}` : '최근 24시간';
  return (
    <>
      <KpiCard glass={false} label="오늘 생산 베일" value={live ? integer.format(live.balesToday) : null} unit="개" trend={live ? trends.balesToday : undefined} note={note} />
      <KpiCard glass={false} label="평균 수분" value={live ? oneDecimal.format(live.averageMoisturePercent) : null} unit="%" trend={live ? trends.averageMoisturePercent : undefined} note={note} />
      <KpiCard glass={false} label="압축기 가동률" value={live ? oneDecimal.format(live.compressorUptimePercent) : null} unit="%" trend={live ? trends.compressorUptimePercent : undefined} note={note} />
    </>
  );
}

function SectorTile({ id }: { id: TankId }) {
  const device = useAppSelector(selectDevice(id));
  const disconnected = useAppSelector(selectIsDisconnected);
  const tank = device?.type === 'tank' ? (device as TankState) : null;
  const live = tank && !disconnected ? tank : null;
  const status = tank ? (disconnected ? 'offline' : tank.status) : 'offline';
  const level = live ? Math.min(100, Math.max(0, live.fillPercent)) : 0;
  return (
    <Link
      to={devicePagePath(id)}
      aria-label={`섹터 ${SECTOR_LABEL[id]} 페이지 열기`}
      className="flex min-h-12 min-w-0 flex-col gap-2 rounded-control border border-line bg-paper/50 p-3 active:bg-paper-deep"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-base font-bold whitespace-nowrap text-ink">{SECTOR_LABEL[id]}</span>
          {tank && <span className="text-xs whitespace-nowrap text-ink-soft">{tank.grade}등급</span>}
        </span>
        {tank ? <StatusBadge status={status} size="sm" /> : <span className="text-xs whitespace-nowrap text-ink-faint">불러오는 중</span>}
      </div>
      <div role="meter" aria-label={`섹터 ${SECTOR_LABEL[id]} 적재율`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level)} className="h-2 w-full overflow-hidden rounded-full bg-paper-deep">
        <div className={`h-full ${BAR_CLASS[status]}`} style={{ width: `${level}%` }} />
      </div>
      <div className="flex min-w-0 items-baseline justify-between gap-2 tabular-nums">
        <span className={`text-xl leading-none font-bold whitespace-nowrap ${live ? 'text-ink' : 'text-ink-faint'}`}>{live ? formatPercent(live.fillPercent) : '–'}</span>
        <span className="truncate text-xs whitespace-nowrap text-ink-soft">수분 {live ? formatPercent(live.moisturePercent) : '–'}</span>
      </div>
    </Link>
  );
}

function Sectors() {
  return (
    <Panel title="섹터" className="md:col-span-2" aside={<span className="text-xs whitespace-nowrap text-ink-faint">누르면 섹터 페이지</span>}>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {TANK_IDS.map((id) => (
          <SectorTile key={id} id={id} />
        ))}
      </div>
    </Panel>
  );
}

const MIX_COLOR = ['bg-accent', 'bg-kraft', 'bg-status-normal', 'bg-safety'] as const;

function BatchCard() {
  const batches = useAppSelector((state) => state.process.batches);
  const compressor = useAppSelector(selectDevice('compressor-1')) as CompressorState | undefined;
  const disconnected = useAppSelector(selectIsDisconnected);
  const batch = currentBatch(batches);
  const dash = (text: string) => (disconnected ? '–' : text);
  return (
    <Panel
      title="지금 배치"
      aside={
        <span className="flex shrink-0 items-center gap-2">
          {batch && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-accent-strong">{disconnected ? '연결 끊김' : BATCH_STAGE_TEXT[batch.stage]}</span>}
          <SeeAll to={recordsPath('batches')} label="배치 기록 전체 보기" />
        </span>
      }
    >
      {batch ? (
        <>
          <p className="truncate text-base font-bold text-ink">{batch.id}</p>
          <div aria-hidden="true" className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-paper-deep">
            {batch.mix.map((m, i) => (
              <div key={m.sectorId} className={MIX_COLOR[i % MIX_COLOR.length]} style={{ width: `${m.percent}%` }} />
            ))}
          </div>
          <dl className="mt-2">
            <Row label="배합" value={mixText(batch)} />
            <Row label="평균 수분" value={dash(formatPercent(batch.avgMoisturePercent))} />
            <Row label="목표 압력" value={dash(formatPressureMpa(batch.targetPressureMpa))} />
            <Row label="현재 압력" value={compressor && !disconnected ? formatPressureMpa(compressor.pressureMpa) : '–'} />
          </dl>
        </>
      ) : (
        <p className="text-sm text-ink-soft">진행 중인 배치가 없습니다.</p>
      )}
    </Panel>
  );
}

function Tracker() {
  const process = useAppSelector((state) => state.process);
  const disconnected = useAppSelector(selectIsDisconnected);
  const steps = cycleSteps(process);
  // 지금 단계: 진행 중인 칸 가운데 가장 뒤 칸 (끊기면 없음)
  const currentIndex = disconnected ? -1 : steps.reduce((last, s, i) => (s.active ? i : last), -1);
  const current = steps[currentIndex];
  return (
    <Panel
      title="공정 추적"
      className="md:col-span-2"
      aside={<span className="truncate text-xs font-semibold whitespace-nowrap text-ink-soft">{disconnected ? '연결 끊김' : current ? `지금 ${current.label}` : '대기'}</span>}
    >
      <ol className="grid grid-cols-1 gap-1 sm:grid-cols-6 sm:gap-2">
        {steps.map((s, i) => {
          const active = !disconnected && s.active;
          const done = !disconnected && i < currentIndex && !s.active;
          return (
            <li
              key={s.key}
              aria-current={i === currentIndex ? 'step' : undefined}
              className={`flex min-w-0 items-center gap-3 rounded-control px-2 py-1.5 sm:flex-col sm:items-center sm:gap-1 sm:px-1 sm:text-center ${active ? 'bg-accent-soft' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums ${
                  active ? 'bg-accent text-white' : done ? 'bg-accent-soft text-accent-strong' : 'bg-paper-deep text-ink-faint'
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 sm:flex-none">
                <span className={`block truncate text-sm font-semibold whitespace-nowrap ${active ? 'text-accent-strong' : 'text-ink'}`}>{s.label}</span>
                <span className="block truncate text-xs whitespace-nowrap text-ink-soft sm:hidden">{s.detail ?? '–'}</span>
              </span>
              <span className="shrink-0 text-xs whitespace-nowrap text-ink-faint tabular-nums">
                {active ? '진행 중' : s.at ? formatLocalClock(s.at) : '–'}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function Recent() {
  const { vehicles, bales } = useAppSelector((state) => state.process);
  const rows = recentActivity(vehicles, bales, 5);
  return (
    <Panel title="최근 차량·베일" aside={<SeeAll to={recordsPath('vehicles')} label="차량 기록 전체 보기" />}>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">아직 기록이 없습니다.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.key} className="flex min-w-0 items-center gap-3 border-b border-line py-2 last:border-b-0">
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper-deep text-xs font-bold text-ink-soft">
                {r.kind === 'vehicle' ? '차' : '베'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold whitespace-nowrap text-ink">{r.title}</span>
                {r.sub && <span className="block truncate text-xs whitespace-nowrap text-ink-soft">{r.sub}</span>}
              </span>
              <span className="shrink-0 rounded-full bg-paper-deep px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-soft">{r.stage}</span>
              <span className="shrink-0 text-right text-xs whitespace-nowrap text-ink-faint tabular-nums">{formatLocalClock(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * 대시보드 홈. 맨 위에 전환(3D | 대시보드)과 짧은 안내(3D를 못 쓸 때), 그 아래 열린 알람, 상태 요약, 지표 3장,
 * 섹터 4칸, 지금 배치, 6단계 공정 추적, 최근 차량·베일.
 */
export function Dashboard({ switcher, notice }: { switcher: ReactNode; notice?: string | null }) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-3">
      <h1 className="sr-only">홈</h1>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        {switcher}
        {notice && (
          <p role="status" className="min-w-0 text-xs text-ink-soft">
            {notice}
          </p>
        )}
      </div>
      <HomeAlarms />
      <div className="grid min-w-0 grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <StatusSummary />
        <Kpis />
        <Sectors />
        <BatchCard />
        <Tracker />
        <Recent />
      </div>
    </div>
  );
}
