import type { HomeTab } from './homeTab';

const TABS: ReadonlyArray<{ key: HomeTab; label: string }> = [
  { key: 'basic', label: '기본' },
  { key: 'studio', label: '스튜디오' },
];

/** 홈 3D 영역 위의 탭: 기본(기존 장면) / 스튜디오(새 고화질 시안, 누를 때 내려받는다) */
export function HomeTabs({ tab, onChange }: { tab: HomeTab; onChange: (tab: HomeTab) => void }) {
  return (
    <div role="tablist" aria-label="3D 장면 종류" className="flex gap-1 rounded-lg border border-slate-300 bg-white p-1">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={tab === t.key}
          onClick={() => onChange(t.key)}
          className={`min-h-10 rounded-md px-4 text-sm font-semibold ${tab === t.key ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
