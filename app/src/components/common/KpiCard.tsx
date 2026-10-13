import type { ReactNode } from 'react';
import { GlassPanel } from './GlassPanel';
import { Sparkline } from './Sparkline';

export interface KpiCardProps {
  label: string;
  /** 표시할 값(형식을 맞춘 문자열). 아직 받지 못했으면 null */
  value: string | null;
  unit?: string;
  /** 작은 추이선에 쓸 값(오래된 것부터). 없으면 그리지 않는다 */
  trend?: readonly number[];
  /** 값 아래 한 줄 (예: 마지막 갱신 시각) */
  note?: ReactNode;
  /** 유리 패널로 띄울지(3D 화면 위), 일반 카드로 둘지 */
  glass?: boolean;
  className?: string;
}

/** 지표 카드: 이름, 큰 숫자, 작은 추이선. 값은 서버가 준 것을 표시만 한다. */
export function KpiCard({ label, value, unit, trend, note, glass = true, className = '' }: KpiCardProps) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        <p className="mt-0.5 text-3xl leading-tight font-bold text-ink">
          {value ?? '–'}
          {value !== null && unit && <span className="ml-1 text-base font-semibold text-ink-soft">{unit}</span>}
        </p>
        {note && <p className="mt-0.5 text-xs text-ink-faint">{note}</p>}
      </div>
      {trend && <Sparkline values={trend} className="shrink-0 self-end" />}
    </>
  );
  const layout = `flex items-start justify-between gap-3 p-4 ${className}`;
  return glass ? (
    <GlassPanel as="section" aria-label={label} className={layout}>
      {body}
    </GlassPanel>
  ) : (
    <section aria-label={label} className={`rounded-card border border-line bg-surface shadow-soft-1 ${layout}`}>
      {body}
    </section>
  );
}
