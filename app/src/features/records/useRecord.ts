import { useEffect, useState } from 'react';
import { ApiError } from '../../api';

export type RecordState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'missing' } | { status: 'error' };

/**
 * 기록 한 건을 id로 받는다 (차량·배치 상세). 없으면(404) `missing`, 그 밖의 실패는 `error`이고 `retry`로 다시 받는다.
 * 화면을 떠나거나 id가 바뀌면 진행 중인 요청을 취소한다.
 */
export function useRecord<T>(id: string, fetcher: (id: string, signal: AbortSignal) => Promise<T>): { state: RecordState<T>; retry: () => void } {
  const [state, setState] = useState<RecordState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetcher(id, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ok', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState(error instanceof ApiError && error.status === 404 ? { status: 'missing' } : { status: 'error' });
      },
    );
    return () => controller.abort();
    // fetcher는 모듈 함수라 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
