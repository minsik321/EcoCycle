import { Card } from '../../components/common/Card';
import { TopCards } from '../../components/layout/TopCards';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { formatPercent } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectPlantSummary } from '../../store/selectors';
import { useDisplayStatus } from '../../components/status/useDisplayStatus';

/** 홈 상단 카드: 함수율(수분), 전체 적재율, 시스템 상태. 숫자는 카드마다 하나만 크게 보여 준다. */
export function SummaryCards() {
  const summary = useAppSelector(selectPlantSummary);
  const { disconnected, show } = useDisplayStatus();

  // 끊긴 동안의 숫자는 마지막으로 받은 값이라는 것을 흐리게 하고 글자로도 알린다
  const valueClass = `text-3xl font-bold ${disconnected ? 'text-slate-400' : 'text-slate-900'}`;
  const stale = disconnected && summary ? <span className="ml-2 text-xs font-medium text-slate-500">마지막 값</span> : null;

  return (
    <TopCards>
      <Card title="함수율(수분)" aria-label="함수율">
        <p className={valueClass}>
          {summary ? formatPercent(summary.averageMoisturePercent) : '–'}
          {stale}
        </p>
      </Card>
      <Card title="전체 적재율" aria-label="전체 적재율">
        <p className={valueClass}>
          {summary ? formatPercent(summary.totalFillPercent) : '–'}
          {stale}
        </p>
      </Card>
      <Card title="시스템 상태" aria-label="시스템 상태">
        {summary ? (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={show(summary.status)} className="text-base" />
            <span className="text-xs text-slate-500">
              갱신 <Timestamp iso={summary.updatedAt} />
            </span>
          </div>
        ) : (
          <p className="text-slate-500">불러오는 중…</p>
        )}
      </Card>
    </TopCards>
  );
}
