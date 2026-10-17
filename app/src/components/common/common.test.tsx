import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../controls/ConfirmDialog';
import { Button } from './Button';
import { Card } from './Card';
import { Dialog } from './Dialog';

describe('Button', () => {
  it('터치 대상 최소 크기 클래스를 갖고, 기본 type은 button이다', () => {
    render(<Button>확인</Button>);
    const button = screen.getByRole('button', { name: '확인' });
    expect(button).toHaveClass('min-h-12', 'min-w-12');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('처리 중에는 비활성화하고 중복 클릭을 막는다', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        보내기
      </Button>,
    );
    const button = screen.getByRole('button', { name: '보내기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Card', () => {
  it('제목과 오른쪽 내용을 보여 준다', () => {
    render(
      <Card title="적재율" aside={<span>정상</span>}>
        72%
      </Card>,
    );
    expect(screen.getByRole('heading', { name: '적재율' })).toBeInTheDocument();
    expect(screen.getByText('정상')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
  });
});

function Harness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>열기</button>
      <Dialog open={open} title="제목" onClose={() => setOpen(false)} dismissible={dismissible} actions={<><button data-autofocus>첫째</button><button>둘째</button></>}>
        내용
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('열리면 role=dialog로 제목과 연결되고 autofocus 요소로 초점이 간다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('열기'));
    const dialog = screen.getByRole('dialog', { name: '제목' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('첫째')).toHaveFocus();
  });

  it('Esc로 닫히고 열기 전 위치로 초점이 돌아간다', async () => {
    render(<Harness />);
    const opener = screen.getByText('열기');
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('Tab이 대화상자 밖으로 나가지 않는다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('열기'));
    expect(screen.getByText('첫째')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText('둘째')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText('첫째')).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByText('둘째')).toHaveFocus();
  });

  it('바깥을 누르면 닫히지만 dismissible=false이면 닫히지 않는다', async () => {
    const { unmount } = render(<Harness />);
    await userEvent.click(screen.getByText('열기'));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    render(<Harness dismissible={false} />);
    await userEvent.click(screen.getByText('열기'));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  const setup = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="모드 전환" message="운전 모드를 바꿉니다." onConfirm={onConfirm} onCancel={onCancel} {...props} />);
    return { onConfirm, onCancel };
  };

  it('처음 초점은 취소에 있어서 실수로 엔터를 쳐도 실행되지 않는다', async () => {
    const { onConfirm, onCancel } = setup();
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('확인을 누르면 onConfirm을 부른다', async () => {
    const { onConfirm } = setup({ confirmLabel: '실행' });
    await userEvent.click(screen.getByRole('button', { name: '실행' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Esc는 취소다', async () => {
    const { onCancel, onConfirm } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('처리 중에는 확인·취소를 막고 Esc로도 닫히지 않는다', async () => {
    const { onCancel, onConfirm } = setup({ pending: true });
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('재인증 입력 같은 내용을 children으로 끼워 넣을 수 있다', () => {
    setup({ children: <input aria-label="PIN" /> });
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
  });

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
