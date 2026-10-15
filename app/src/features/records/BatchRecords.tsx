import { useNavigate } from 'react-router-dom';
import type { BatchRecord, BatchResult } from '@ecocycle/shared';
import { getRecords } from '../../api';
import type { Column } from '../../components/common/DataTable';
import { RecordList } from '../../components/records/RecordList';
import { formatLocalTime, formatPercent, formatPressureMpa } from '../../config/display';
import { batchRecordPath } from '../../config/navigation';
import { batchResultText, mixPercentText, shortId } from '../../config/processDisplay';

const pill = 'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap';

/** 결과 알약: 글자(완료·건너뜀·일시정지됨·진행 중)를 적고, 멈춘 결과는 주의 색 테두리를 더한다 */
export function BatchResultPill({ result }: { result: BatchResult | null }) {
  const tone =
    result === null
      ? 'bg-accent-soft text-accent-strong'
      : result === 'completed'
        ? 'bg-paper-deep text-ink-soft'
        : 'border border-status-caution/60 bg-status-caution/10 text-ink';
  return <span className={`${pill} ${tone}`}>{batchResultText(result)}</span>;
}

const MPA = ' MPa';
const pressure = (value: number | null) => (value === null ? '–' : formatPressureMpa(value).replace(MPA, ''));
/** 목표 → 실제 (실제가 아직 없으면 –). 단위 MPa는 머리글·줄 끝에 한 번만 적는다 */
const pressureText = (r: BatchRecord) => `${pressure(r.targetPressureMpa)} → ${pressure(r.actualPressureMpa)}`;
const balesText = (r: BatchRecord) => (r.balesProduced > 0 ? `${r.balesProduced}개` : '–');

const COLUMNS: readonly Column<BatchRecord>[] = [
  { key: 'end', header: '종료', hideOnNarrow: 'xl', cell: (r) => <span className="tabular-nums">{r.endedAt ? formatLocalTime(r.endedAt, false) : '–'}</span> },
  { key: 'id', header: '배치', cell: (r) => <span className="font-semibold" title={r.id}>{shortId(r.id)}</span> },
  { key: 'mix', header: '배합', cell: (r) => mixPercentText(r) },
  { key: 'moisture', header: '평균 수분', align: 'right', hideOnNarrow: 'xl', cell: (r) => <span className="tabular-nums">{formatPercent(r.avgMoisturePercent)}</span> },
  { key: 'pressure', header: '압력 목표→실제 (MPa)', align: 'right', cell: (r) => <span className="tabular-nums">{pressureText(r)}</span> },
  { key: 'result', header: '결과', cell: (r) => <BatchResultPill result={r.result} /> },
  { key: 'bales', header: '베일', align: 'right', cell: (r) => <span className="tabular-nums">{balesText(r)}</span> },
];

/**
 * 공정 기록의 "배치" 탭: 배치 번호, 시작·종료 시각, 배합(섹터 %), 평균 수분, 목표·실제 압력, 결과(완료·건너뜀·일시정지됨), 만든 베일.
 * 값은 모두 서버가 준다(`GET /batches/records`). 줄을 누르면 배치 상세로 간다.
 */
export function BatchRecords() {
  const navigate = useNavigate();
  return (
    <RecordList<BatchRecord>
      label="배치 기록"
      timeHeader="시작"
      load={(query, signal) => getRecords<BatchRecord>('/batches/records', query, signal)}
      rowKey={(r) => r.id}
      time={(r) => r.startedAt}
      title={(r) => `${r.id} · ${batchResultText(r.result)}`}
      detail={(r) => (
        <>
          {mixPercentText(r)} · 수분 {formatPercent(r.avgMoisturePercent)}
        </>
      )}
      extra={(r) => (
        <span className="tabular-nums">
          압력 {pressureText(r)} MPa · 베일 {balesText(r)}
        </span>
      )}
      columns={COLUMNS}
      dense
      onOpen={(r) => navigate(batchRecordPath(r.id))}
    />
  );
}
