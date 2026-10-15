import type { TankId, UnloadRecord } from '@ecocycle/shared';
import { getRecords } from '../../api';
import type { Column } from '../../components/common/DataTable';
import { RecordList } from '../../components/records/RecordList';
import { formatFillChange, formatWeightT } from '../../config/display';

function FillChange({ record }: { record: UnloadRecord }) {
  const { range, delta } = formatFillChange(record.fillBeforePercent, record.fillAfterPercent);
  return (
    <span className="tabular-nums whitespace-nowrap">
      {range} <span className="font-semibold text-accent-strong">{delta}</span>
    </span>
  );
}

const num = (text: string) => <span className="tabular-nums">{text}</span>;

const COLUMNS: readonly Column<UnloadRecord>[] = [
  // 번호판 아래에 회사: 세로 태블릿에서 적재율 변화 칸까지 옆으로 넘치지 않게 한 칸에 두 줄로
  {
    key: 'vehicle',
    header: '차량',
    cell: (r) => (
      <span className="flex flex-col py-1 leading-tight">
        <span className="font-semibold">{r.plate}</span>
        <span className="text-xs text-ink-soft">{r.companyName}</span>
      </span>
    ),
  },
  { key: 'net', header: '순중량', align: 'right', cell: (r) => <span className="font-semibold tabular-nums">{formatWeightT(r.netT)}</span> },
  { key: 'gross', header: '총중량', align: 'right', hideOnNarrow: 'xl', cell: (r) => num(formatWeightT(r.grossT)) },
  { key: 'tare', header: '공차', align: 'right', hideOnNarrow: 'xl', cell: (r) => num(formatWeightT(r.tareT)) },
  { key: 'fill', header: '적재율 변화', align: 'right', cell: (r) => <FillChange record={r} /> },
];

/**
 * 섹터 페이지 맨 아래의 하역 기록: 차량마다 시각, 번호판, 회사, 계중대 순중량(t), 하역 전후 적재율.
 * 값은 모두 서버가 준다 (`GET /devices/{id}/unloads/records`, 명세 6절 "기록 목록").
 */
export function SectorUnloads({ id }: { id: TankId }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-soft-1">
      <h2 className="text-base font-semibold text-ink">
        하역 기록
      </h2>
      <RecordList<UnloadRecord>
        label="하역 기록"
        load={(query, signal) => getRecords<UnloadRecord>(`/devices/${id}/unloads/records`, query, signal)}
        rowKey={(r) => r.id}
        time={(r) => r.unloadedAt}
        title={(r) => `${r.plate} · ${r.companyName}`}
        detail={(r) => (
          <>
            순중량 <span className="font-semibold text-ink tabular-nums">{formatWeightT(r.netT)}</span> · <FillChange record={r} />
          </>
        )}
        columns={COLUMNS}
      />
    </div>
  );
}
