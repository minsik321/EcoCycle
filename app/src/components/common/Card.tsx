import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** 제목 오른쪽에 둘 것(상태 배지 등) */
  aside?: ReactNode;
}

export function Card({ title, aside, className = '', children, ...rest }: CardProps) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`} {...rest}>
      {(title || aside) && (
        <header className="mb-2 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-600">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
