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
  /** md: 확인 대화상자 크기, xl: 영상처럼 넓은 내용 */
  size?: 'md' | 'xl';
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 모달 대화상자. 열리면 `data-autofocus`가 붙은 요소(없으면 첫 버튼)로 초점을 옮기고,
 * Tab이 대화상자 밖으로 나가지 않게 하며, 닫히면 열기 전 위치로 초점을 돌려준다.
 */
export function Dialog({ open, title, onClose, dismissible = true, children, actions, size = 'md' }: DialogProps) {
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
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
        className={`w-full ${size === 'xl' ? 'max-w-4xl' : 'max-w-md'} rounded-panel bg-surface p-6 shadow-soft-3 outline-none`}
      >
        <h2 id={titleId} className="mb-2 text-lg font-bold text-ink">
          {title}
        </h2>
        <div className="text-base text-ink-soft">{children}</div>
        {actions && <div className="mt-5 flex justify-end gap-3">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
