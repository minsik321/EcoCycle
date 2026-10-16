import { useId, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export interface DetailsSectionProps {
  label?: string;
  defaultOpen?: boolean;
  /** 이 미디어 쿼리가 맞는 동안은 늘 펼쳐 두고 접을 수 없다(접기 버튼 대신 제목만). 섹터: PC에서 그림 오른쪽 */
  pinnedWhen?: string;
  /** 넓은 칸(왼쪽): 이력 그래프·진단 표처럼 넓을수록 좋은 것. 없으면 side가 폭 전체를 나눠 쓴다 */
  children?: ReactNode;
  /** 오른쪽 칸: 설정·알람 이력처럼 세로로 쌓는 것. 폰에서는 children 아래에 이어진다 */
  side?: ReactNode;
}

/**
 * "자세히": 이력 그래프·설정·알람 이력을 담는 접힌 영역. 처음에는 닫혀 있다.
 * 안의 내용은 열 때 처음 그리므로, 열기 전에는 이력 요청도 나가지 않는다.
 * 대개 DevicePage 맨 위 영역 아래에 폭 전체로 놓인다(섹터는 PC에서 그림 오른쪽). 안은 이 영역의 폭(컨테이너 쿼리)이
 * 넉넉하면 가로로 펼치고(왼쪽 넓은 칸 children, 오른쪽 side), 좁으면 세로로 쌓는다. 한쪽만 있으면 그 쪽이 폭 전체를 쓴다.
 */
const noop = () => () => {};

/** 미디어 쿼리가 지금 맞는지 (창 크기가 바뀌면 다시 그린다). matchMedia가 없으면(테스트 환경) 늘 false */
function useMediaQuery(query: string | undefined): boolean {
  const list =
    query && typeof matchMedia === "function" ? matchMedia(query) : null;
  return useSyncExternalStore(
    list
      ? (onChange) => {
          list.addEventListener("change", onChange);
          return () => list.removeEventListener("change", onChange);
        }
      : noop,
    () => list?.matches ?? false,
  );
}

export function DetailsSection({
  label = "자세히",
  defaultOpen = false,
  pinnedWhen,
  children,
  side,
}: DetailsSectionProps) {
  const [openState, setOpen] = useState(defaultOpen);
  const pinned = useMediaQuery(pinnedWhen);
  const open = pinned || openState;
  const id = useId();
  return (
    <section
      aria-label={pinned ? label : undefined}
      className="@container h-full rounded-card border border-line bg-surface shadow-soft-1"
    >
      {pinned ? (
        <h2 className="flex min-h-12 items-center px-4 text-base font-semibold text-ink">
          {label}
        </h2>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-2 rounded-card px-4 text-base font-semibold text-ink select-none active:bg-paper-deep"
        >
          {label}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`h-5 w-5 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      {open && (
        <div
          id={id}
          className={`grid grid-cols-1 gap-4 border-t border-line p-4 @xl:items-start ${children && side ? "@xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : side ? "@xl:grid-cols-2" : ""}`}
        >
          {children && (
            <div className="flex min-w-0 flex-col gap-4">{children}</div>
          )}
          {side && <div className="flex min-w-0 flex-col gap-4">{side}</div>}
        </div>
      )}
    </section>
  );
}
