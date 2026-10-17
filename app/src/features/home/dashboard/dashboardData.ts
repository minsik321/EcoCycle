import type { Bale, Batch, Vehicle } from '@ecocycle/shared';
import { BALE_STAGE_TEXT, VEHICLE_STAGE_TEXT, shortId } from '../../../config/processDisplay';

// 대시보드가 store 값에서 고르는 것. 값을 만들지 않고 서버가 준 목록에서 고르기·정렬만 한다.

const newest = <T extends { updatedAt: string }>(list: readonly T[], test: (item: T) => boolean = () => true): T | undefined => {
  let found: T | undefined;
  for (const item of list) if (test(item) && (!found || item.updatedAt >= found.updatedAt)) found = item;
  return found;
};

/** 지금 배치: 배합·압축 중인 것 → 없으면 계획된 것 → 없으면 가장 최근 것 */
export function currentBatch(batches: readonly Batch[]): Batch | undefined {
  return (
    newest(batches, (b) => b.stage === 'mixing' || b.stage === 'compressing') ??
    newest(batches, (b) => b.stage === 'planned') ??
    newest(batches)
  );
}

export interface ActivityRow {
  key: string;
  kind: 'vehicle' | 'bale';
  /** 차량·베일 ID (누르면 그 기록 팝업) */
  id: string;
  /** 번호판 또는 베일 번호 */
  title: string;
  /** 회사 이름 등 (없으면 null) */
  sub: string | null;
  stage: string;
  /** 이 대상의 마지막 갱신 시각 (서버 값) */
  at: string;
}

/** 최근 차량·베일을 시각이 늦은 것부터 섞어 count개 */
export function recentActivity(vehicles: readonly Vehicle[], bales: readonly Bale[], count = 5): ActivityRow[] {
  const rows: ActivityRow[] = [
    ...vehicles.map((v) => ({
      key: `veh:${v.id}`,
      kind: 'vehicle' as const,
      id: v.id,
      title: v.plate ?? '번호판 인식 전',
      sub: v.companyName,
      stage: VEHICLE_STAGE_TEXT[v.stage],
      at: v.updatedAt,
    })),
    ...bales.map((b) => ({
      key: `bale:${b.id}`,
      kind: 'bale' as const,
      id: b.id,
      title: `베일 ${shortId(b.id)}`,
      sub: null,
      stage: BALE_STAGE_TEXT[b.stage],
      at: b.updatedAt,
    })),
  ];
  return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, count);
}
