import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** 탭 이름 옆 숫자(건수 등) */
  count?: number;
}

export interface TabsProps<K extends string> {
  /** 탭 묶음의 이름 (화면 읽기용) */
  label: string;
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** 선택된 탭의 내용 */
  children: ReactNode;
  className?: string;
}

/** 탭. 좌우 화살표로 옮길 수 있고, 터치 대상은 48px 이상이다. */
export function Tabs<K extends string>({ label, items, value, onChange, children, className = '' }: TabsProps<K>) {
  const id = useId();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = items.findIndex((item) => item.key === value);
    const next = items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    if (!next) return;
    event.preventDefault();
    onChange(next.key);
    document.getElementById(`${id}-tab-${next.key}`)?.focus();
  };
  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const selected = item.key === value;
          return (
            <button
              key={item.key}
              id={`${id}-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.key)}
              className={`inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-control px-4 text-sm font-semibold select-none ${
                selected ? 'bg-accent text-white' : 'text-ink-soft active:bg-paper-deep'
              }`}
            >
              {item.label}
              {item.count !== undefined && (
                <span className={`rounded-full px-1.5 text-xs ${selected ? 'bg-white/25' : 'bg-paper-deep text-ink-soft'}`}>{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${value}`} className="mt-2">
        {children}
      </div>
    </div>
  );
}
