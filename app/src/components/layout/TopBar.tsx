import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_TEXT } from '../../config/display';
import { USE_MOCK } from '../../config/env';
import { QUALITY_TEXT } from '../../config/quality';
import { logoutUser } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectActiveAlarmCount, selectConnection, selectMe } from '../../store/selectors';

/*
 * 앱의 상단 바는 이것 하나다(2026-10-16, docs/decisions.md "상단 바 하나로"). 일반 화면은 틀(AppShell)이 그리고,
 * 3D 홈은 틀의 바를 넘겨받아 같은 컴포넌트를 3D 위에 띄운다(`overlay`: 성에 낀 떠 있는 바, studio.css가 자리만 정한다).
 * 왼쪽부터 로고 · 예시 데이터 · 가운데 칸(홈에서만 3D | 대시보드 전환) · 연결과 시계 · 알람 · CCTV · 사용자 메뉴.
 *  - 폰(md 미만): 알람은 아래 탭 바의 "알람" 배지가 맡아 바에서 뺀다. CCTV는 사용자 메뉴 안으로 들어간다.
 *  - 화질·설정·로그아웃은 사용자 메뉴 안. 사용자 이름은 넓은 화면(xl)에서만 바에 적는다.
 */

const CONNECTION_VIEW = {
  online: { text: '연결됨', dot: 'bg-status-normal', chip: 'bg-status-normal-soft text-status-normal' },
  connecting: { text: '연결 중', dot: 'bg-status-caution', chip: 'bg-status-caution-soft text-status-caution' },
  offline: { text: '연결 끊김', dot: 'bg-status-offline', chip: 'bg-status-offline-soft text-status-offline' },
} as const;

const hhmm = (date: Date) => new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);

/** 지금 시각(분 단위). 분이 바뀔 때만 다시 그린다 */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const date = new Date();
      setNow(date);
      timer = window.setTimeout(tick, 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds()) + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** 연결 상태와 시계를 한 알약에: 연결되어 있으면 지금 시각, 끊기면 "연결 끊김"과 마지막 수신 시각 */
function LiveChip({ status, lastReceivedAt }: { status: keyof typeof CONNECTION_VIEW; lastReceivedAt: string | null }) {
  const now = useMinuteClock();
  const view = CONNECTION_VIEW[status];
  return (
    <span role="status" className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold whitespace-nowrap tabular-nums ${view.chip}`}>
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${view.dot}`} />
      {status === 'online' ? (
        <>
          <span className="sr-only lg:not-sr-only">{view.text}</span>
          <time dateTime={now.toISOString()} aria-label="현재 시각" className="font-medium text-ink">
            {hhmm(now)}
          </time>
        </>
      ) : status === 'connecting' ? (
        view.text
      ) : (
        <>
          <span className="sm:hidden">끊김</span>
          <span className="hidden sm:inline">{view.text}</span>
          {lastReceivedAt && (
            <time dateTime={lastReceivedAt} aria-label="마지막 수신 시각" className="font-medium">
              {hhmm(new Date(lastReceivedAt))}
            </time>
          )}
        </>
      )}
    </span>
  );
}

function Logo({ wordmark }: { wordmark: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8">
        <rect width="32" height="32" rx="9" className="fill-accent" />
        <path d="M16 7.5a8.5 8.5 0 1 0 8.2 10.7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M24.6 9.2v5.4h-5.4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-base font-bold tracking-tight whitespace-nowrap text-ink ${wordmark}`}>EcoCycle</span>
    </span>
  );
}

// 표시 방식(inline-flex·hidden)은 쓰는 곳에서 붙인다 (같은 줄에 두면 좁은 화면에서 숨기는 클래스와 부딪힌다)
const ICON_BUTTON = 'relative h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-control px-1.5 text-ink-soft active:bg-ink/5';

