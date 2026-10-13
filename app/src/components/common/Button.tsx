import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 처리 중: 비활성화하고 중복 클릭을 막는다 */
  loading?: boolean;
}

// 터치 대상은 최소 48px. 호버에 의존하지 않는다.
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-slate-800 text-white border-slate-800 active:bg-slate-900 disabled:bg-slate-300 disabled:border-slate-300',
  secondary: 'bg-white text-slate-900 border-slate-400 active:bg-slate-100 disabled:text-slate-400 disabled:border-slate-300',
  quiet: 'bg-transparent text-slate-800 border-transparent active:bg-slate-100 disabled:text-slate-400',
};

export function Button({ variant = 'secondary', loading = false, disabled, className = '', children, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium select-none disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
