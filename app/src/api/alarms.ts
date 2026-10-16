import type { AlarmListResponse, AlarmState } from '@ecocycle/shared';
import { request } from './http';

export interface AlarmQuery {
  state?: AlarmState;
  /** ISO 8601 UTC. 이 시각 이후의 알람 */
  from?: string;
  /** ISO 8601 UTC. 이 시각 전의 알람 (끝은 포함하지 않는다) */
  to?: string;
  /** 검색어: 기기 이름·알람 내용. 기간과 함께 적용된다 (서버가 거른다) */
  q?: string;
}

export const getAlarms = (query: AlarmQuery = {}): Promise<AlarmListResponse> =>
  request<AlarmListResponse>('/alarms', { query: { ...query } });
