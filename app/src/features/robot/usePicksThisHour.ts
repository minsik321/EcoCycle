import { useEffect, useState } from 'react';
import type { PickRecord } from '@ecocycle/shared';
import { getRecords } from '../../api';

/** 시각이 바뀌어 새 시간대가 시작됐는지 보는 간격 */
const CLOCK_CHECK_MS = 30_000;

/** 지금 시간대의 시작(현지 시각 정각) */
const hourStart = (now: number) => {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

/**
 * 이번 시간(현지 정각부터 지금까지) 집기 횟수. 서버의 집기 기록 목록(`GET /robots/robot-1/picks/records`)에
 * 이 구간을 한 줄만 달라고 하고 응답의 `total`(서버가 센 줄 수)을 그대로 쓴다. 화면이 기록을 세지 않는다.
 * 새 집기가 기록되면(`pickRecordsRevision`), 정각이 지나면, 다시 연결되면 다시 받는다. 끊긴 동안은 요청하지 않는다.
 * 받기 전이나 실패하면 null.
 */
export function usePicksThisHour(revision: number, enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  const [hour, setHour] = useState(() => hourStart(Date.now()));

  useEffect(() => {
    const timer = setInterval(() => setHour(hourStart(Date.now())), CLOCK_CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const from = new Date(hour).toISOString();
    const to = new Date(Math.max(Date.now(), hour) + 1_000).toISOString();
    getRecords<PickRecord>('/robots/robot-1/picks/records', { from, to, page: 1, pageSize: 1 }, abort.signal)
      .then((page) => setCount(page.total))
      .catch(() => {
        if (!abort.signal.aborted) setCount(null);
      });
    return () => abort.abort();
  }, [revision, hour, enabled]);

  return count;
}
