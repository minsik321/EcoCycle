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

const BASE = 'flex min-h-12 shrink-0 items-center justify-between gap-2 rounded-control px-3 text-base font-semibold md:w-full';

// 메뉴 그림. 글자와 함께 보여 주고 그림만으로 뜻을 전하지 않는다. 모르는 메뉴는 점 하나로 그린다.
const ICON_PATHS: Record<string, string> = {
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  tanks: 'M5 8h14v11H5zM5 8l2-3h10l2 3M9 13h6',
  robot: 'M6 20h8M10 20v-4M10 16l-3-6 6-4 4 3M17 9l2 2M17 9l-1 3',
  conveyor: 'M4 10h16M4 14h16M7 17a1.5 1.5 0 1 0 0 .01M12 17a1.5 1.5 0 1 0 0 .01M17 17a1.5 1.5 0 1 0 0 .01M9 6h6v4H9z',
  compressor: 'M6 4h12v4H6zM12 8v4M7 12h10v8H7zM10 16h4',
  alarms: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9M10 20a2 2 0 0 0 4 0',
  settings: 'M5 7h9M18 7h1M5 17h1M10 17h9M16 5v4M8 15v4',
};

function Icon({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[id] ?? 'M12 12h.01'} />
    </svg>
  );
}

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
      className={`glass z-20 flex gap-1 overflow-x-auto rounded-none border-x-0 border-b-0 p-2 md:w-48 md:shrink-0 md:flex-col md:overflow-visible md:border-y-0 md:border-l-0 md:p-3 ${className}`}
    >
      {resolved.map((item) => (
        <MenuItem key={item.id} item={item} badge={item.badge === 'activeAlarms' ? activeAlarms : 0} />
      ))}
    </nav>
  );
}

function MenuItem({ item, badge }: { item: ResolvedNavItem; badge: number }) {
  const label = (
    <span className="flex items-center gap-2.5">
      <Icon id={item.id} />
      <span>{item.label}</span>
    </span>
  );
  if (!item.enabled) {
    return (
      <span aria-disabled="true" title="권한이 없습니다" className={`${BASE} cursor-not-allowed text-ink-faint`}>
        {item.label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) => `${BASE} ${isActive ? 'bg-accent text-white shadow-soft-1' : 'text-ink-soft active:bg-paper-deep'}`}
    >
      {label}
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
