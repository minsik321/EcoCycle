import type { VehicleKind, VehicleRecord, VehicleRecordStatus } from '@ecocycle/shared';
import { getRecords } from '../../api';
import type { Column } from '../../components/common/DataTable';
import { RecordList } from '../../components/records/RecordList';
import { useOpenRecordPopup } from '../../components/records/recordPopup';
import { RECORD_SEARCH_HINT, formatLocalTime, formatWeightT } from '../../config/display';
import { SECTOR_LABEL, VEHICLE_KIND_LABEL, VEHICLE_RECORD_STATUS_TEXT, VEHICLE_WEIGHT_TEXT } from '../../config/processDisplay';

const pill = 'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap';

/** 상태 알약: 색만으로 구분하지 않고 글자(인식·하역·출차)를 적는다. 출차는 끝난 것이라 옅게 */
export function VehicleStatusPill({ status }: { status: VehicleRecordStatus }) {
  return <span className={`${pill} ${status === 'departed' ? 'bg-paper-deep text-ink-soft' : 'bg-accent-soft text-accent-strong'}`}>{VEHICLE_RECORD_STATUS_TEXT[status]}</span>;
}

/** 종류 알약 (입고 · 상차): 글자로 구분하고 테두리만 다르게 */
export function VehicleKindPill({ kind }: { kind: VehicleKind }) {
  return <span className={`${pill} border border-line text-ink-soft`}>{VEHICLE_KIND_LABEL[kind]}</span>;
}

/** 입고는 배정 섹터, 상차는 실은 베일 수 */
const targetOf = (r: VehicleRecord) => (r.kind === 'outbound' ? `베일 ${r.baleIds.length}개` : r.sectorId ? `섹터 ${SECTOR_LABEL[r.sectorId]}` : '섹터 –');
const targetCell = (r: VehicleRecord) => (r.kind === 'outbound' ? `베일 ${r.baleIds.length}개` : r.sectorId ? SECTOR_LABEL[r.sectorId] : '–');
const weight = (value: number | null) => (value === null ? '–' : formatWeightT(value));
const num = (text: string) => <span className="tabular-nums">{text}</span>;

const COLUMNS: readonly Column<VehicleRecord>[] = [
  { key: 'out', header: '출차', hideOnNarrow: 'xl', cell: (r) => <span className="tabular-nums">{r.departedAt ? formatLocalTime(r.departedAt, false) : '–'}</span> },
  { key: 'plate', header: '번호판', cell: (r) => <span className="font-semibold">{r.plate ?? '인식 중'}</span> },
  { key: 'company', header: '회사', cell: (r) => r.companyName ?? '–' },
  { key: 'kind', header: '종류', cell: (r) => <VehicleKindPill kind={r.kind} /> },
  { key: 'sector', header: '섹터·베일', cell: (r) => targetCell(r) },
  { key: 'gross', header: '총중량', align: 'right', hideOnNarrow: 'xl', cell: (r) => num(weight(r.grossT)) },
  { key: 'tare', header: '공차', align: 'right', hideOnNarrow: 'xl', cell: (r) => num(weight(r.tareT)) },
  { key: 'net', header: '순중량', align: 'right', cell: (r) => <span className="font-semibold tabular-nums">{weight(r.netT)}</span> },
  { key: 'status', header: '상태', cell: (r) => <VehicleStatusPill status={r.status} /> },
];

/**
 * 공정 기록의 "차량" 탭: 입·출차 시각, 번호판, 회사, 종류(입고·상차), 배정 섹터(입고) 또는 실은 베일 수(상차),
 * 총중량·공차·순중량(t), 상태(인식·하역·상차·출차 계근·출차).
 * 값은 모두 서버가 준다(`GET /vehicles/records`). 줄을 누르면 차량 팝업이 뜬다.
 */
export function VehicleRecords() {
  const open = useOpenRecordPopup();
  return (
    <RecordList<VehicleRecord>
      label="차량 기록"
      searchPlaceholder={RECORD_SEARCH_HINT.vehicles}
      timeHeader="입차"
      load={(query, signal) => getRecords<VehicleRecord>('/vehicles/records', query, signal)}
      rowKey={(r) => r.id}
      time={(r) => r.arrivedAt}
      title={(r) => `${r.plate ?? '번호판 인식 중'}${r.companyName ? ` · ${r.companyName}` : ''}`}
      detail={(r) => (
        <>
          {VEHICLE_KIND_LABEL[r.kind]} · {targetOf(r)} · {VEHICLE_RECORD_STATUS_TEXT[r.status]}
          {r.departedAt ? ` ${formatLocalTime(r.departedAt, false).slice(-5)}` : ''}
        </>
      )}
      extra={(r) => (
        <span className="tabular-nums">
          {r.netT === null ? (
            r.kind === 'inbound' ? (
              <>총 {weight(r.grossT)} · {VEHICLE_WEIGHT_TEXT.inbound.pendingShort}</>
            ) : (
              <>공차 {weight(r.tareT)} · {VEHICLE_WEIGHT_TEXT.outbound.pendingShort}</>
            )
          ) : (
            <>
              총 {weight(r.grossT)} − 공차 {weight(r.tareT)} = <span className="font-semibold text-ink">{weight(r.netT)}</span>
            </>
          )}
        </span>
      )}
      columns={COLUMNS}
      onOpen={(r) => open({ kind: 'vehicle', id: r.id })}
    />
  );
}
