import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEVICE_STATUSES } from '@ecocycle/shared';
import { STATUS_SYMBOL, STATUS_TEXT } from '../../config/display';
import { renderWithStore } from '../../test/utils';
import { OfflineNotice } from './OfflineNotice';
import { StatusBadge } from './StatusBadge';
import { Timestamp } from './Timestamp';

describe('StatusBadge', () => {
  it.each(DEVICE_STATUSES)('%s: 색만이 아니라 기호와 글자로도 구분된다', (status) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(STATUS_TEXT[status])).toBeInTheDocument();
    expect(container.textContent).toContain(STATUS_SYMBOL[status]);
    expect(container.firstElementChild).toHaveAttribute('data-status', status);
  });

  it('문구와 기호를 바꿔 쓸 수 있다 (로봇 상태 등)', () => {
    const { container } = render(<StatusBadge status="caution" label="일시정지" symbol="Ⅱ" />);
    expect(screen.getByText('일시정지')).toBeInTheDocument();
    expect(container.textContent).toContain('Ⅱ');
    expect(screen.queryByText('주의')).not.toBeInTheDocument();
  });
});

describe('Timestamp', () => {
  it('ISO 시각을 현지 시각으로 보여 주고 원래 값을 dateTime에 둔다', () => {
    render(<Timestamp iso="2026-10-13T05:23:11.250Z" />);
    const el = screen.getByText(/\d{2}:\d{2}:\d{2}/);
    expect(el.tagName).toBe('TIME');
    expect(el).toHaveAttribute('datetime', '2026-10-13T05:23:11.250Z');
  });

  it('값이 없으면 -', () => {
    render(<Timestamp iso={null} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('OfflineNotice', () => {
  it('연결되어 있으면 아무것도 그리지 않는다', () => {
    const { container } = renderWithStore(<OfflineNotice />, { connection: 'online' });
    expect(container).toBeEmptyDOMElement();
  });

  it('끊기면 "연결 끊김"과 마지막 수신 시각을 알린다 (마지막 값을 정상처럼 보여 주지 않는다)', () => {
    renderWithStore(<OfflineNotice />, { connection: 'offline', lastReceivedAt: '2026-10-13T05:23:11.250Z' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('연결 끊김');
    expect(alert).toHaveTextContent('마지막 수신');
    expect(alert.querySelector('time')).toHaveAttribute('datetime', '2026-10-13T05:23:11.250Z');
    expect(alert).toHaveTextContent('마지막으로 받은 값');
  });

  it('한 번도 받은 적이 없으면 시각 자리에 -를 보여 준다', () => {
    renderWithStore(<OfflineNotice />, { connection: 'offline', lastReceivedAt: null });
    expect(screen.getByRole('alert')).toHaveTextContent('마지막 수신 -');
  });

  it('처음 연결하는 중에는 끊김이 아니라 연결 중으로 보여 준다', () => {
    renderWithStore(<OfflineNotice />, { connection: 'connecting', lastReceivedAt: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('연결하는 중');
  });
});
