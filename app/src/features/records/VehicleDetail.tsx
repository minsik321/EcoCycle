import { Link } from 'react-router-dom';
import type { VehicleRecord, VehicleStage } from '@ecocycle/shared';
import { VEHICLE_STAGES_BY_KIND } from '@ecocycle/shared';
import { getVehicleRecord } from '../../api';
import type { PopupTarget } from '../../components/records/recordPopup';
import { formatLocalTime, formatWeightT } from '../../config/display';
import { devicePagePath } from '../../config/navigation';
import { SECTOR_LABEL, VEHICLE_KIND_LABEL, VEHICLE_STAGE_TEXT, VEHICLE_WEIGHT_TEXT } from '../../config/processDisplay';
import { DetailRow, DetailSection, RecordFrame } from './RecordDetail';
import { useRecord } from './useRecord';
import { VehicleKindPill, VehicleStatusPill } from './VehicleRecords';

/** 단계 시각 줄의 이름 (공정 흐름 문구와 같은 말을 쓰되 시각 줄이라 "…한 때"로 읽히게) */
const STAGE_ROW: Record<VehicleStage, string> = {
  arrived: '계중대 도착',
  identified: '번호판 인식',
  unloading: '하역 시작',
  unloaded: '하역 완료',
  loading: '상차 시작',
  loaded: '상차 완료',
  weighing_out: '출차 계근',
  departed: '출차',
};

const weight = (value: number | null) => (value === null ? '–' : formatWeightT(value));
const stamp = (iso: string | null | undefined) => (iso ? <time dateTime={iso}>{formatLocalTime(iso)}</time> : '–');
const linkButton = 'inline-flex min-h-12 shrink-0 items-center rounded-control px-2 text-sm font-semibold whitespace-nowrap text-accent-strong active:bg-paper-deep';

/** 상차 차량에 실은 베일: 개수와 베일마다 베일 팝업 링크 (서버 `baleIds`) */
function LoadedBales({ record, onOpen }: { record: VehicleRecord; onOpen: (target: PopupTarget) => void }) {
  return (
    <DetailSection title={`실은 베일 ${record.baleIds.length}개`}>
      {record.baleIds.length === 0 ? (
        <p className="pb-1 text-sm text-ink-soft">{record.status === 'departed' ? '실은 베일이 없습니다.' : '아직 실은 베일이 없습니다.'}</p>
      ) : (
        <ul>
          {record.baleIds.map((baleId) => (
            <li key={baleId} className="flex min-w-0 items-center justify-between gap-3 border-b border-line py-1 last:border-b-0">
              <span className="min-w-0 truncate text-sm font-semibold text-ink tabular-nums">{baleId}</span>
              <button type="button" onClick={() => onOpen({ kind: 'bale', id: baleId })} aria-label={`베일 ${baleId} 보기`} className={linkButton}>
                베일 보기 →
              </button>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

function Body({ record, onOpen }: { record: VehicleRecord; onOpen: (target: PopupTarget) => void }) {
  const stages = VEHICLE_STAGES_BY_KIND[record.kind];
  const text = VEHICLE_WEIGHT_TEXT[record.kind];
  // 들어올 때 잰 값이 먼저, 출차 계근에서 잰 값이 뒤 (입고: 총중량 → 공차, 상차: 공차 → 총중량)
  const rows = record.kind === 'inbound'
    ? [{ label: text.first, value: record.grossT }, { label: text.second, value: record.tareT }]
    : [{ label: text.first, value: record.tareT }, { label: text.second, value: record.grossT }];
  const latest = [...stages].reverse().find((stage) => record.stageTimes[stage]) ?? 'arrived';
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-lg font-bold text-ink">{record.plate ?? '번호판 인식 중'}</p>
        <span className="flex shrink-0 items-center gap-1.5">
          <VehicleKindPill kind={record.kind} />
          <VehicleStatusPill status={record.status} />
        </span>
      </div>
      <dl>
        <DetailRow label="종류">{VEHICLE_KIND_LABEL[record.kind]}</DetailRow>
        <DetailRow label="회사">{record.companyName ?? '–'}</DetailRow>
        {record.kind === 'inbound' && (
          <DetailRow label="배정 섹터">
            {record.sectorId ? (
              <Link to={devicePagePath(record.sectorId)} className="inline-flex min-h-12 items-center text-accent-strong underline-offset-2 active:underline">
                섹터 {SECTOR_LABEL[record.sectorId]}
              </Link>
            ) : (
              '–'
            )}
          </DetailRow>
        )}
        <DetailRow label="입차">{stamp(record.arrivedAt)}</DetailRow>
        <DetailRow label="출차">{record.departedAt ? stamp(record.departedAt) : '아직 출차하지 않았습니다'}</DetailRow>
      </dl>
      {record.kind === 'outbound' && <LoadedBales record={record} onOpen={onOpen} />}
      <DetailSection title="계중대 무게">
        <dl>
          {rows.map((row) => (
            <DetailRow key={row.label} label={row.label}>
              {weight(row.value)}
            </DetailRow>
          ))}
          <DetailRow label="순중량">{weight(record.netT)}</DetailRow>
        </dl>
        {record.netT === null && <p className="mt-1 pb-1 text-xs text-ink-faint">{text.pending}</p>}
      </DetailSection>
      <DetailSection title="단계별 시각">
        <dl>
          {stages.map((stage) => (
            <DetailRow key={stage} label={STAGE_ROW[stage]}>
              {stamp(record.stageTimes[stage])}
            </DetailRow>
          ))}
        </dl>
        <p className="mt-1 pb-1 text-xs text-ink-faint">
          지금 단계: {VEHICLE_STAGE_TEXT[latest]}. 번호판·회사·{record.kind === 'inbound' ? '배정 섹터와' : '실은 베일과'} 무게는 서버가 정한 값입니다.
        </p>
      </DetailSection>
    </>
  );
}

/**
 * 차량 기록 팝업의 본문 (`GET /vehicles/{id}`): 종류(입고·상차), 번호판·회사, 입고는 배정 섹터·상차는 실은 베일(베일 팝업으로 이어 열기),
 * 입·출차, 계중대 무게 셋(들어올 때 잰 값 → 출차 계근 값 → 순중량), 종류별 단계 시각
 */
export function VehicleDetail({ id, onOpen }: { id: string; onOpen: (target: PopupTarget) => void }) {
  const { state, retry } = useRecord(id, getVehicleRecord);
  return (
    <RecordFrame name="차량" state={state} retry={retry}>
      {(record) => <Body record={record} onOpen={onOpen} />}
    </RecordFrame>
  );
}
