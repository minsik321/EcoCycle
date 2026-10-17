import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 처리 중: 비활성화하고 중복 클릭을 막는다 */
  loading?: boolean;
}

// 터치 대상은 최소 48px. 호버에 의존하지 않는다.
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white border-accent shadow-soft-1 active:bg-accent-strong disabled:bg-ink-faint/50 disabled:border-transparent disabled:shadow-none',
  secondary: 'bg-surface text-ink border-line shadow-soft-1 active:bg-paper-deep disabled:text-ink-faint disabled:shadow-none',
  quiet: 'bg-transparent text-ink border-transparent active:bg-paper-deep disabled:text-ink-faint',
};

export function Button({ variant = 'secondary', loading = false, disabled, className = '', children, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-control border px-4 text-base font-semibold select-none disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
