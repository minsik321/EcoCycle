import { deviceTypeOf } from '@ecocycle/shared';
import type { DeviceId, Permission } from '@ecocycle/shared';

// 사이드바 메뉴. 순서는 명세 기준: 홈, 탱크, 로봇팔, 컨베이어, 압축기, 알람, 설정.
// `requires`가 있으면 그 권한이 없을 때 `whenDenied`에 따라 메뉴를 숨기거나(hide) 비활성화(disable)한다.
// 가정 단계에서는 모든 메뉴가 열려 있다. 권한별로 보이는 화면은 대표님과 확정한다 (docs/questions.md A4).
// 이것도 표시일 뿐이고, 화면 안의 조작과 데이터 접근은 서버가 막는다.

export interface NavItem {
  id: string;
  label: string;
  path: string;
  requires?: Permission;
  /** 권한이 없을 때: 숨기거나(hide, 기본) 보이되 누를 수 없게(disable) 한다 */
  whenDenied?: 'hide' | 'disable';
  /** 메뉴 옆에 숫자 배지를 붙일 값. activeAlarms: 활성 알람 수 */
  badge?: 'activeAlarms';
  /** 화면을 여백 없이 가득 쓴다 (3D 화면 위에 패널을 띄우는 홈) */
  fullBleed?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: '홈', path: '/' },
  { id: 'tanks', label: '탱크', path: '/tanks' },
  { id: 'robot', label: '로봇팔', path: '/robot' },
  { id: 'conveyor', label: '컨베이어', path: '/conveyor' },
  { id: 'compressor', label: '압축기', path: '/compressor' },
  { id: 'alarms', label: '알람', path: '/alarms', badge: 'activeAlarms' },
  { id: 'settings', label: '설정', path: '/settings' },
];

export interface ResolvedNavItem extends NavItem {
  /** false이면 보이지만 누를 수 없다 */
  enabled: boolean;
}

/** 이 권한 목록으로 보여 줄 메뉴와 각 메뉴의 사용 가능 여부 */
export function resolveNavItems(permissions: readonly Permission[], items: readonly NavItem[] = NAV_ITEMS): ResolvedNavItem[] {
  return items.flatMap((item): ResolvedNavItem[] => {
    const allowed = !item.requires || permissions.includes(item.requires);
    if (allowed) return [{ ...item, enabled: true }];
    return item.whenDenied === 'disable' ? [{ ...item, enabled: false }] : [];
  });
}

/** 기기 하나의 상세 페이지 주소. 탱크는 기기마다, 나머지는 종류당 한 페이지다. */
export function devicePagePath(id: DeviceId): string {
  switch (deviceTypeOf(id)) {
    case 'tank':
      return `/tanks/${id}`;
    case 'robot':
      return '/robot';
    case 'conveyor':
      return '/conveyor';
    case 'compressor':
      return '/compressor';
  }
}

/** 이 주소의 화면이 여백 없이 가득 쓰는 화면인가 */
export function isFullBleedPath(pathname: string, items: readonly NavItem[] = NAV_ITEMS): boolean {
  return items.some((item) => item.fullBleed === true && item.path === pathname);
}
