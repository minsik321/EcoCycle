import type { PlantMetric } from './process';
import type { HistoryPoint } from './devices';

/** ⚠ 7단위 KPI 상세 계약 제안안. 시각은 UTC, 집계 경계만 요청 timeZone 기준. */
export type KpiRange = 'today' | '7d' | '30d';
export interface KpiHistoryResponse {
  metric: PlantMetric;
  range: KpiRange;
  from: string;
  to: string;
  interval: '1h' | '1d';
  points: (HistoryPoint & { runningMinutes?: number; stoppedMinutes?: number })[];
  statistics: { current: number; average: number; min: number; max: number };
  targetBand: { min: number; max: number } | null;
  updatedAt: string;
}
