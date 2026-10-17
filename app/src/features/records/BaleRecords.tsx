import type { BaleRecord, BaleStage } from '@ecocycle/shared';
import { getRecords } from '../../api';
import type { Column } from '../../components/common/DataTable';
import { RecordList } from '../../components/records/RecordList';
import { useOpenRecordPopup } from '../../components/records/recordPopup';
import { RECORD_SEARCH_HINT, formatPercent, formatPressureMpa } from '../../config/display';
import { BALE_STAGE_TEXT, shortId } from '../../config/processDisplay';

const pill = 'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap';

/** 상태 알약: 글자(적치·출하)를 적는다. 출하는 끝난 것이라 옅게 */
export function BaleStagePill({ stage }: { stage: BaleStage }) {
  return <span className={`${pill} ${stage === 'shipped' ? 'bg-paper-deep text-ink-soft' : 'bg-accent-soft text-accent-strong'}`}>{BALE_STAGE_TEXT[stage]}</span>;
}

const COLUMNS: readonly Column<BaleRecord>[] = [
  { key: 'id', header: '베일', cell: (r) => <span className="font-semibold tabular-nums">{r.id}</span> },
  { key: 'batch', header: '배치', cell: (r) => <span title={r.batchId}>{shortId(r.batchId)}</span> },
  { key: 'pressure', header: '압력', align: 'right', cell: (r) => <span className="tabular-nums">{formatPressureMpa(r.pressureMpa)}</span> },
  { key: 'moisture', header: '평균 수분', align: 'right', cell: (r) => <span className="tabular-nums">{formatPercent(r.avgMoisturePercent)}</span> },
  { key: 'stage', header: '상태', cell: (r) => <BaleStagePill stage={r.stage} /> },
];

/**
 * 공정 기록의 "베일" 탭: 베일 ID, 생산 시각, 배치, 압력, 평균 수분, 상태(적치·출하).
 * 값은 모두 서버가 준다(`GET /bales/records`). 줄을 누르면 베일 팝업이 뜬다.
 */
export function BaleRecords() {
  const open = useOpenRecordPopup();
  return (
    <RecordList<BaleRecord>
      label="베일 기록"
      searchPlaceholder={RECORD_SEARCH_HINT.bales}
      timeHeader="생산"
      load={(query, signal) => getRecords<BaleRecord>('/bales/records', query, signal)}
      rowKey={(r) => r.id}
      time={(r) => r.createdAt}
      title={(r) => `${r.id} · ${BALE_STAGE_TEXT[r.stage]}`}
      detail={(r) => (
        <span className="tabular-nums">
          배치 {shortId(r.batchId)} · {formatPressureMpa(r.pressureMpa)} · 수분 {formatPercent(r.avgMoisturePercent)}
        </span>
      )}
      columns={COLUMNS}
      onOpen={(r) => open({ kind: 'bale', id: r.id })}
    />
  );
}
