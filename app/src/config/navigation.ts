import { deviceTypeOf } from '@ecocycle/shared';
import type { DeviceId, Permission } from '@ecocycle/shared';

// 주 메뉴. 순서는 명세 기준: 홈, 섹터, 로봇팔, 컨베이어, 압축기, 알람, 공정 기록, 설정.
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
  /** 폰의 아래 탭 바에 바로 놓는다. 나머지는 탭 바의 "더 보기" 안에 둔다 (가장 자주 쓰는 4개, 가정) */
  phoneTab?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: '홈', path: '/', phoneTab: true },
  { id: 'tanks', label: '섹터', path: '/tanks', phoneTab: true }, // 섹터와 탱크는 같은 대상 (주소·기기 ID는 그대로)
  { id: 'robot', label: '로봇팔', path: '/robot', phoneTab: true },
  { id: 'conveyor', label: '컨베이어', path: '/conveyor' },
  { id: 'compressor', label: '압축기', path: '/compressor' },
  { id: 'alarms', label: '알람', path: '/alarms', badge: 'activeAlarms', phoneTab: true },
  { id: 'records', label: '공정 기록', path: '/records' }, // 차량·배치 지난 기록 (폰에서는 "더 보기" 안)
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

/** 공정 기록 화면의 탭 (쿼리 `?tab=`) */
export type RecordsTab = 'vehicles' | 'batches' | 'bales';
export const RECORDS_TABS: readonly RecordsTab[] = ['vehicles', 'batches', 'bales'];

/** 공정 기록 화면 주소 (홈의 "기록 보기"·"전체 보기"가 탭을 골라 연다) */
export const recordsPath = (tab: RecordsTab = 'vehicles'): string => `/records?tab=${tab}`;
/** 차량 한 대의 기록 상세 (팝업. 이 주소를 바로 열면 공정 기록 위에 뜬다, components/records/recordPopup) */
export const vehicleRecordPath = (id: string): string => `/records/vehicles/${encodeURIComponent(id)}`;
/** 배치·베일 화면 (지금·다음 배치와 수동 제어, 사건 기록) */
export const batchBalePath = '/records/batches';
/** 배치 하나의 기록 상세 (팝업) */
export const batchRecordPath = (id: string): string => `/records/batches/${encodeURIComponent(id)}`;
/** 베일 하나의 상세 (팝업) */
export const baleRecordPath = (id: string): string => `/records/bales/${encodeURIComponent(id)}`;

/** 이 주소가 이 메뉴의 화면인가 (메뉴 강조용: 홈은 정확히 "/"만, 나머지는 그 아래 주소 포함) */
export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.path === '/') return pathname === '/';
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

/** 이 주소의 화면이 여백 없이 가득 쓰는 화면인가 */
export function isFullBleedPath(pathname: string, items: readonly NavItem[] = NAV_ITEMS): boolean {
  return items.some((item) => item.fullBleed === true && item.path === pathname);
}
