import type { PlantMetric } from '@ecocycle/shared';

export const KPI_DISPLAY: Record<PlantMetric, { label: string; unit: string }> = {
  balesToday: { label: '오늘 생산 베일', unit: '개' },
  averageMoisturePercent: { label: '평균 수분', unit: '%' },
  compressorUptimePercent: { label: '압축기 가동률', unit: '%' },
};
export const KPI_RANGES = [{ value: 'today', label: '오늘' }, { value: '7d', label: '7일' }, { value: '30d', label: '30일' }] as const;
