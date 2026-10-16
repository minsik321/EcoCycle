import type { ReactNode } from 'react';
import { PAGE_CONTAINER } from '../layout/PageContainer';

export interface DevicePageProps {
  /** 1. 맨 위: DeviceHero. 그림이 있으면(`illustrated`) 태블릿·데스크톱에서 왼쪽 칸에 놓인다 */
  hero: ReactNode;
  /** 그림이 있는 페이지(섹터)만 true: 태블릿·데스크톱에서 그림 카드 안에 지금/다음을 넣어 카드 하나로 보인다. 그림이 없으면 한 줄로 위에서 아래로 흐른다 */
  illustrated?: boolean;
  /** 2. 주요 수치: KeyTiles (2~4개). 섹터는 수치를 그림 안에 넣어 쓰지 않는다 */
  tiles?: ReactNode;
  /** 3. 지금 / 다음: NowNext */
  now?: ReactNode;
  /** 4. 조작: DeviceActionBar (권한이 없으면 스스로 사라진다) */
  actions?: ReactNode;
  /** 5. 자세히: DetailsSection (처음에는 닫혀 있다). 어느 기기에서나 위쪽 영역 아래에 폭 전체로 놓인다 */
  details?: ReactNode;
  /** 6. 맨 아래 지난 기록: RecordList를 담은 카드 (폭 전체) */
  records?: ReactNode;
}

// 폰에서 조작 줄은 스크롤해도 화면 아래(주 메뉴 바로 위)에 붙어 있고, 내용이 짧으면 남는 공간을 밀어 내 아래로 간다.
// 바깥 여백(p-4)만큼 넓혀 가장자리까지 닿게 한다
/** Tailwind xl과 같은 PC 기준. 섹터는 이 폭 이상에서 "자세히"를 그림 오른쪽에 늘 펼쳐 둔다(접을 수 없음) */
export const WIDE_QUERY = '(min-width: 80rem)';

// 좌우 여백은 앱 틀의 SHELL_GAP_X(px-2 sm:px-2.5), 아래 여백은 pb-4만큼 되돌린다
const PHONE_STICKY = 'sticky -bottom-4 z-10 -mx-2 mt-auto -mb-4 sm:-mx-2.5 md:static md:m-0';

/**
 * 모든 기기 페이지가 쓰는 틀.
 * - 폰: 한 줄. 그림·상태와 주요 수치가 첫 화면에 들어오고, 조작 줄은 화면 아래에 붙는다.
 * - 태블릿·데스크톱, 그림 있음(섹터): 그림 카드 하나 안에 그림과 그 아래 지금/다음 → 조작 → 자세히 → 기록.
 *   PC(xl)는 자세히가 그림 카드 오른쪽에 늘 펼친 채(접기 없음) 같은 높이로 놓인다.
 *   폰: 그림 카드 → 지금/다음(따로 된 카드) → 자세히 → 기록, 조작 줄은 화면 아래에 붙는다.
 * - 태블릿·데스크톱, 그림 없음(로봇팔·압축기·컨베이어): 한 줄로 머리 → 주요 수치(폭 전체 격자) → 지금/다음 → 조작 → 자세히 → 기록.
 * - 자세히와 지난 기록은 어느 쪽이든 위쪽 영역 아래에 폭 전체로 놓인다.
 *   폰에서는 기록이 조작 줄보다 앞이라 조작 줄이 화면 아래에 계속 붙어 있다.
 */
export function DevicePage({ hero, illustrated = false, tiles, now, actions, details, records }: DevicePageProps) {
  if (illustrated) {
    // 폰: 그림 카드와 지금/다음이 따로 된 카드. 태블릿·데스크톱: 감싸는 칸이 카드 하나가 되고 안의 두 카드는 테두리·그림자를 벗어
    // 그림 아래에 지금/다음이 이어진다(가는 구분선). 같은 요소를 한 번만 그려 화면 크기와 상관없이 내용이 겹치지 않는다.
    // PC(xl): 두 칸. 왼쪽 그림 카드, 오른쪽 자세히(WIDE_QUERY 동안 늘 펼침), 두 칸은 높이가 같다(낮은 쪽이 늘어나고, 그림 카드는 그림 칸이 늘어난다).
    // 조작 줄은 자세히 아래, 기록은 아래 폭 전체.
    // 행에 걸치는(row-span) 칸을 두지 않는다: 걸치면 둘째 행이 필요 이상 커져 기록 위에 빈 곳이 생긴다. 기록은 자동 배치라 조작 줄이 없으면 바로 둘째 행에 온다
    return (
      <div className={`${PAGE_CONTAINER} min-h-full md:min-h-0 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:content-start xl:items-stretch xl:gap-6`}>
        <div className="flex flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-panel md:border md:border-line md:bg-surface md:shadow-soft-1 md:*:rounded-none md:*:border-0 md:*:bg-transparent md:*:shadow-none md:[&>*+*]:border-t md:[&>*+*]:border-line xl:col-start-1 xl:row-start-1 xl:*:first:flex-1">
          {hero}
          {tiles}
          {now}
        </div>
        {details && <div className="md:order-2 xl:col-start-2 xl:row-start-1">{details}</div>}
        {records && <div className="md:order-3 xl:col-span-2">{records}</div>}
        {actions && <div className={`${PHONE_STICKY} empty:hidden md:order-1 xl:col-start-2 xl:row-start-2`}>{actions}</div>}
      </div>
    );
  }
  // 그림 없음: 조작 줄은 폰에서 맨 끝(화면 아래에 붙음), 넓은 화면에서는 order로 지금/다음 바로 아래
  return (
    <div className={`${PAGE_CONTAINER} min-h-full md:min-h-0 xl:gap-6`}>
      {hero}
      {tiles}
      {now}
      {details && <div className="md:order-2">{details}</div>}
      {records && <div className="md:order-3">{records}</div>}
      {actions && <div className={`${PHONE_STICKY} empty:hidden md:order-1`}>{actions}</div>}
    </div>
  );
}
