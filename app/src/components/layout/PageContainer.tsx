import type { ReactNode } from 'react';

/**
 * 모든 화면(라우트)이 쓰는 페이지 틀: 가운데 정렬, 같은 최대 폭, 같은 세로 간격.
 * 바깥 여백(p-4)은 앱 틀(`AppShell`의 main)이 준다. 화면이 따로 max-w를 정하지 않는다.
 * 읽기용 상세(기록 상세처럼 한 줄 글이 긴 화면)만 예외로 좁은 폭을 쓴다.
 */
export const PAGE_CONTAINER = 'mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-3 md:gap-4';

export function PageContainer({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`${PAGE_CONTAINER} ${className}`}>{children}</div>;
}
