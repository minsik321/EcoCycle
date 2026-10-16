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
 * 어느 쪽에서나 앱 상단 바(components/layout/TopBar)의 가운데 칸에 들어간다: 3D는 3D 위에 뜬 바, 대시보드는 틀의 바(useHeaderSlot).
 */
export function HomeSwitch({ mode, onChange, can3d }: HomeSwitchProps) {
  return (
    <div role="tablist" aria-label="홈 보기" className="inline-flex shrink-0 gap-0.5 rounded-control bg-ink/5 p-1">
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
            className={`min-h-10 min-w-12 rounded-[0.6rem] px-3 text-sm font-semibold whitespace-nowrap disabled:opacity-40 sm:px-4 ${
              mode === o.key ? 'bg-surface text-accent shadow-soft-1' : 'text-ink-soft'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
