import type { ReactNode } from 'react';

/**
 * 홈 상단 카드 줄의 틀(함수율, 전체 적재율, 시스템 상태). 카드 내용은 홈 화면이 채운다.
 * 한 기기당 숫자는 2개 정도로 제한한다. 좁은 화면에서는 세로로 쌓인다.
 */
export function TopCards({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label="요약" className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${className}`}>
      {children}
    </div>
  );
}
