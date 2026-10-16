import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DialogProps {
  open: boolean;
  title: string;
  /** Esc, 바깥 누르기로 닫을 때 부른다 */
  onClose: () => void;
  /** false이면 Esc와 바깥 누르기로 닫히지 않는다 (처리 중일 때) */
  dismissible?: boolean;
  children: ReactNode;
  /** 하단 버튼 영역 */
  actions?: ReactNode;
  /**
   * md: 확인 대화상자 크기, xl: 영상처럼 넓은 내용, sheet: 폰은 아래 시트·640px 이상은 가운데 대화상자.
   * popup·popupNarrow: 기록 상세 팝업. 폰은 아래 시트(내용이 길면 화면 높이 전체), 640px 이상은 가운데 대화상자(narrow는 좁게)
   */
  size?: 'md' | 'xl' | 'sheet' | 'popup' | 'popupNarrow';
  /** 주면 제목 줄 오른쪽에 X 아이콘 닫기 버튼을 둔다 (이름표는 화면 읽기용 이름, 모든 팝업이 "닫기"로 같다) */
  closeLabel?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 모달 대화상자. 열리면 `data-autofocus`가 붙은 요소(없으면 첫 버튼)로 초점을 옮기고,
 * Tab이 대화상자 밖으로 나가지 않게 하며, 닫히면 열기 전 위치로 초점을 돌려준다.
 */
export function Dialog({ open, title, onClose, dismissible = true, children, actions, size = 'md', closeLabel }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const bottomSheet = size === 'sheet' || size === 'popup' || size === 'popupNarrow';
  const panelSize =
    size === 'sheet'
      ? 'max-w-2xl max-h-[90dvh] overflow-y-auto rounded-t-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-panel sm:p-6'
      : size === 'popup' || size === 'popupNarrow'
        ? `${size === 'popup' ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[100dvh] overflow-y-auto overscroll-contain rounded-t-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[90dvh] sm:rounded-panel sm:p-6`
        : `${size === 'xl' ? 'max-w-4xl' : 'max-w-md'} rounded-panel p-6`;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-ink/40 ${bottomSheet ? 'items-end sm:items-center sm:p-6' : 'items-center p-4'}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`w-full ${panelSize} bg-surface shadow-soft-3 outline-none`}
      >
        {closeLabel ? (
          <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
            <h2 id={titleId} className="min-w-0 truncate text-lg font-bold text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="-mr-2 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-ink-soft active:bg-paper-deep"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ) : (
          <h2 id={titleId} className="mb-2 text-lg font-bold text-ink">
            {title}
          </h2>
        )}
        <div className="text-base text-ink-soft">{children}</div>
        {actions && <div className="mt-5 flex justify-end gap-3">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
