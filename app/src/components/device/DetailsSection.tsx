import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface DetailsSectionProps {
  label?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * "자세히": 이력 그래프·설정·알람 이력을 담는 접힌 영역. 처음에는 닫혀 있다.
 * 안의 내용은 열 때 처음 그리므로, 열기 전에는 이력 요청도 나가지 않는다.
 */
export function DetailsSection({ label = '자세히', defaultOpen = false, children }: DetailsSectionProps) {
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
        <div id={id} className="flex flex-col gap-4 border-t border-line p-4">
          {children}
        </div>
      )}
    </section>
  );
}
