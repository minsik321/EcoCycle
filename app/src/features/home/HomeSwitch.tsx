import type { HomeMode } from '../../store';

const OPTIONS: ReadonlyArray<{ key: HomeMode; label: string }> = [
  { key: '3d', label: '3D' },
  { key: 'dashboard', label: '대시보드' },
];

export interface HomeSwitchProps {
  mode: HomeMode;
  onChange: (mode: HomeMode) => void;
  /** 이 기기에서 3D를 그릴 수 없다(WebGL 없음, 3D 오류): "3D"를 누를 수 없게 둔다 */
  can3d: boolean;
}

/**
 * 홈 맨 위의 전환 하나: 3D(3D 장면) | 대시보드(3D 없는 화면).
 * 3D 안에서는 3D 홈 상단 바에 들어가고(모양은 studio.css가 맞춘다), 대시보드에서는 화면 맨 위에 놓인다.
 */
export function HomeSwitch({ mode, onChange, can3d }: HomeSwitchProps) {
  return (
    <div role="tablist" aria-label="홈 보기" className="inline-flex shrink-0 gap-1 rounded-control border border-line bg-surface p-1 shadow-soft-1">
      {OPTIONS.map((o) => {
        const disabled = o.key === '3d' && !can3d;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={mode === o.key}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={`min-h-10 min-w-16 rounded-control px-4 text-sm font-semibold whitespace-nowrap disabled:opacity-40 ${
              mode === o.key ? 'bg-ink text-surface' : 'text-ink-soft'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
