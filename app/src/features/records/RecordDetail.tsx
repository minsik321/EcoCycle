import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { recordsPath } from '../../config/navigation';
import type { RecordsTab } from '../../config/navigation';
import type { RecordState } from './useRecord';

// 기록 상세 팝업(차량·배치·베일)이 함께 쓰는 조각: 불러오는 중·없음·오류 처리, 묶음 칸, 이름 · 값 줄.

/** 이름 · 값 한 줄: 같은 기준선, 값은 오른쪽에 고정 폭 숫자 (`.kv-row`) */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-row border-b border-line py-2 last:border-b-0">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="text-sm font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}

/** 팝업 안의 묶음 하나 (카드 안에 카드를 겹치지 않게 옅은 바탕만). 이름은 화면 읽기용 영역 이름도 된다 */
export function DetailSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-control bg-paper px-3 py-2">
      <header className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-ink-soft">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function BackToRecords({ tab }: { tab: RecordsTab }) {
  return (
    <Link to={recordsPath(tab)} className="inline-flex min-h-12 items-center gap-1 self-start rounded-control px-1 text-sm font-semibold text-accent-strong active:bg-paper-deep">
      <span aria-hidden="true">←</span> 공정 기록
    </Link>
  );
}

/** 상세 팝업의 본문 틀. 기록이 아직 없거나 못 받았을 때의 안내도 여기서 한다 */
export function RecordFrame<T>({ name, state, retry, children }: { name: string; state: RecordState<T>; retry: () => void; children: (data: T) => ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 text-ink">
      {state.status === 'loading' && (
        <p role="status" className="py-6 text-center text-sm text-ink-faint">
          불러오는 중…
        </p>
      )}
      {state.status === 'missing' && <p className="py-4 text-sm text-ink-soft">{name} 기록을 찾을 수 없습니다. 보관 기간이 지났거나 번호가 잘못되었을 수 있습니다.</p>}
      {state.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-control border border-status-alarm/40 bg-status-alarm/5 px-3 py-2 text-sm text-ink">
          <span className="flex-1">{name} 기록을 불러오지 못했습니다.</span>
          <Button onClick={retry}>다시 시도</Button>
        </div>
      )}
      {state.status === 'ok' && children(state.data)}
    </div>
  );
}
