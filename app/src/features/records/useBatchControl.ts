import { useEffect, useState } from 'react';
import type { BatchControlState } from '@ecocycle/shared';
import { getBatchControl } from '../../api/batches';
import { useAppSelector } from '../../store/hooks';
import { selectIsDisconnected, selectRecentCommands } from '../../store/selectors';

export function useBatchControl() {
  const [data, setData] = useState<BatchControlState | null>(null);
  const [error, setError] = useState(false);
  const offline = useAppSelector(selectIsDisconnected);
  const commands = useAppSelector(selectRecentCommands);
  const signature = commands.map(c=>`${c.key}:${c.status}`).join('|');
  useEffect(() => {
    if (offline) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await getBatchControl(controller.signal);
        if (!controller.signal.aborted) { setData(next); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      if (!controller.signal.aborted) timer = setTimeout(() => void load(), 2000);
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [offline, signature]);
  return { data, error, offline };
}
