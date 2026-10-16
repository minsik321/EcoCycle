import { Link } from 'react-router-dom';
import type { VehicleRecord, VehicleStage } from '@ecocycle/shared';
import { getVehicleRecord } from '../../api';
import { formatLocalTime, formatWeightT } from '../../config/display';
import { devicePagePath } from '../../config/navigation';
import { SECTOR_LABEL, VEHICLE_STAGE_TEXT } from '../../config/processDisplay';
import { DetailRow, DetailSection, RecordFrame } from './RecordDetail';
import { useRecord } from './useRecord';
import { VehicleStatusPill } from './VehicleRecords';

const STAGES: readonly VehicleStage[] = ['arrived', 'identified', 'unloading', 'unloaded', 'departed'];
/** 단계 시각 줄의 이름 (공정 흐름 문구와 같은 말을 쓰되 시각 줄이라 "…한 때"로 읽히게) */
const STAGE_ROW: Record<VehicleStage, string> = {
  arrived: '계중대 도착',
  identified: '번호판 인식',
  unloading: '하역 시작',
  unloaded: '하역 완료',
  departed: '출차',
};

const weight = (value: number | null) => (value === null ? '–' : formatWeightT(value));
const stamp = (iso: string | null | undefined) => (iso ? <time dateTime={iso}>{formatLocalTime(iso)}</time> : '–');

function Body({ record }: { record: VehicleRecord }) {
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-lg font-bold text-ink">{record.plate ?? '번호판 인식 중'}</p>
        <VehicleStatusPill status={record.status} />
      </div>
      <dl>
        <DetailRow label="회사">{record.companyName ?? '–'}</DetailRow>
        <DetailRow label="배정 섹터">
          {record.sectorId ? (
            <Link to={devicePagePath(record.sectorId)} className="inline-flex min-h-12 items-center text-accent-strong underline-offset-2 active:underline">
              섹터 {SECTOR_LABEL[record.sectorId]}
            </Link>
          ) : (
            '–'
          )}
        </DetailRow>
        <DetailRow label="입차">{stamp(record.arrivedAt)}</DetailRow>
        <DetailRow label="출차">{record.departedAt ? stamp(record.departedAt) : '아직 출차하지 않았습니다'}</DetailRow>
      </dl>
      <DetailSection title="계중대 무게">
        <dl>
          <DetailRow label="총중량 (입차)">{weight(record.grossT)}</DetailRow>
          <DetailRow label="공차 (출차)">{weight(record.tareT)}</DetailRow>
          <DetailRow label="순중량">{weight(record.netT)}</DetailRow>
        </dl>
        {record.netT === null && <p className="mt-1 pb-1 text-xs text-ink-faint">공차와 순중량은 출차 계량 뒤에 확정됩니다.</p>}
      </DetailSection>
      <DetailSection title="단계별 시각">
        <dl>
          {STAGES.map((stage) => (
            <DetailRow key={stage} label={STAGE_ROW[stage]}>
              {stamp(record.stageTimes[stage])}
            </DetailRow>
          ))}
        </dl>
        <p className="mt-1 pb-1 text-xs text-ink-faint">
          지금 단계: {VEHICLE_STAGE_TEXT[latestStage(record)]}. 번호판·회사·배정 섹터와 무게는 서버가 정한 값입니다.
        </p>
      </DetailSection>
    </>
  );
}

/** 시각이 찍힌 가장 뒤 단계 */
function latestStage(record: VehicleRecord): VehicleStage {
  return [...STAGES].reverse().find((stage) => record.stageTimes[stage]) ?? 'arrived';
}

/** 차량 기록 팝업의 본문 (`GET /vehicles/{id}`): 번호판·회사·배정 섹터, 입·출차, 총중량·공차·순중량, 단계별 시각 */
export function VehicleDetail({ id }: { id: string }) {
  const { state, retry } = useRecord(id, getVehicleRecord);
  return (
    <RecordFrame name="차량" state={state} retry={retry}>
      {(record) => <Body record={record} />}
    </RecordFrame>
  );
}
