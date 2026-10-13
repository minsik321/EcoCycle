import type { Permission } from '@ecocycle/shared';

// 사이드바 메뉴. 순서는 명세 기준: 홈, 탱크, 로봇팔, 컨베이어, 압축기, 알람, 설정.
// `requires`가 있으면 그 권한이 없을 때 메뉴를 숨기거나 비활성화한다. 가정 단계에서는 모두 열려 있다.

export interface NavItem {
  id: string;
  label: string;
  path: string;
  requires?: Permission;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: '홈', path: '/' },
  { id: 'tanks', label: '탱크', path: '/tanks' },
  { id: 'robot', label: '로봇팔', path: '/robot' },
  { id: 'conveyor', label: '컨베이어', path: '/conveyor' },
  { id: 'compressor', label: '압축기', path: '/compressor' },
  { id: 'alarms', label: '알람', path: '/alarms' },
  { id: 'settings', label: '설정', path: '/settings' },
];

/** 이 권한 목록으로 볼 수 있는 메뉴 */
export function visibleNavItems(permissions: readonly Permission[]): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.requires || permissions.includes(item.requires));
}
