import { useEffect, useState } from 'react';
import type { DeviceStatus } from '@ecocycle/shared';
import { CONTROL_TEXT } from '../../config/controls';
import { DEVICE_NAMES } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectRecentCommands } from '../../store/selectors';
import type { CommandEntry, CommandEntryStatus } from '../../store';
import { ToastCard } from '../common/ToastCard';
import { StatusBadge } from '../status/StatusBadge';

/** 끝난 결과를 보여 주는 시간(ms). 오류·거부는 읽을 시간이 필요해서 더 길게 둔다. */
const SHOW_DONE_MS = 6_000;
const SHOW_PROBLEM_MS = 12_000;
const MAX_TOASTS = 3;

const VIEW: Record<CommandEntryStatus, { tone: DeviceStatus; symbol: string; text: string }> = {
  sending: { tone: 'offline', symbol: '…', text: '전송 중' },
  accepted: { tone: 'offline', symbol: '…', text: '접수됨 · 처리 중' },
  completed: { tone: 'normal', symbol: '✓', text: '완료' },
  rejected: { tone: 'caution', symbol: '▲', text: '거부됨' },
  failed: { tone: 'alarm', symbol: '✕', text: '실패' },
  unknown: { tone: 'caution', symbol: '?', text: '결과 확인 불가' },
};

const isPending = (s: CommandEntryStatus) => s === 'sending' || s === 'accepted';

/**
 * 조작 결과 알림(접수 → 완료·거부·실패). 홈 어디서든 보이도록 앱 화면 위에 한 번 둔다.
 * 처리 중인 것은 결과가 나올 때까지 보이고, 끝난 것은 잠시 보인 뒤 사라진다. 직접 닫을 수도 있다.
 */
export function CommandResultToast({ className = '' }: { className?: string }) {
  const entries = useAppSelector(selectRecentCommands);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  // 끝난 항목은 시간이 지나면 숨긴다 (항목마다 한 번만 예약)
  const doneKeys = entries.filter((e) => !isPending(e.status)).map((e) => `${e.key}:${e.status}`);
  const doneSignature = doneKeys.join('|');
  useEffect(() => {
    const timers = entries
      .filter((e) => !isPending(e.status))
      .map((e) => {
        const ms = e.status === 'completed' ? SHOW_DONE_MS : SHOW_PROBLEM_MS;
        return setTimeout(() => setHidden((prev) => new Set(prev).add(`${e.key}:${e.status}`)), ms);
      });
    return () => timers.forEach(clearTimeout);
    // entries 전체가 아니라 끝난 항목이 바뀔 때만 다시 예약한다
  }, [doneSignature]);

  const visible = entries.filter((e) => !hidden.has(`${e.key}:${e.status}`)).slice(0, MAX_TOASTS);
  if (visible.length === 0) return null;

  return (
    <div aria-live="polite" className={`pointer-events-none fixed bottom-4 right-4 z-40 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 ${className}`}>
      {visible.map((entry) => (
        <Toast key={entry.key} entry={entry} onDismiss={() => setHidden((prev) => new Set(prev).add(`${entry.key}:${entry.status}`))} />
      ))}
    </div>
  );
}

function Toast({ entry, onDismiss }: { entry: CommandEntry; onDismiss: () => void }) {
  const view = VIEW[entry.status];
  return (
    <ToastCard
      tone={view.tone}
      title={
        <>
          <span>
            {DEVICE_NAMES[entry.deviceId]} · {CONTROL_TEXT[entry.type].label}
          </span>
          <StatusBadge status={view.tone} symbol={view.symbol} label={entry.type.includes('batch') && entry.status === 'accepted' ? '적용 대기' : entry.type.includes('batch') && entry.status === 'completed' ? '적용됨' : view.text} size="sm" />
        </>
      }
      {...(isPending(entry.status) ? {} : { onDismiss })}
    >
      {entry.reason}
    </ToastCard>
  );
}
