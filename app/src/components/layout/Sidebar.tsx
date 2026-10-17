import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS, isNavActive, resolveNavItems } from '../../config/navigation';
import type { NavItem, ResolvedNavItem } from '../../config/navigation';
import { useAppSelector } from '../../store/hooks';
import { selectActiveAlarmCount, selectPermissions } from '../../store/selectors';

export interface SidebarProps {
  /** 메뉴 목록. 기본은 config/navigation.ts */
  items?: readonly NavItem[];
  className?: string;
  /** 태블릿·데스크톱: 아이콘만 남긴 좁은 메뉴 (태블릿의 기본, 앱 틀이 기기에 기억한 값을 넘긴다) */
  collapsed?: boolean;
  /** 접기·펼치기 버튼을 누를 때. 없으면 버튼을 두지 않는다 */
  onToggle?: () => void;
}

/**
 * 지금 화면의 메뉴 강조. 앱의 모든 메뉴(사이드바 펼침·접힘, 폰 탭 바, "더 보기")가 이 한 가지로 켜진다.
 * 꺼진 메뉴는 누를 때만 옅게 바뀐다(호버에 기대지 않는다).
 */
export const NAV_ACTIVE = 'bg-accent text-white shadow-soft-1';
const NAV_IDLE = 'text-ink-soft active:bg-paper-deep';

// 메뉴 그림. 글자와 함께 보여 주고 그림만으로 뜻을 전하지 않는다(접힌 메뉴도 글자는 화면 읽기용으로 남는다). 모르는 메뉴는 점 하나로 그린다.
const ICON_PATHS: Record<string, string> = {
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  tanks: 'M5 8h14v11H5zM5 8l2-3h10l2 3M9 13h6',
  robot: 'M6 20h8M10 20v-4M10 16l-3-6 6-4 4 3M17 9l2 2M17 9l-1 3',
  conveyor: 'M4 10h16M4 14h16M7 17a1.5 1.5 0 1 0 0 .01M12 17a1.5 1.5 0 1 0 0 .01M17 17a1.5 1.5 0 1 0 0 .01M9 6h6v4H9z',
  compressor: 'M6 4h12v4H6zM12 8v4M7 12h10v8H7zM10 16h4',
  alarms: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9M10 20a2 2 0 0 0 4 0',
  records: 'M7 4h8l3 3v13H7zM14 4v4h4M10 12h5M10 16h5',
  settings: 'M5 7h9M18 7h1M5 17h1M10 17h9M16 5v4M8 15v4',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  expand: 'M4 6h16M4 12h10M4 18h16M17 9l3 3-3 3',
  collapse: 'M4 6h16M4 12h10M4 18h16M20 9l-3 3 3 3',
};

function Icon({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={id === 'more' ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[id] ?? 'M12 12h.01'} />
    </svg>
  );
}

/**
 * 주 메뉴 하나가 화면 폭에 따라 모양만 바꾼다(앱 어디서나, 3D 홈 포함):
 * - 폰(md 미만): 아래 탭 바. 가장 자주 쓰는 메뉴(`phoneTab`) + "더 보기"(나머지를 위로 펼친다).
 * - 태블릿·데스크톱(md 이상): 왼쪽 사이드바. 접으면 아이콘만 남는다. 폭은 어느 화면에서나(3D 홈 포함) 같다:
 *   접힘 여부는 앱 틀이 기기에 기억한 값 하나(components/layout/sidebarPref.ts)이고 화면마다 따로 정하지 않는다.
 * 권한이 없는 메뉴는 설정(config/navigation.ts)에 따라 숨기거나 비활성화한다. 이것은 표시일 뿐이고 접근 차단은 서버가 한다.
 */
