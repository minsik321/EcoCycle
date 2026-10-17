import { useEffect, useState } from 'react';
import { PLANT_METRICS } from '@ecocycle/shared';
import type { PlantMetric } from '@ecocycle/shared';
import { getPlantHistory } from '../api';

const DAY_MS = 24 * 3_600_000;
const REFRESH_MS = 5 * 60_000;

export type PlantTrends = Partial<Record<PlantMetric, readonly number[]>>;

/**
 * 지표 카드의 작은 추이선: 서버의 `GET /plant/history`(최근 24시간, 1시간 간격)를 받아 그대로 쓴다.
 * 5분마다 다시 받고, 실패한 지표는 그리지 않는다. 끊긴 동안(enabled = false)에는 요청하지 않는다.
 * 3D 홈과 대시보드가 함께 쓴다.
 */
export function usePlantTrends(enabled: boolean): PlantTrends {
  const [trends, setTrends] = useState<PlantTrends>({});
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const load = () => {
      const to = new Date();
      const from = new Date(to.getTime() - DAY_MS);
      PLANT_METRICS.forEach((metric: PlantMetric) => {
        getPlantHistory({ metric, from: from.toISOString(), to: to.toISOString(), interval: '1h' }, abort.signal)
          .then((res) => setTrends((prev) => ({ ...prev, [metric]: res.points.map((p) => p.value) })))
          .catch(() => undefined);
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [enabled]);
  return trends;
}
