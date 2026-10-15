import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import type { BatchRecord } from '@ecocycle/shared';
import { getBatchRecord } from '../../api';
import { Card } from '../../components/common/Card';
import { formatLocalTime, formatPercent, formatPressureMpa } from '../../config/display';
import { mixPercentText } from '../../config/processDisplay';
import { BatchResultPill } from './BatchRecords';
import { DetailRow, RecordFrame } from './RecordDetail';
import { useRecord } from './useRecord';

const stamp = (iso: string | null) => (iso ? <time dateTime={iso}>{formatLocalTime(iso)}</time> : '–');

function Body({ record }: { record: BatchRecord }) {
  return (
    <>
      <Link to="/records/batches" className="inline-flex min-h-12 items-center text-accent-strong font-semibold">배치·베일 · 현재 배치 제어 →</Link>
      <Card aria-label="배치" title="배치" aside={<BatchResultPill result={record.result} />}>
        <p className="truncate text-lg font-bold text-ink">{record.id}</p>
        <dl className="mt-1">
          <DetailRow label="시작">{stamp(record.startedAt)}</DetailRow>
          <DetailRow label="종료">{record.endedAt ? stamp(record.endedAt) : '아직 끝나지 않았습니다'}</DetailRow>
          <DetailRow label="배합">{mixPercentText(record)}</DetailRow>
          <DetailRow label="평균 수분">{formatPercent(record.avgMoisturePercent)}</DetailRow>
          <DetailRow label="목표 압력">{formatPressureMpa(record.targetPressureMpa)}</DetailRow>
          <DetailRow label="실제 압력">{record.actualPressureMpa === null ? '–' : formatPressureMpa(record.actualPressureMpa)}</DetailRow>
        </dl>
      </Card>
      <Card aria-label="만든 베일" title={`만든 베일 ${record.balesProduced}개`}>
        {record.baleIds.length === 0 ? (
          <p className="text-sm text-ink-soft">이 배치에서 만든 베일이 없습니다.</p>
        ) : (
          <ul>
            {record.baleIds.map((baleId) => (
              <li key={baleId} className="border-b border-line py-2 text-sm font-semibold text-ink tabular-nums last:border-b-0">
                <Link className="inline-flex min-h-12 items-center text-accent-strong" to={`/records/bales/${encodeURIComponent(baleId)}`}>{baleId}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/**
 * 배치 기록 상세 (`/records/batches/:id`). 홈의 "이 배치 상세"와 배치 목록 줄이 여는 자리.
 * 과거 배치 스냅샷과 생산 베일 상세, 현재 배치 제어로 연결한다.
 */
export function BatchDetailPage() {
  const { id = '' } = useParams();
  const { state, retry } = useRecord(id, getBatchRecord);
  return (
    <RecordFrame tab="batches" name="배치" state={state} retry={retry}>
      {(record) => <Body record={record} />}
    </RecordFrame>
  );
}
