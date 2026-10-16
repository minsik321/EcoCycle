import { Link } from 'react-router-dom';
import type { BatchRecord } from '@ecocycle/shared';
import { getBatchRecord } from '../../api';
import type { PopupTarget } from '../../components/records/recordPopup';
import { formatLocalTime, formatPercent, formatPressureMpa } from '../../config/display';
import { batchBalePath } from '../../config/navigation';
import { mixPercentText } from '../../config/processDisplay';
import { BatchResultPill } from './BatchRecords';
import { DetailRow, DetailSection, RecordFrame } from './RecordDetail';
import { useRecord } from './useRecord';

const stamp = (iso: string | null) => (iso ? <time dateTime={iso}>{formatLocalTime(iso)}</time> : '–');

function Body({ record, onOpen }: { record: BatchRecord; onOpen: (target: PopupTarget) => void }) {
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-lg font-bold text-ink">{record.id}</p>
        <BatchResultPill result={record.result} />
      </div>
      <dl>
        <DetailRow label="시작">{stamp(record.startedAt)}</DetailRow>
        <DetailRow label="종료">{record.endedAt ? stamp(record.endedAt) : '아직 끝나지 않았습니다'}</DetailRow>
        <DetailRow label="배합">{mixPercentText(record)}</DetailRow>
        <DetailRow label="평균 수분">{formatPercent(record.avgMoisturePercent)}</DetailRow>
        <DetailRow label="목표 압력">{formatPressureMpa(record.targetPressureMpa)}</DetailRow>
        <DetailRow label="실제 압력">{record.actualPressureMpa === null ? '–' : formatPressureMpa(record.actualPressureMpa)}</DetailRow>
      </dl>
      <DetailSection title={`만든 베일 ${record.balesProduced}개`}>
        {record.baleIds.length === 0 ? (
          <p className="pb-1 text-sm text-ink-soft">이 배치에서 만든 베일이 없습니다.</p>
        ) : (
          <ul>
            {record.baleIds.map((baleId) => (
              <li key={baleId} className="flex min-w-0 items-center justify-between gap-3 border-b border-line py-1 last:border-b-0">
                <span className="min-w-0 truncate text-sm font-semibold text-ink tabular-nums">{baleId}</span>
                <button
                  type="button"
                  onClick={() => onOpen({ kind: 'bale', id: baleId })}
                  aria-label={`베일 ${baleId} 보기`}
                  className="inline-flex min-h-12 shrink-0 items-center rounded-control px-2 text-sm font-semibold whitespace-nowrap text-accent-strong active:bg-paper-deep"
                >
                  베일 보기 →
                </button>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
      <Link to={batchBalePath} className="inline-flex min-h-12 items-center self-start text-sm font-semibold text-accent-strong">
        배치·베일 · 현재 배치 제어 →
      </Link>
    </>
  );
}

/**
 * 배치 기록 팝업의 본문 (`GET /batches/{id}`): 과거 배치 스냅샷과 만든 베일. "베일 보기"는 그 베일 팝업을 연다(이 팝업은 바로 전 팝업으로 남는다).
 */
export function BatchDetail({ id, onOpen }: { id: string; onOpen: (target: PopupTarget) => void }) {
  const { state, retry } = useRecord(id, getBatchRecord);
  return (
    <RecordFrame name="배치" state={state} retry={retry}>
      {(record) => <Body record={record} onOpen={onOpen} />}
    </RecordFrame>
  );
}
