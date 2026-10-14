import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ROLE_TEXT } from '../../config/display';
import { resolveNavItems } from '../../config/navigation';
import { logoutUser } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectActiveAlarmCount, selectMe, selectPermissions } from '../../store/selectors';
import { Icon } from './icons';

// 스튜디오가 앱 틀(메뉴·상단 바)을 넘겨받았을 때 상단 바 오른쪽 끝에 두는 것: 알람, CCTV, 사용자(로그아웃), 메뉴.
// 틀의 상단 바·메뉴가 하던 일을 그대로 한다. 메뉴의 권한 처리(숨김·비활성)는 config/navigation과 같고, 차단은 서버가 한다.

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
  const permissions = useAppSelector(selectPermissions);
  const activeAlarms = useAppSelector(selectActiveAlarmCount);
  const nav = resolveNavItems(permissions);

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
      <Popover className="st-nav" icon={<Icon name="menu" />} label={<span className="st-sr">메뉴</span>}>
        {nav.map((item) =>
          item.enabled ? (
            <NavLink key={item.id} to={item.path} end={item.path === '/'} role="menuitem">
              {item.label}
              {item.badge === 'activeAlarms' && activeAlarms > 0 && <b className="st-nav-badge">✕ {activeAlarms}</b>}
            </NavLink>
          ) : (
            <span key={item.id} role="menuitem" aria-disabled="true" title="권한이 없습니다">
              {item.label}
            </span>
          ),
        )}
      </Popover>
    </div>
  );
}
