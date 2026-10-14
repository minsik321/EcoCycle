import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_TEXT } from '../../config/display';
import { USE_MOCK } from '../../config/env';
import { QUALITY_TEXT } from '../../config/quality';
import { logoutUser } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectActiveAlarmCount, selectConnection, selectMe } from '../../store/selectors';
import { Button } from '../common/Button';

const CONNECTION_VIEW = {
  online: { text: '연결됨', dot: 'bg-status-normal', tone: 'text-ink-soft' },
  connecting: { text: '연결 중', dot: 'bg-status-caution', tone: 'text-ink-soft' },
  offline: { text: '연결 끊김', dot: 'bg-status-offline', tone: 'font-semibold text-status-offline' },
} as const;

// 표시 방식(inline-flex·hidden)은 쓰는 곳에서 정한다. 여기 넣으면 좁은 화면에서 숨기는 클래스와 부딪힌다.
const CHIP = 'min-h-12 items-center gap-1.5 rounded-control px-2.5 text-sm whitespace-nowrap';

/** 현지 시각 시계. 1초마다 이 컴포넌트만 다시 그린다. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const text = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  return (
    <time dateTime={now.toISOString()} aria-label="현재 시각" className="hidden text-sm font-semibold text-ink lg:inline">
      {text}
    </time>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8">
        <rect width="32" height="32" rx="9" className="fill-accent" />
        <path d="M16 7.5a8.5 8.5 0 1 0 8.2 10.7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M24.6 9.2v5.4h-5.4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden text-lg font-extrabold tracking-tight whitespace-nowrap text-ink sm:inline">EcoCycle</span>
    </div>
  );
}

export interface TopBarProps {
  /** 가운데 영역 (홈의 검색·지역 전환 등). 틀은 화면을 모르므로 위에서 끼워 넣는다 */
  center?: ReactNode;
  /** 오른쪽에 더 둘 것 (예: CCTV 버튼) */
  extra?: ReactNode;
  className?: string;
}

/**
 * 상단 바: 로고, 가운데 슬롯, 시계, 알람 수, 연결 상태, 화질 단계, 사용자.
 * 연결 상태는 어느 화면에서나 보인다. 값이 모의 서버에서 오는 동안에는 "예시 데이터"를 표시한다.
 */
export function TopBar({ center, extra, className = '' }: TopBarProps) {
  const dispatch = useAppDispatch();
  const me = useAppSelector(selectMe);
  const connection = useAppSelector(selectConnection);
  const activeAlarms = useAppSelector(selectActiveAlarmCount);
  const quality = useAppSelector((state) => state.ui.qualityMode);
  const view = CONNECTION_VIEW[connection.status];

  return (
    <header className={`glass z-30 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-1.5 ${className}`}>
      <Logo />
      {USE_MOCK && (
        <span className="rounded-full border border-kraft/50 bg-kraft-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-soft">
          예시<span className="hidden sm:inline"> 데이터</span>
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">{center}</div>
      {me && (
        <div className="flex items-center gap-1">
          <Clock />
          <Link to="/alarms" aria-label={`알람 보기, 지금 울리는 알람 ${activeAlarms}건`} className={`${CHIP} relative inline-flex text-ink active:bg-paper-deep`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
            {activeAlarms > 0 && (
              <span className="absolute top-1 right-0 inline-flex min-w-5 items-center justify-center rounded-full bg-status-alarm px-1 text-xs font-bold text-white">
                {activeAlarms}
              </span>
            )}
          </Link>
          <span role="status" className={`${CHIP} inline-flex ${view.tone}`}>
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${view.dot}`} />
            {view.text}
          </span>
          <Link to="/settings" aria-label={`화질 ${QUALITY_TEXT[quality].label}, 설정에서 바꾸기`} className={`${CHIP} hidden text-ink-soft active:bg-paper-deep lg:inline-flex`}>
            화질 <span className="font-semibold text-ink">{QUALITY_TEXT[quality].label}</span>
          </Link>
          {extra}
          <span className="hidden px-1 text-sm whitespace-nowrap text-ink xl:inline">
            {me.name} <span className="text-ink-faint">({ROLE_TEXT[me.role]})</span>
          </span>
          {/* 좁은 화면에서는 자리가 없어 숨긴다(글자를 키운 태블릿 포함). 화질·로그아웃은 설정 화면에도 있다 */}
          <span className="hidden lg:inline">
            <Button variant="quiet" onClick={() => void dispatch(logoutUser())}>
              로그아웃
            </Button>
          </span>
        </div>
      )}
    </header>
  );
}