export function Sidebar({ items = NAV_ITEMS, className = '', collapsed = false, onToggle }: SidebarProps) {
  const permissions = useAppSelector(selectPermissions);
  const activeAlarms = useAppSelector(selectActiveAlarmCount);
  const { pathname } = useLocation();
  const resolved = resolveNavItems(permissions, items);
  const more = resolved.filter((item) => !item.phoneTab);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // 화면을 옮기면 "더 보기"를 닫는다
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const badgeOf = (item: ResolvedNavItem) => (item.badge === 'activeAlarms' ? activeAlarms : 0);
  const moreActive = more.some((item) => isNavActive(item, pathname));

  return (
    <nav
      aria-label="주 메뉴"
      data-collapsed={collapsed || undefined}
      className={`relative z-30 shrink-0 ${collapsed ? 'md:w-[4.5rem]' : 'md:w-48'} ${className}`}
    >
      <div className="glass flex h-full gap-1 rounded-none border-x-0 border-b-0 px-1 py-1 md:flex-col md:border-y-0 md:border-l-0 md:p-2">
        {onToggle && (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            onClick={onToggle}
            className={`hidden min-h-12 shrink-0 items-center gap-2.5 rounded-control px-3.5 text-sm font-semibold md:flex ${NAV_IDLE}`}
          >
            <Icon id={collapsed ? 'expand' : 'collapse'} />
            {!collapsed && <span className="truncate">메뉴 접기</span>}
          </button>
        )}
        {resolved.map((item) => (
          <MenuItem key={item.id} item={item} badge={badgeOf(item)} collapsed={collapsed} phoneHidden={!item.phoneTab} />
        ))}
        {more.length > 0 && (
          <div ref={moreRef} className="flex flex-1 md:hidden">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="true"
              onClick={() => setMoreOpen(!moreOpen)}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-1 text-xs font-semibold ${moreActive ? NAV_ACTIVE : NAV_IDLE}`}
            >
              <Icon id="more" />
              <span className="truncate">더 보기</span>
            </button>
            {moreOpen && (
              <div role="group" aria-label="더 보기 메뉴" className="glass absolute right-2 bottom-full mb-2 flex w-56 flex-col gap-1 rounded-card p-2 shadow-soft-3">
                {more.map((item) => (
                  <MenuItem key={item.id} item={item} badge={badgeOf(item)} collapsed={false} inMore />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

interface MenuItemProps {
  item: ResolvedNavItem;
  badge: number;
  collapsed: boolean;
  /** 폰 탭 바에는 놓지 않는다("더 보기" 안에 있다) */
  phoneHidden?: boolean;
  /** "더 보기" 안의 줄 */
  inMore?: boolean;
}

function MenuItem({ item, badge, collapsed, phoneHidden = false, inMore = false }: MenuItemProps) {
  // 폰 탭: 그림 위·글자 아래로 나눠 쓰고, md 이상에서는 한 줄(접히면 그림만). "더 보기" 안은 늘 한 줄
  const shape = inMore
    ? 'flex min-h-12 items-center gap-2.5 px-3 text-base'
    : `${phoneHidden ? 'hidden md:flex' : 'flex'} min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs md:min-h-12 md:flex-none md:flex-row md:gap-2.5 md:text-base ${
        collapsed ? 'md:justify-center md:px-0' : 'md:justify-start md:px-3'
      }`;
  const base = `relative min-w-0 shrink-0 rounded-control font-semibold ${shape}`;
  // 접힌 사이드바는 글자를 화면 읽기용으로만 남긴다 (링크 이름은 그대로)
  const labelClass = `truncate ${collapsed && !inMore ? 'md:sr-only' : ''} ${inMore ? 'flex-1' : 'md:flex-1'}`;
  const badgeView = badge > 0 && (
    <span
      aria-label={`활성 알람 ${badge}건`}
      className={`inline-flex min-w-5 items-center justify-center gap-0.5 rounded-full bg-status-alarm px-1 text-xs font-bold text-white ${
        inMore ? '' : `absolute top-1 right-1/2 translate-x-5 md:static md:translate-x-0 ${collapsed ? 'md:absolute md:top-1 md:right-1' : ''}`
      }`}
    >
      <span aria-hidden="true">✕</span>
      {badge}
    </span>
  );
  const content = (
    <>
      <Icon id={item.id} />
      <span className={labelClass}>{item.label}</span>
      {badgeView}
    </>
  );
  if (!item.enabled) {
    return (
      <span aria-disabled="true" title="권한이 없습니다" className={`${base} cursor-not-allowed text-ink-faint`}>
        {content}
      </span>
    );
  }
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => `${base} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
    >
      {content}
    </NavLink>
  );
}
