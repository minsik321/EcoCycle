import type { AlarmListResponse, AlarmState } from '@ecocycle/shared';
import { request } from './http';

export interface AlarmQuery {
  state?: AlarmState;
  /** ISO 8601 UTC. 이 시각 이후의 알람 */
  from?: string;
}

export const getAlarms = (query: AlarmQuery = {}): Promise<AlarmListResponse> =>
  request<AlarmListResponse>('/alarms', { query: { ...query } });
