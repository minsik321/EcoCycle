import type { PickRecord } from '@ecocycle/shared';
import { getRecords } from '../../api';
import { Card } from '../../components/common/Card';
import type { Column } from '../../components/common/DataTable';
import { RecordList } from '../../components/records/RecordList';
import { DEVICE_NAMES, ROBOT_MODE_TEXT, formatPickVolumeM3 } from '../../config/display';

const destination = (r: PickRecord) => `컨베이어 → ${r.batchId ?? '배치 미배정'}`;
const columns: readonly Column<PickRecord>[] = [
  { key: 'mode', header: '모드', cell: r => <span className="text-xs">{ROBOT_MODE_TEXT[r.mode]}</span> },
  { key: 'sector', header: '섹터', cell: r => DEVICE_NAMES[r.sectorId].replace('섹터 ', '') },
  { key: 'volume', header: '집은 양', align: 'right', cell: r => <span className="tabular-nums whitespace-nowrap">{formatPickVolumeM3(r.volumeM3)}</span> },
  { key: 'destination', header: '도착지', cell: r => <span className="flex flex-col py-1 text-xs"><span>컨베이어 →</span><span>{r.batchId ?? '배치 미배정'}</span></span> },
];
export function PickRecords({ revision }: { revision: number }) {
  return <Card title="집기 기록">
    <RecordList<PickRecord> label="집기 기록" dense compactTime refreshToken={String(revision)}
      load={(query, signal) => getRecords<PickRecord>('/robots/robot-1/picks/records', query, signal)}
      rowKey={r => r.id} time={r => r.pickedAt}
      title={r => `${ROBOT_MODE_TEXT[r.mode]} · ${DEVICE_NAMES[r.sectorId]}`}
      detail={r => `집은 양 ${formatPickVolumeM3(r.volumeM3)}`} extra={destination} columns={columns} />
  </Card>;
}
