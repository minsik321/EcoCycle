import { getBaleDetail } from '../../api/batches';
import type { PopupTarget } from '../../components/records/recordPopup';
import { formatLocalTime, formatPercent, formatPressureMpa } from '../../config/display';
import { mixPercentText } from '../../config/processDisplay';
import { BaleStagePill } from './BaleRecords';
import { DetailRow, DetailSection, RecordFrame } from './RecordDetail';
import { useRecord } from './useRecord';

const stamp = (iso: string | undefined) => (iso ? <time dateTime={iso}>{formatLocalTime(iso)}</time> : '–');

/**
 * 베일 팝업의 본문 (`GET /bales/{id}`): 생산 당시 압력·수분·배합 스냅샷(배합 변경의 영향을 받지 않는다), 적치·출하 상태.
 * "배치 보기"는 그 배치 팝업을 연다(이 팝업은 바로 전 팝업으로 남는다).
 */
export function BaleDetail({ id, onOpen }: { id: string; onOpen: (target: PopupTarget) => void }) {
  const { state, retry } = useRecord(id, getBaleDetail);
  return (
    <RecordFrame name="베일" state={state} retry={retry}>
      {(bale) => (
        <>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-lg font-bold text-ink tabular-nums">{bale.id}</p>
            <BaleStagePill stage={bale.stage} />
          </div>
          <dl>
            <DetailRow label="배치">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="truncate">{bale.batchId}</span>
                <button
                  type="button"
                  onClick={() => onOpen({ kind: 'batch', id: bale.batchId })}
                  aria-label={`배치 ${bale.batchId} 보기`}
                  className="inline-flex min-h-12 shrink-0 items-center rounded-control px-2 text-sm font-semibold whitespace-nowrap text-accent-strong active:bg-paper-deep"
                >
                  배치 보기 →
                </button>
              </span>
            </DetailRow>
            <DetailRow label="생산 시각">{stamp(bale.stageTimes.created ?? bale.updatedAt)}</DetailRow>
            <DetailRow label="출하 시각">{bale.stageTimes.shipped ? stamp(bale.stageTimes.shipped) : '아직 출하하지 않았습니다'}</DetailRow>
            <DetailRow label="사용 압력">{formatPressureMpa(bale.pressureMpa)}</DetailRow>
            <DetailRow label="평균 수분">{formatPercent(bale.avgMoisturePercent)}</DetailRow>
          </dl>
          <DetailSection title="배합 (생산 당시)">
            <p className="pb-1 text-sm font-semibold leading-relaxed text-ink">{mixPercentText(bale)}</p>
          </DetailSection>
        </>
      )}
    </RecordFrame>
  );
}