/** 사용자 메뉴: 이름·권한, 설정(화질), CCTV(폰), 로그아웃. 바깥을 누르거나 Esc로 닫는다 */
function UserMenu({ extra }: { extra?: ReactNode }) {
  const dispatch = useAppDispatch();
  const me = useAppSelector(selectMe);
  const quality = useAppSelector((state) => state.ui.qualityMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!me) return null;
  const item = 'flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-3 text-left text-sm font-semibold text-ink active:bg-paper-deep';
  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${me.name} (${ROLE_TEXT[me.role]}) 메뉴`} onClick={() => setOpen(!open)} className={`${ICON_BUTTON} inline-flex`}>
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">
          {me.name.slice(0, 1)}
        </span>
        <span aria-hidden="true" className="hidden flex-col items-start pr-1 leading-tight xl:flex">
          <span className="text-sm font-semibold whitespace-nowrap text-ink">{me.name}</span>
          <span className="text-xs whitespace-nowrap text-ink-faint">{ROLE_TEXT[me.role]}</span>
        </span>
      </button>
      {open && (
        <div role="menu" aria-label="사용자 메뉴" onClick={() => setOpen(false)} className="absolute top-[calc(100%+0.5rem)] right-0 z-50 flex w-60 flex-col gap-0.5 rounded-card border border-line bg-surface p-1.5 shadow-soft-3">
          <p className="px-3 pt-2 pb-1.5 text-sm text-ink">
            <span className="font-semibold">{me.name}</span> <span className="text-ink-faint">({ROLE_TEXT[me.role]})</span>
          </p>
          <Link role="menuitem" to="/settings" className={item}>
            설정
            <span className="text-xs font-medium text-ink-soft">화질 {QUALITY_TEXT[quality].label}</span>
          </Link>
          {extra && <div className="md:hidden [&_button]:min-h-12 [&_button]:w-full [&_button]:justify-start [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-3 [&_button]:text-sm [&_button]:shadow-none">{extra}</div>}
          <button role="menuitem" type="button" className={item} onClick={() => void dispatch(logoutUser())}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

export interface TopBarProps {
  /** 가운데 칸. 홈에서만 3D | 대시보드 전환을 넣는다(시연 화면은 측정 버튼). 틀은 화면을 모르므로 위에서 끼워 넣는다 */
  center?: ReactNode;
  /** 오른쪽에 더 둘 것 (CCTV 버튼). 폰에서는 사용자 메뉴 안에 들어간다 */
  extra?: ReactNode;
  /** 3D 위에 띄우는 모양: 떠 있는 성에 낀 바(모서리 둥근 판). 아니면 화면 맨 위에 붙은 바 */
  overlay?: boolean;
  /** 연결 상태를 store 대신 이 값으로 (서버 없는 시연 화면) */
  live?: { disconnected: boolean; lastReceivedAt: string | null };
  /** "예시 데이터" 표시. 기본은 값이 모의 서버에서 올 때(USE_MOCK) */
  example?: boolean;
  className?: string;
}

/**
 * 앱의 상단 바 하나: 로고, 예시 데이터, (홈 전환), 연결·시계, 알람, CCTV, 사용자 메뉴.
 * 연결 상태는 어느 화면에서나 보인다.
 */
export function TopBar({ center, extra, overlay = false, live, example = USE_MOCK, className = '' }: TopBarProps) {
  const me = useAppSelector(selectMe);
  const connection = useAppSelector(selectConnection);
  const activeAlarms = useAppSelector(selectActiveAlarmCount);
  const status = live ? (live.disconnected ? 'offline' : 'online') : connection.status;
  const lastReceivedAt = live ? live.lastReceivedAt : connection.lastReceivedAt;
  const shape = overlay ? 'rounded-panel px-2 sm:px-3' : 'rounded-none border-x-0 border-t-0 px-3 sm:px-4';

  return (
    <header data-topbar={overlay ? 'overlay' : 'page'} className={`group glass z-30 flex h-14 min-w-0 items-center gap-1.5 sm:gap-3 ${shape} ${className}`}>
      {/* 가운데 칸에 홈 전환(tablist)이 들어 있으면 xl 미만에서는 로고 글자를 빼 자리를 만든다 (사이드바를 펼친 태블릿 포함) */}
      <Logo wordmark="hidden min-[22rem]:inline max-xl:group-has-[[role=tablist]]:hidden" />
      {example && (
        <span className="shrink-0 rounded-full border border-kraft/50 bg-kraft-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-soft">
          예시<span className="hidden lg:inline"> 데이터</span>
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] md:justify-center">{center}</div>
      <LiveChip status={status} lastReceivedAt={lastReceivedAt} />
      {me && (
        <>
          <Link to="/alarms" aria-label={`알람 보기, 지금 울리는 알람 ${activeAlarms}건`} className={`${ICON_BUTTON} hidden md:inline-flex`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
            {activeAlarms > 0 && (
              <span className="absolute top-1.5 right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-alarm px-1 text-xs font-bold text-white">
                {activeAlarms}
              </span>
            )}
          </Link>
          {extra && <div className="hidden shrink-0 md:block [&_button]:px-3 [&_button]:text-sm [&_button]:shadow-none">{extra}</div>}
          <UserMenu extra={extra} />
        </>
      )}
    </header>
  );
}
