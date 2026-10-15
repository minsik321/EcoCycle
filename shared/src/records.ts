import type { IsoTimestamp } from './common';
import type { TankId } from './ids';

/*
 * 기록 목록 (명세 6절 "기록 목록(페이지 나누기)").
 * 차량·하역·로봇 집기 같은 지난 기록을 보여 주는 모든 `GET .../records` 엔드포인트가 같은 요청·응답 모양을 쓴다.
 *   GET .../records?from=...&to=...&page=1&pageSize=10
 *   → { items, total, page, pageSize }
 * ⚠ 프론트 제안안이다 (서버 담당 확인 전, `docs/questions.md` B29).
 */

/** 한 쪽의 줄 수 기본값. 화면은 10줄씩 넘긴다 */
export const RECORD_PAGE_SIZE = 10;
/** 서버가 받는 한 쪽 줄 수의 상한(제안). 넘으면 422 */
export const RECORD_MAX_PAGE_SIZE = 100;

/** 기록 목록 요청 (쿼리 문자열) */
export interface RecordQuery {
  /** 구간 시작(포함), ISO 8601 UTC */
  from: IsoTimestamp;
  /** 구간 끝(제외), ISO 8601 UTC */
  to: IsoTimestamp;
  /** 1부터 센다 */
  page: number;
  pageSize: number;
}

/**
 * 기록 목록 응답. `items`는 최신 기록이 먼저(시각 내림차순)이고, `total`은 구간 안 전체 건수다.
 * 구간 밖의 쪽(page > 전체 쪽 수)을 요청하면 `items`는 빈 배열이다(오류가 아니다).
 */
export interface RecordPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 전체 쪽 수 (기록이 없으면 0) */
export function recordPageCount(total: number, pageSize: number): number {
  return pageSize > 0 ? Math.ceil(total / pageSize) : 0;
}

/**
 * 섹터 하역 기록 한 줄 — GET /devices/{tankId}/unloads/records (명세 6절 "기록 목록").
 * 차량이 섹터에 하역하고 출차 계량을 마치면 한 줄이 생긴다. 기록 시각은 `unloadedAt`.
 * 무게는 계중대 값(t)이고 세 값을 모두 둔다(명세 6절 "공통 규칙"의 양의 기준). 순중량은 서버가 계산한다.
 * ⚠ 프론트 제안 형식이다 (`docs/questions.md` B30).
 */
export interface UnloadRecord {
  id: string;
  vehicleId: string;
  sectorId: TankId;
  plate: string;
  companyName: string;
  /** 하역 완료 시각 */
  unloadedAt: IsoTimestamp;
  /** 입차 총중량 t */
  grossT: number;
  /** 출차 공차 t */
  tareT: number;
  /** 순중량 t (grossT − tareT) */
  netT: number;
  /** 하역 직전 섹터 적재율 % */
  fillBeforePercent: number;
  /** 하역 직후 섹터 적재율 % */
  fillAfterPercent: number;
}
