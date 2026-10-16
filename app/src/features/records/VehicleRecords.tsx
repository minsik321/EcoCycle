import type { VehicleRecord, VehicleRecordStatus } from '@ecocycle/shared';
import { getRecords } from '../../api';
import type { Column } from '../../components/common/DataTable';
import { RecordList } from '../../components/records/RecordList';
import { useOpenRecordPopup } from '../../components/records/recordPopup';
import { formatLocalTime, formatWeightT } from '../../config/display';
import { SECTOR_LABEL, VEHICLE_RECORD_STATUS_TEXT } from '../../config/processDisplay';

const pill = 'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap';

/** 상태 알약: 색만으로 구분하지 않고 글자(인식·하역·출차)를 적는다. 출차는 끝난 것이라 옅게 */
export function VehicleStatusPill({ status }: { status: VehicleRecordStatus }) {
  return <span className={`${pill} ${status === 'departed' ? 'bg-paper-deep text-ink-soft' : 'bg-accent-soft text-accent-strong'}`}>{VEHICLE_RECORD_STATUS_TEXT[status]}</span>;
}

const sectorOf = (r: VehicleRecord) => (r.sectorId ? SECTOR_LABEL[r.sectorId] : '–');
const weight = (value: number | null) => (value === null ? '–' : formatWeightT(value));
const num = (text: string) => <span className="tabular-nums">{text}</span>;

const COLUMNS: readonly Column<VehicleRecord>[] = [
  { key: 'out', header: '출차', hideOnNarrow: 'xl', cell: (r) => <span className="tabular-nums">{r.departedAt ? formatLocalTime(r.departedAt, false) : '–'}</span> },
  { key: 'plate', header: '번호판', cell: (r) => <span className="font-semibold">{r.plate ?? '인식 중'}</span> },
  { key: 'company', header: '회사', cell: (r) => r.companyName ?? '–' },
  { key: 'sector', header: '섹터', cell: (r) => sectorOf(r) },
  { key: 'gross', header: '총중량', align: 'right', hideOnNarrow: 'xl', cell: (r) => num(weight(r.grossT)) },
  { key: 'tare', header: '공차', align: 'right', hideOnNarrow: 'xl', cell: (r) => num(weight(r.tareT)) },
  { key: 'net', header: '순중량', align: 'right', cell: (r) => <span className="font-semibold tabular-nums">{weight(r.netT)}</span> },
  { key: 'status', header: '상태', cell: (r) => <VehicleStatusPill status={r.status} /> },
];

/**
 * 공정 기록의 "차량" 탭: 입·출차 시각, 번호판, 회사, 배정 섹터, 총중량·공차·순중량(t), 상태(인식·하역·출차).
 * 값은 모두 서버가 준다(`GET /vehicles/records`). 줄을 누르면 차량 팝업이 뜬다.
 */
export function VehicleRecords() {
  const open = useOpenRecordPopup();
  return (
    <RecordList<VehicleRecord>
      label="차량 기록"
      timeHeader="입차"
      load={(query, signal) => getRecords<VehicleRecord>('/vehicles/records', query, signal)}
      rowKey={(r) => r.id}
      time={(r) => r.arrivedAt}
      title={(r) => `${r.plate ?? '번호판 인식 중'}${r.companyName ? ` · ${r.companyName}` : ''}`}
      detail={(r) => (
        <>
          섹터 {sectorOf(r)} · {VEHICLE_RECORD_STATUS_TEXT[r.status]}
          {r.departedAt ? ` ${formatLocalTime(r.departedAt, false).slice(-5)}` : ''}
        </>
      )}
      extra={(r) => (
        <span className="tabular-nums">
          {r.netT === null || r.tareT === null ? (
            <>총 {weight(r.grossT)} · 공차·순중량은 출차 뒤</>
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
