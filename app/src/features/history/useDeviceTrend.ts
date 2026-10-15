import { useEffect, useState } from 'react';
import type { DeviceId } from '@ecocycle/shared';
import { getHistory } from '../../api';

const DAY_MS = 24 * 3_600_000;
const REFRESH_MS = 5 * 60_000;

/**
 * 기기 페이지 주요 수치의 작은 추이선: `GET /devices/{id}/history`(최근 24시간, 1시간 간격)를 받아 그대로 쓴다.
 * 5분마다 다시 받고, 실패하면 추이선을 그리지 않는다(값 칸은 그대로). 끊긴 동안(enabled = false)에는 요청하지 않는다.
 * "자세히"의 이력 그래프(useHistoryWindow)와 따로 받는다: 그쪽은 열 때만 요청한다.
 */
export function useDeviceTrend(deviceId: DeviceId, metric: string, enabled: boolean): readonly number[] | undefined {
  const [trend, setTrend] = useState<readonly number[] | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const load = () => {
      const to = new Date();
      const from = new Date(to.getTime() - DAY_MS);
      getHistory({ deviceId, metric, from: from.toISOString(), to: to.toISOString(), interval: '1h' }, abort.signal)
        .then((res) => setTrend(res.points.map((p) => p.value)))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [deviceId, metric, enabled]);
  return trend;
}
