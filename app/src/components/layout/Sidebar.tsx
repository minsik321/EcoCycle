import { NavLink } from 'react-router-dom';
import { NAV_ITEMS, resolveNavItems } from '../../config/navigation';
import type { NavItem, ResolvedNavItem } from '../../config/navigation';
import { useAppSelector } from '../../store/hooks';
import { selectActiveAlarmCount, selectPermissions } from '../../store/selectors';

export interface SidebarProps {
  /** 메뉴 목록. 기본은 config/navigation.ts */
  items?: readonly NavItem[];
  className?: string;
}

const BASE = 'flex min-h-12 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-base font-medium md:w-full';

/**
 * 주 메뉴. 태블릿(넓은 화면)에서는 왼쪽 세로 메뉴, 좁은 화면에서는 아래쪽 가로 메뉴가 된다.
 * 권한이 없는 메뉴는 설정(config/navigation.ts)에 따라 숨기거나 비활성화한다. 이것은 표시일 뿐이고 접근 차단은 서버가 한다.
 */
export function Sidebar({ items = NAV_ITEMS, className = '' }: SidebarProps) {
  const permissions = useAppSelector(selectPermissions);
  const activeAlarms = useAppSelector(selectActiveAlarmCount);
  const resolved = resolveNavItems(permissions, items);

  return (
    <nav
      aria-label="주 메뉴"
      className={`flex gap-1 overflow-x-auto border-t border-slate-200 bg-white p-2 md:w-52 md:shrink-0 md:flex-col md:overflow-visible md:border-t-0 md:border-r md:p-3 ${className}`}
    >
      {resolved.map((item) => (
        <MenuItem key={item.id} item={item} badge={item.badge === 'activeAlarms' ? activeAlarms : 0} />
      ))}
    </nav>
  );
}

function MenuItem({ item, badge }: { item: ResolvedNavItem; badge: number }) {
  if (!item.enabled) {
    return (
      <span aria-disabled="true" title="권한이 없습니다" className={`${BASE} cursor-not-allowed text-slate-400`}>
        {item.label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) => `${BASE} ${isActive ? 'bg-slate-800 text-white' : 'text-slate-800 active:bg-slate-100'}`}
    >
      <span>{item.label}</span>
      {badge > 0 && (
        <span
          aria-label={`활성 알람 ${badge}건`}
          className="inline-flex min-w-6 items-center justify-center gap-0.5 rounded-full bg-status-alarm px-1.5 text-sm font-bold text-white"
        >
          <span aria-hidden="true">✕</span>
          {badge}
        </span>
      )}
    </NavLink>
  );
}
