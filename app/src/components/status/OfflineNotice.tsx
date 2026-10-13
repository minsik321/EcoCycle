import { useAppSelector } from '../../store/hooks';
import { selectConnection } from '../../store/selectors';
import { Timestamp } from './Timestamp';
import { TONE_CLASS } from './tone';

/**
 * 연결 상태 안내. 끊기면 "연결 끊김 · 마지막 수신 HH:MM:SS"를 눈에 띄게 보여 준다.
 * 값이 멈춘 화면을 정상처럼 보여 주지 않기 위한 것이라 숨기지 않는다. 연결되어 있으면 아무것도 그리지 않는다.
 */
export function OfflineNotice({ className = '' }: { className?: string }) {
  const { status, lastReceivedAt } = useAppSelector(selectConnection);
  if (status === 'online') return null;

  if (status === 'connecting') {
    return (
      <div role="status" className={`rounded-control border border-line bg-surface px-4 py-2 text-sm text-ink-soft shadow-soft-1 ${className}`}>
        서버에 연결하는 중…
      </div>
    );
  }
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-x-3 rounded-control border-2 px-4 py-2 shadow-soft-1 text-base font-semibold ${TONE_CLASS.offline} ${className}`}>
      <span aria-hidden="true">–</span>
      <span>연결 끊김</span>
      <span className="font-normal">
        · 마지막 수신 <Timestamp iso={lastReceivedAt} />
      </span>
      <span className="font-normal">· 아래 값은 마지막으로 받은 값입니다. 다시 연결하는 중…</span>
    </div>
  );
}
