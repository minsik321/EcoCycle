import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface DetailsSectionProps {
  label?: string;
  defaultOpen?: boolean;
  /** 넓은 칸(왼쪽): 이력 그래프·진단 표처럼 넓을수록 좋은 것. 없으면 side가 폭 전체를 나눠 쓴다 */
  children?: ReactNode;
  /** 오른쪽 칸: 설정·알람 이력처럼 세로로 쌓는 것. 폰에서는 children 아래에 이어진다 */
  side?: ReactNode;
}

/**
 * "자세히": 이력 그래프·설정·알람 이력을 담는 접힌 영역. 처음에는 닫혀 있다.
 * 안의 내용은 열 때 처음 그리므로, 열기 전에는 이력 요청도 나가지 않는다.
 * 늘 DevicePage 맨 위 영역 아래에 폭 전체로 놓이고, 태블릿·데스크톱에서는 안을 가로로 펼친다
 * (왼쪽 넓은 칸 children, 오른쪽 side). 한쪽만 있으면 그 쪽이 폭 전체를 쓴다.
 */
export function DetailsSection({ label = '자세히', defaultOpen = false, children, side }: DetailsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="rounded-card border border-line bg-surface shadow-soft-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-card px-4 text-base font-semibold text-ink select-none active:bg-paper-deep"
      >
        {label}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-5 w-5 text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          className={`grid grid-cols-1 gap-4 border-t border-line p-4 md:items-start ${children && side ? 'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : side ? 'md:grid-cols-2' : ''}`}
        >
          {children && <div className="flex min-w-0 flex-col gap-4">{children}</div>}
          {side && <div className="flex min-w-0 flex-col gap-4">{side}</div>}
        </div>
      )}
    </section>
  );
}
