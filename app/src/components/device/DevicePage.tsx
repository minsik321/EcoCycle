import type { ReactNode } from 'react';

export interface DevicePageProps {
  /** 1. 맨 위: DeviceHero. 그림이 있으면(`illustrated`) 태블릿·데스크톱에서 왼쪽 칸에 놓인다 */
  hero: ReactNode;
  /** 그림이 있는 페이지(섹터)만 true: 위쪽을 두 칸(왼쪽 그림, 오른쪽 수치·지금/다음)으로 나눈다. 그림이 없으면 한 줄로 위에서 아래로 흐른다 */
  illustrated?: boolean;
  /** 2. 주요 수치: KeyTiles (2~4개) */
  tiles: ReactNode;
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
const PHONE_STICKY = 'sticky -bottom-4 z-10 -mx-4 mt-auto -mb-4 md:static md:m-0';

/**
 * 모든 기기 페이지가 쓰는 틀.
 * - 폰: 한 줄. 그림·상태와 주요 수치가 첫 화면에 들어오고, 조작 줄은 화면 아래에 붙는다.
 * - 태블릿·데스크톱, 그림 있음(섹터): 위쪽은 두 칸(왼쪽 그림과 조작, 오른쪽 수치·지금/다음). 데스크톱은 여백만 넓어진다.
 * - 태블릿·데스크톱, 그림 없음(로봇팔·압축기·컨베이어): 한 줄로 머리 → 주요 수치(폭 전체 격자) → 지금/다음 → 조작 → 자세히 → 기록.
 * - 자세히와 지난 기록은 어느 쪽이든 위쪽 영역 아래에 폭 전체로 놓인다(오른쪽 칸 안에 넣지 않아 왼쪽에 빈 곳이 생기지 않는다).
 *   폰에서는 기록이 조작 줄보다 앞이라 조작 줄이 화면 아래에 계속 붙어 있다.
 */
export function DevicePage({ hero, illustrated = false, tiles, now, actions, details, records }: DevicePageProps) {
  if (illustrated) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-3 md:grid md:min-h-0 md:grid-cols-2 md:grid-rows-[auto_1fr_auto_auto] md:items-start md:gap-4 xl:gap-6">
        <div className="md:col-start-1 md:row-start-1">{hero}</div>
        <div className="flex flex-col gap-3 md:col-start-2 md:row-span-2 md:row-start-1 md:gap-4">
          {tiles}
          {now}
        </div>
        {details && <div className="md:col-span-2 md:row-start-3">{details}</div>}
        {records && <div className="md:col-span-2 md:row-start-4">{records}</div>}
        {actions && <div className={`${PHONE_STICKY} md:col-start-1 md:row-start-2`}>{actions}</div>}
      </div>
    );
  }
  // 그림 없음: 조작 줄은 폰에서 맨 끝(화면 아래에 붙음), 넓은 화면에서는 order로 지금/다음 바로 아래
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-3 md:min-h-0 md:gap-4 xl:gap-6">
      {hero}
      {tiles}
      {now}
      {details && <div className="md:order-2">{details}</div>}
      {records && <div className="md:order-3">{records}</div>}
      {actions && <div className={`${PHONE_STICKY} md:order-1`}>{actions}</div>}
    </div>
  );
}
