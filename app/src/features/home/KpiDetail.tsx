import { useEffect, useState } from 'react';
import type { KpiHistoryResponse, KpiRange, PlantMetric } from '@ecocycle/shared';
import { getKpiHistory } from '../../api/process';
import { Dialog } from '../../components/common/Dialog';
import { KpiHistoryChart } from '../../components/charts/KpiHistoryChart';
import { KPI_DISPLAY, KPI_RANGES } from '../../config/kpi';
import { formatLocalTime } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectConnection, selectIsDisconnected } from '../../store/selectors';

/** 그래프 칸 높이 고정(KpiHistoryChart와 같다): 불러오기·빈 기간·오류에도 아래가 밀리지 않는다 */
const CHART_FRAME = 'flex h-60 items-center justify-center sm:h-72';

export function KpiDetail({ metric, onClose }: { metric: PlantMetric; onClose: () => void }) {
  const [range, setRange] = useState<KpiRange>('today');
  const [data, setData] = useState<KpiHistoryResponse>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const offline = useAppSelector(selectIsDisconnected);
  const { lastReceivedAt } = useAppSelector(selectConnection);
  const { label, unit } = KPI_DISPLAY[metric];
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    if (offline) { setLoading(false); setError(false); return; }
    const controller = new AbortController();
    setError(false); setLoading(true);
    getKpiHistory(metric, range, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [metric, range, retry, offline]);
  const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  return <Dialog open title={label} onClose={onClose} size="sheet" closeLabel="닫기">
    <p className="mb-4 text-xs text-ink-faint">생산 흐름을 한눈에</p>
    <div role="tablist" aria-label="KPI 조회 기간" className="mb-4 grid grid-cols-3 gap-1 rounded-control bg-paper p-1">
      {KPI_RANGES.map(r => <button key={r.value} type="button" role="tab" disabled={offline} aria-selected={range === r.value} onClick={() => setRange(r.value)} className={`min-h-12 rounded-control text-sm font-semibold ${range === r.value ? 'bg-surface text-accent-strong shadow-soft-1' : 'text-ink-soft'}`}>{r.label}</button>)}
    </div>
    {offline && <p role="status" className="mb-3 text-sm text-status-offline">연결 끊김 · 마지막 수신 {lastReceivedAt ? formatLocalTime(lastReceivedAt) : '–'}</p>}
    {error ? <div role="alert" className={`${CHART_FRAME} flex-col text-center text-sm`}>이력을 불러오지 못했습니다.<button type="button" onClick={() => setRetry(n => n + 1)} className="mx-auto mt-3 block min-h-12 rounded-control border border-line px-4">다시 시도</button></div> : <div aria-busy={loading}>
      {/* 기간 줄은 늘 한 줄 자리를 지키고, 불러오는 동안은 그 자리에 "불러오는 중…"을 쓴다. 그래프 칸은 높이가 고정이라 기간을 바꿔도 밀리지 않는다 */}
      <p className="mb-2 min-h-4 text-xs text-ink-faint" {...(loading ? { role: 'status' } : {})}>
        {loading ? '불러오는 중…' : data ? `${new Date(data.from).toLocaleDateString('ko-KR')} ~ ${new Date(data.to).toLocaleDateString('ko-KR')} · ${data.interval === '1h' ? '시간별' : '일별'} ${unit}` : ' '}
      </p>
      <div className={`${CHART_FRAME} ${loading ? 'opacity-50' : ''}`}>
        {data ? (data.points.length ? <div className="w-full min-w-0"><KpiHistoryChart history={data} /></div> : <p className="text-sm">이 기간에 기록이 없습니다</p>) : null}
      </div>
      <p className="mt-2 mb-5 min-h-4 text-xs text-ink-soft">{data ? (data.targetBand ? `목표 범위 ${data.targetBand.min}~${data.targetBand.max}% · 옅은 파랑 영역` : metric === 'compressorUptimePercent' ? '파랑: 가동 · 회색: 정지 (구간별 비율)' : '각 막대는 해당 구간에 생산한 베일 수입니다.') : ' '}</p>
      <dl className="grid grid-cols-3 gap-2 border-t border-line pt-4">
        {([['현재', data && !offline ? `${fmt(data.statistics.current)}${unit}` : '–'], ['평균', data ? `${fmt(data.statistics.average)}${unit}` : '–'], ['최소 / 최대', data ? `${fmt(data.statistics.min)} / ${fmt(data.statistics.max)}` : '–']]).map(([name, value]) => <div key={name} className="min-w-0"><dt className="text-xs text-ink-faint">{name}</dt><dd className="mt-1 whitespace-nowrap text-sm font-bold text-ink tabular-nums sm:text-lg">{value}</dd></div>)}
      </dl>
      <p className="mt-4 min-h-4 text-xs text-ink-faint">{data ? <>마지막 갱신 <time dateTime={data.updatedAt}>{formatLocalTime(data.updatedAt)}</time></> : ' '}</p>
    </div>}
  </Dialog>;
}
