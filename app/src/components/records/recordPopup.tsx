import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { baleRecordPath, batchRecordPath, recordsPath, vehicleRecordPath } from '../../config/navigation';
import type { RecordsTab } from '../../config/navigation';

/*
 * 기록 상세 팝업(차량·배치·베일)의 주소와 기록(history) 상태.
 * 팝업은 페이지를 옮기지 않고 지금 화면 위에 뜬다. 주소는 상세 주소(`/records/batches/{id}` 등)로 바뀌고,
 * 기록 상태에 "뒤에 깔린 화면(background)"과 "바로 전 팝업(previous)"을 함께 적는다.
 * 앱이 기억하는 팝업은 최대 둘(지금 것과 바로 전 것)이다. 그리기·닫기·뒤로 가기는 `features/records/popup`.
 * 링크는 `config/navigation`의 주소를 쓰므로 새 탭으로 열거나 주소를 붙여 넣어도(깊은 링크) 같은 팝업이 뜬다.
 */

export type RecordKind = 'vehicle' | 'batch' | 'bale';
export interface PopupTarget {
  kind: RecordKind;
  id: string;
}

/** 팝업 뒤에 깔린 화면의 주소 */
export interface BackgroundLocation {
  pathname: string;
  search: string;
  hash: string;
  state?: unknown;
}

export interface PopupMeta {
  background: BackgroundLocation;
  /** 바로 전 팝업. 닫으면 이것을 다시 보인다. 그보다 앞의 것은 잊는다 */
  previous: PopupTarget | null;
}

const STATE_KEY = 'recordPopup';
const KIND_OF_SEGMENT: Record<string, RecordKind> = { vehicles: 'vehicle', batches: 'batch', bales: 'bale' };
/** 상세 주소를 바로 열었을 때 뒤에 깔 공정 기록 탭 */
export const RECORD_TAB_OF: Record<RecordKind, RecordsTab> = { vehicle: 'vehicles', batch: 'batches', bale: 'bales' };

export function popupPath(target: PopupTarget): string {
  switch (target.kind) {
    case 'vehicle':
      return vehicleRecordPath(target.id);
    case 'batch':
      return batchRecordPath(target.id);
    case 'bale':
      return baleRecordPath(target.id);
  }
}

/** 이 주소가 기록 상세(팝업) 주소면 그 대상. `/records/batches`(배치·베일 화면)는 아니다 */
export function parsePopupPath(pathname: string): PopupTarget | null {
  const match = /^\/records\/(vehicles|batches|bales)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return { kind: KIND_OF_SEGMENT[match[1]!]!, id: decodeURIComponent(match[2]!) };
  } catch {
    return null;
  }
}

const isTarget = (value: unknown): value is PopupTarget =>
  typeof value === 'object' && value !== null && typeof (value as PopupTarget).id === 'string' && ['vehicle', 'batch', 'bale'].includes((value as PopupTarget).kind);

/** 기록 상태에서 팝업 정보를 읽는다. 상세 주소를 바로 열었으면 없다 */
export function readPopupMeta(state: unknown): PopupMeta | null {
  if (typeof state !== 'object' || state === null) return null;
  const meta = (state as Record<string, unknown>)[STATE_KEY] as Partial<PopupMeta> | undefined;
  if (!meta || typeof meta.background?.pathname !== 'string') return null;
  return { background: meta.background, previous: isTarget(meta.previous) ? meta.previous : null };
}

export const popupState = (background: BackgroundLocation, previous: PopupTarget | null = null) => ({ [STATE_KEY]: { background, previous } satisfies PopupMeta });

export const backgroundOf = (location: Pick<Location, 'pathname' | 'search' | 'hash' | 'state'>): BackgroundLocation => ({
  pathname: location.pathname,
  search: location.search,
  hash: location.hash,
  state: location.state,
});

/** 상세 주소를 바로 열었을 때 뒤에 깔 화면: 그 종류의 공정 기록 탭 */
export function recordsBackground(kind: RecordKind): BackgroundLocation {
  const [pathname = '/records', query = ''] = recordsPath(RECORD_TAB_OF[kind]).split('?');
  return { pathname, search: query ? `?${query}` : '', hash: '' };
}

/** 지금 화면 위에 기록 상세 팝업을 여는 함수 (목록 줄 누르기처럼 링크가 아닌 곳) */
export function useOpenRecordPopup(): (target: PopupTarget) => void {
  const location = useLocation();
  const navigate = useNavigate();
  return (target) => navigate(popupPath(target), { state: popupState(backgroundOf(location)) });
}

/** 지금 화면 위에 기록 상세 팝업을 여는 링크. 주소는 상세 주소라 새 탭으로 열어도 같은 팝업이 뜬다 */
export function PopupLink({ target, className, children, 'aria-label': ariaLabel }: { target: PopupTarget; className?: string; children: ReactNode; 'aria-label'?: string }) {
  const location = useLocation();
  return (
    <Link to={popupPath(target)} state={popupState(backgroundOf(location))} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
