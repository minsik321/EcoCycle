import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** 좁은 화면에서 숨길 열 (true: sm 미만, 'xl': 데스크톱(xl) 미만 — 세로 태블릿에서도 숨긴다) */
  hideOnNarrow?: boolean | 'xl';
}

export interface DataTableProps<T> {
  /** 표의 이름 (화면 읽기용) */
  label: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** 줄을 누르면 부른다 (예: 그 대상으로 카메라 이동). 주면 줄이 버튼처럼 동작한다 */
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  empty?: string;
  className?: string;
}

/** 표. 줄 높이는 터치하기 쉽게 44px 이상이고, 가로로 넘치면 표 안에서만 스크롤한다. */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  empty = '표시할 항목이 없습니다.',
  className = '',
}: DataTableProps<T>) {
  if (rows.length === 0) return <p className={`px-2 py-4 text-sm text-ink-faint ${className}`}>{empty}</p>;
  const cellClass = (c: Column<T>) => `${c.align === 'right' ? 'text-right' : 'text-left'} ${c.hideOnNarrow === 'xl' ? 'hidden xl:table-cell' : c.hideOnNarrow ? 'hidden sm:table-cell' : ''}`;
  return (
    <div className={`overflow-auto ${className}`}>
      <table aria-label={label} className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`sticky top-0 border-b border-line bg-surface/90 px-3 py-2 text-xs font-semibold whitespace-nowrap text-ink-faint ${cellClass(c)}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const selected = key === selectedKey;
            return (
              <tr
                key={key}
                aria-selected={onRowClick ? selected : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        onRowClick(row);
                      }
                    : undefined
                }
                className={`${onRowClick ? 'cursor-pointer active:bg-accent-soft' : ''} ${selected ? 'bg-accent-soft' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`h-11 border-b border-line/70 px-3 whitespace-nowrap text-ink ${cellClass(c)}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
