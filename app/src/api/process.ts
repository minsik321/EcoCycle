import type { KpiHistoryResponse, KpiRange, PlantHistoryResponse, PlantMetric, ProcessState } from '@ecocycle/shared';
import { request } from './http';

export const getKpiHistory = (metric: PlantMetric, range: KpiRange, signal?: AbortSignal) =>
  request<KpiHistoryResponse>('/plant/kpi-history', { query: { metric, range, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, signal });

/** 공정 흐름 현재 상태와 최근 목록 (연결·재연결 뒤 한 번 받아 맞춘다) */
export const getProcessState = (): Promise<ProcessState> => request<ProcessState>('/process/state');

export interface PlantHistoryQuery {
  metric: PlantMetric;
  /** ISO 8601 UTC */
  from: string;
  to: string;
  /** 예: 10m, 1h */
  interval: string;
}

/** 요약 값의 이력 (지표 카드의 작은 추이선용) */
export const getPlantHistory = (query: PlantHistoryQuery, signal?: AbortSignal): Promise<PlantHistoryResponse> =>
  request<PlantHistoryResponse>('/plant/history', { query: { ...query }, ...(signal ? { signal } : {}) });
