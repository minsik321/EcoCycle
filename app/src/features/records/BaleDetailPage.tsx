import { Link, useParams } from 'react-router-dom';
import { getBaleDetail } from '../../api/batches';
import { Card } from '../../components/common/Card';
import { formatLocalTime, formatPercent, formatPressureMpa } from '../../config/display';
import { BALE_STAGE_TEXT, mixPercentText } from '../../config/processDisplay';
import { batchRecordPath } from '../../config/navigation';
import { DetailRow, RecordFrame } from './RecordDetail';
import { useRecord } from './useRecord';
/** 생산 당시 값은 스냅샷이며 배합 변경의 영향을 받지 않는다. */
export function BaleDetailPage() {
  const { id = '' } = useParams();
  const { state, retry } = useRecord(id, getBaleDetail);
  return (
    <RecordFrame tab="batches" name="베일" state={state} retry={retry}>
      {(bale) => (
        <Card title="베일 상세" aside={<span>{BALE_STAGE_TEXT[bale.stage]}</span>}>
          <p className="text-lg font-bold">{bale.id}</p>
          <dl>
            <DetailRow label="배치">
              <Link className="inline-flex min-h-12 items-center text-accent-strong" to={batchRecordPath(bale.batchId)}>
                {bale.batchId}
              </Link>
            </DetailRow>
            <DetailRow label="생산 시각">{formatLocalTime(bale.stageTimes.created ?? bale.updatedAt)}</DetailRow>
            <DetailRow label="사용 압력">{formatPressureMpa(bale.pressureMpa)}</DetailRow>
            <DetailRow label="평균 수분">{formatPercent(bale.avgMoisturePercent)}</DetailRow>
          </dl>
          <h3 className="mt-3 text-sm text-ink-soft">배합</h3>
          <p className="mt-2 text-sm font-semibold leading-relaxed">{mixPercentText(bale)}</p>
        </Card>
      )}
    </RecordFrame>
  );
}
