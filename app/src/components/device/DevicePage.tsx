import type { ReactNode } from 'react';

export interface DevicePageProps {
  /** 1. 맨 위: DeviceHero */
  hero: ReactNode;
  /** 2. 주요 수치: KeyTiles (2~4개) */
  tiles: ReactNode;
  /** 3. 지금 / 다음: NowNext */
  now?: ReactNode;
  /** 4. 조작: DeviceActionBar (권한이 없으면 스스로 사라진다) */
  actions?: ReactNode;
  /** 5. 자세히: DetailsSection (처음에는 닫혀 있다) */
  details?: ReactNode;
}

/**
 * 모든 기기 페이지가 쓰는 틀.
 * - 폰: 한 줄. 그림과 주요 수치가 첫 화면에 들어오고, 조작 줄은 화면 아래에 붙는다.
 * - 태블릿·데스크톱: 두 줄(왼쪽 그림과 조작, 오른쪽 수치·지금/다음·자세히). 데스크톱은 여백만 넓어진다.
 */
export function DevicePage({ hero, tiles, now, actions, details }: DevicePageProps) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-3 md:grid md:min-h-0 md:grid-cols-2 md:grid-rows-[auto_1fr] md:items-start md:gap-4 xl:gap-6">
      <div className="md:col-start-1 md:row-start-1">{hero}</div>
      <div className="flex flex-col gap-3 md:col-start-2 md:row-span-2 md:row-start-1 md:gap-4">
        {tiles}
        {now}
        {details}
      </div>
      {/* 좁은 화면: 조작 줄은 스크롤해도 화면 아래(주 메뉴 바로 위)에 붙어 있고, 내용이 짧으면 남는 공간을 밀어 내 아래로 간다.
          바깥 여백(p-4)만큼 넓혀 가장자리까지 닿게 한다 */}
      {actions && (
        <div className="sticky -bottom-4 z-10 -mx-4 mt-auto -mb-4 md:static md:col-start-1 md:row-start-2 md:m-0">{actions}</div>
      )}
    </div>
  );
}
