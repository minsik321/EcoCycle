import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_TEXT } from '../../config/display';
import { logoutUser } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectActiveAlarmCount, selectMe } from '../../store/selectors';
import { Icon } from './icons';

// 스튜디오가 앱 틀의 상단 바를 넘겨받았을 때 상단 바 오른쪽 끝에 두는 것: 알람, CCTV, 사용자(로그아웃).
// 틀의 상단 바가 하던 일을 그대로 한다. 화면 이동은 앱의 주 메뉴(components/layout/Sidebar) 하나로 한다(따로 메뉴를 두지 않는다).

function Popover({ label, icon, children, className = '' }: { label: ReactNode; icon?: ReactNode; children: ReactNode; className?: string }) {
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
  return (
    <div className={`st-pop ${className}`} ref={ref}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        {icon}
        {label}
      </button>
      {open && (
        <div className="st-glass st-pop-menu" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function StudioAccount({ extra }: { extra?: ReactNode }) {
  const dispatch = useAppDispatch();
  const me = useAppSelector(selectMe);
  const activeAlarms = useAppSelector(selectActiveAlarmCount);

  return (
    <div className="st-account">
      <Link to="/alarms" className="st-bell" aria-label={`알람 보기, 지금 울리는 알람 ${activeAlarms}건`}>
        <Icon name="bell" />
        {activeAlarms > 0 && <b>{activeAlarms}</b>}
      </Link>
      {extra && <span className="st-extra">{extra}</span>}
      {me && (
        <Popover
          className="st-user"
          icon={
            <span className="st-avatar" aria-hidden="true">
              {me.name.slice(0, 1)}
            </span>
          }
          label={
            <span className="st-user-text">
              <b>{me.name}</b>
              <small>{ROLE_TEXT[me.role]}</small>
            </span>
          }
        >
          <button type="button" role="menuitem" onClick={() => void dispatch(logoutUser())}>
            로그아웃
          </button>
        </Popover>
      )}
    </div>
  );
}
