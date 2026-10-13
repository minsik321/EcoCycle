import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** 제목 오른쪽에 둘 것(상태 배지 등) */
  aside?: ReactNode;
  /** 3D 화면 위에 띄울 때: 유리 패널로 그린다 (화질 단계가 낮으면 단색) */
  glass?: boolean;
}

export function Card({ title, aside, glass = false, className = '', children, ...rest }: CardProps) {
  const surface = glass ? 'glass' : 'border border-line bg-surface shadow-soft-1';
  return (
    <section className={`rounded-card p-4 ${surface} ${className}`} {...rest}>
      {(title || aside) && (
        <header className="mb-2 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink-soft">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
