import type { RecordPage, RecordQuery } from '@ecocycle/shared';
import { request } from './http';

/**
 * 기록 목록 한 쪽 (명세 6절 "기록 목록(페이지 나누기)"). 모든 `.../records` 엔드포인트가 같은 쿼리와 응답 모양을 쓴다.
 * 엔드포인트마다 함수를 따로 두지 않고 경로만 바꿔 부른다: `getRecords<VehicleRecord>('/vehicles/records', query)`.
 */
export const getRecords = <T>(path: string, query: RecordQuery, signal?: AbortSignal): Promise<RecordPage<T>> =>
  request<RecordPage<T>>(path, { query: { ...query }, ...(signal ? { signal } : {}) });
