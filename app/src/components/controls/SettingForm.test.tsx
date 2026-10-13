import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api';
import { commandResultReceived } from '../../store';
import { DEVICE_SETTINGS } from '../../config/settings';
import { ADMIN, OPERATOR, renderWithStore } from '../../test/utils';
import { SettingForm } from './SettingForm';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  sendCommand: vi.fn(),
  getCommand: vi.fn(),
}));

const field = DEVICE_SETTINGS.tank[0]!;
const input = () => screen.getByLabelText(field.label);

beforeEach(() => {
  vi.mocked(api.sendCommand).mockReset();
  vi.mocked(api.sendCommand).mockResolvedValue({ idempotencyKey: 'k', accepted: { commandId: 'cmd-1', status: 'accepted' } });
});

describe('SettingForm', () => {
  it('설정 이름, 단위, 설명과 허용 범위를 보여 준다', () => {
    renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: ADMIN });
    expect(input()).toHaveAttribute('placeholder', '1 ~ 94');
    expect(screen.getByText(field.help, { exact: false })).toBeInTheDocument();
    expect(input()).toHaveAccessibleDescription(expect.stringContaining('서버가 "주의"로 판정'));
  });

  it('설정 권한이 없으면 입력과 버튼을 막고 이유를 보여 준다 (작업자)', () => {
    renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: OPERATOR });
    expect(input()).toBeDisabled();
    expect(screen.getByRole('button', { name: '설정 변경' })).toBeDisabled();
    expect(screen.getByText('설정을 바꿀 권한이 없습니다.')).toBeInTheDocument();
  });

  it('연결이 끊기면 막는다', () => {
    renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: ADMIN, connection: 'offline' });
    expect(screen.getByRole('button', { name: '설정 변경' })).toBeDisabled();
    expect(screen.getByText(/연결이 끊겨/)).toBeInTheDocument();
  });

  it.each([
    ['', /입력하세요/],
    ['abc', '숫자로 입력하세요.'],
    ['0', '1% ~ 94% 사이로 입력하세요.'],
    ['95', '1% ~ 94% 사이로 입력하세요.'],
  ])('잘못된 값 "%s"은 확인 단계 없이 안내하고 보내지 않는다', async (text, message) => {
    renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: ADMIN });
    if (text) await userEvent.type(input(), text);
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it('값을 고치기 시작하면 오류 문구가 사라진다', async () => {
    renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: ADMIN });
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.type(input(), '7');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('올바른 값이면 확인 단계를 거치고, 확인해야만 confirm: true로 보낸다', async () => {
    renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: ADMIN });
    await userEvent.type(input(), '70');
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));

    const dialog = screen.getByRole('dialog', { name: '주의 기준 적재율 변경' });
    expect(dialog).toHaveTextContent('탱크 A1');
    expect(dialog).toHaveTextContent('70%');
    expect(api.sendCommand).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: '변경' }));
    expect(api.sendCommand).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.sendCommand).mock.calls[0]![0]).toBe('tank-a1');
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({
      type: 'update_setting',
      key: 'cautionThresholdPercent',
      value: 70,
      confirm: true,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(input()).toHaveValue('');
    expect(screen.getByText(/마지막으로 보낸 값: 70%/)).toBeInTheDocument();
  });

  it('취소하면 보내지 않고 입력한 값을 남겨 둔다', async () => {
    renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: ADMIN });
    await userEvent.type(input(), '70');
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(api.sendCommand).not.toHaveBeenCalled();
    expect(input()).toHaveValue('70');
  });

  it('처리 중에는 다시 보낼 수 없다', async () => {
    const { store } = renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: ADMIN });
    await userEvent.type(input(), '70');
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));
    await userEvent.click(screen.getByRole('button', { name: '변경' }));
    const busy = await screen.findByRole('button', { name: '설정 변경', busy: true });
    expect(busy).toBeDisabled();

    act(() => {
      store.dispatch(commandResultReceived({ commandId: 'cmd-1', status: 'completed', reason: null }));
    });
    expect(await screen.findByRole('button', { name: '설정 변경', busy: false })).toBeEnabled();
  });

  it('현재 설정값은 읽을 수 없으므로 현재 값이라고 보여 주지 않는다 (B18)', () => {
    renderWithStore(<SettingForm deviceId="tank-a1" field={field} />, { me: ADMIN });
    expect(screen.queryByText(/현재 값/)).not.toBeInTheDocument();
  });
});
