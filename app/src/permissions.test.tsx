// 권한별 화면 분기 점검 (G-32).
// 권한 표는 모의 서버의 가정(docs/decisions.md: admin 5개 전부, operator 2개, viewer 없음)을 기준으로 한다.
// 이 파일이 "누가 어느 화면에서 무엇을 보고 누를 수 있는가"의 한 장짜리 기준표다. 권한 종류가 확정되어 바뀌면 이 표부터 고친다.
// 화면의 표시·비활성은 편의일 뿐이고 실제 차단은 서버가 한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { act, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_RULES } from '@ecocycle/shared';
import type { Alarm, CommandType, Me, Role } from '@ecocycle/shared';
import { ROLE_PERMISSIONS } from '../../mock-server/src/fixtures/accounts';
import * as api from './api';
import { canUse } from './config/controls';
import { alarmReceived } from './store';
import { selectCan, selectCanCommand } from './store/selectors';
import * as realtimeClient from './store/realtimeClient';
import { NOW, conveyorState, makeStore, renderWithStore, robotState, tankState } from './test/utils';
import { AlarmsPage } from './features/alarms';
import { CompressorPage } from './features/compressor';
import { ConveyorPage } from './features/conveyor';
import { HomePage } from './features/home';
import { RobotPage } from './features/robot';
import { SettingsPage } from './features/settings';
import { TankPage } from './features/tank';
import { AppShell } from './components/layout/AppShell';
import { DeviceControls } from './components/controls/DeviceControls';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getHistory: vi.fn(),
  getAlarms: vi.fn(),
  getRecords: vi.fn(),
  getRobotModel: vi.fn(),
  sendCommand: vi.fn(),
  logout: vi.fn(async () => undefined),
}));
vi.mock('./store/realtimeClient', () => ({
  startRealtime: vi.fn(),
  stopRealtime: vi.fn(),
  setAppVisible: vi.fn(),
  acquireJoints: vi.fn(() => () => undefined),
  getJointBuffer: vi.fn(() => null),
}));

const ROLES: readonly Role[] = ['admin', 'operator', 'viewer'];
/** 역할 이름으로 분기하는 코드의 모양: `role === ...`, `role !== ...`, `case 'admin':` */
const ROLE_BRANCH = /\brole\s*(===|!==|==|!=)|\.role\s*\?\s*[.[]?\s*(===|!==)|\?\.role\s*(===|!==)|case\s+'(admin|operator|viewer)'/;
const user = (role: Role): Me => ({ id: role, name: `${role}-user`, role, permissions: [...ROLE_PERMISSIONS[role]] });

/** 한 장짜리 기준표: 역할별로 화면에서 할 수 있는 것 */
const MATRIX: Record<Role, { quick: boolean; ack: boolean; danger: boolean; settings: boolean; batch: boolean }> = {
  //            시작·일시정지·재개·정지   알람 확인   모드 전환·수동 집기   설정값 변경
  admin: { quick: true, ack: true, danger: true, settings: true, batch: true },
  operator: { quick: true, ack: true, danger: false, settings: false, batch: false },
  viewer: { quick: false, ack: false, danger: false, settings: false, batch: false },
};

const openAlarm: Alarm = { id: 'al-1', level: 'caution', deviceId: 'tank-a1', message: '적재율 80% 초과', state: 'active', ts: NOW };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAlarms).mockResolvedValue([]);
  vi.mocked(api.getRecords).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  vi.mocked(api.getRobotModel).mockRejectedValue(new api.ApiError(503, 'X', ''));
  vi.mocked(api.getHistory).mockImplementation(async (q) => ({
    deviceId: q.deviceId,
    metric: q.metric,
    interval: q.interval,
    from: q.from,
    to: q.to,
    points: [{ ts: q.from, value: 1 }],
  }));
  vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(null);
});

describe('권한 기준표', () => {
  it('명령별 필요 권한(shared)과 역할별 권한(모의 서버)이 기준표와 일치한다', () => {
    const types = Object.keys(COMMAND_RULES) as CommandType[];
    const allowed = (role: Role) => types.filter((t) => canUse(ROLE_PERMISSIONS[role], t)).sort();
    expect(allowed('admin')).toEqual([...types].sort());
    expect(allowed('operator')).toEqual(['ack_alarm', 'pause', 'resume', 'start', 'stop']);
    expect(allowed('viewer')).toEqual([]);

    for (const role of ROLES) {
      const p = ROLE_PERMISSIONS[role];
      expect(canUse(p, 'start')).toBe(MATRIX[role].quick);
      expect(canUse(p, 'ack_alarm')).toBe(MATRIX[role].ack);
      expect(canUse(p, 'set_mode') && canUse(p, 'pick_from')).toBe(MATRIX[role].danger);
      expect(canUse(p, 'update_setting')).toBe(MATRIX[role].settings);
      expect(canUse(p, 'set_batch_mix') && canUse(p, 'skip_batch')).toBe(MATRIX[role].batch);
    }
  });

  it('위험도 높은 명령은 위험도 낮은 명령과 다른 권한을 요구한다 (작업자는 위험 조작을 못 한다)', () => {
    expect(COMMAND_RULES.set_mode.permission).not.toBe(COMMAND_RULES.start.permission);
    expect(COMMAND_RULES.pick_from.permission).not.toBe(COMMAND_RULES.start.permission);
    expect(COMMAND_RULES.update_setting.permission).not.toBe(COMMAND_RULES.start.permission);
  });

  it('권한 선택자(selectCan, selectCanCommand)는 permissions 목록만 본다', () => {
    for (const role of ROLES) {
      const state = makeStore({ me: user(role) }).getState();
      for (const type of Object.keys(COMMAND_RULES) as CommandType[]) {
        expect(selectCanCommand(type)(state)).toBe(ROLE_PERMISSIONS[role].includes(COMMAND_RULES[type].permission));
      }
      expect(selectCan('settings.write')(state)).toBe(MATRIX[role].settings);
    }
    expect(selectCan('robot.control')(makeStore({ me: null }).getState())).toBe(false); // 로그인 전
  });

  it('역할 분기 검사 자체가 위반을 잡아낸다 (통과만 하는 검사가 아니다)', () => {
    expect(ROLE_BRANCH.test("if (me.role === 'admin') show()")).toBe(true);
    expect(ROLE_BRANCH.test("const ok = state.auth.me?.role !== 'viewer'")).toBe(true);
    expect(ROLE_BRANCH.test("switch (r) { case 'operator': break }")).toBe(true);
    expect(ROLE_BRANCH.test("const ok = state.auth.me?.permissions.includes('robot.control')")).toBe(false);
    expect(ROLE_BRANCH.test('<span>{ROLE_TEXT[me.role]}</span>')).toBe(false); // 표시용 이름은 허용
  });

  it('화면 코드에서 역할 이름(role === ...)으로 분기하지 않는다 (권한 종류가 바뀌어도 permissions만 따른다)', () => {
    const root = path.resolve(__dirname);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(root);
    // 주석은 제외하고 코드만 본다
    const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const offenders = files.filter((f) => ROLE_BRANCH.test(code(f)));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});

describe.each(ROLES)('역할 %s', (role) => {
  const me = user(role);
  const m = MATRIX[role];

  it('홈: 3D 홈 상세 패널의 낮은 위험 조작 (3D 홈이 끼우는 조작 컴포넌트와 같다)', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { me, devices: [robotState(), tankState()] });
    for (const name of ['시작', '일시정지', '재개', '정지']) {
      const button = screen.queryByRole('button', { name });
      if (m.quick) expect(button).toBeEnabled();
      else expect(button).not.toBeInTheDocument(); // 보낼 수 있는 조작이 하나도 없으면 아예 보이지 않는다
    }
    // 위험 조작은 홈에 없다 (어떤 역할이든)
    expect(screen.queryByRole('button', { name: /적용|집기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '집기' })).not.toBeInTheDocument();
  });

  it('홈: 알람 확인 버튼', () => {
    const { store } = renderWithStore(<HomePage />, { me, devices: [tankState()] });
    act(() => {
      store.dispatch(alarmReceived(openAlarm));
    });
    const button = screen.queryByRole('button', { name: '알람 확인' });
    if (m.ack) expect(button).toBeEnabled();
    else expect(button).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /섹터 A1 · 적재율 80% 초과/ })).toBeInTheDocument(); // 알람 조회는 모두 가능
  });

  it('알람 화면: 알람 확인 버튼', () => {
    const { store } = renderWithStore(<AlarmsPage />, { me });
    act(() => {
      store.dispatch(alarmReceived(openAlarm));
    });
    const button = screen.queryByRole('button', { name: '알람 확인' });
    if (m.ack) expect(button).toBeEnabled();
    else expect(button).not.toBeInTheDocument();
    expect(screen.getByLabelText('열린 알람')).toHaveTextContent('섹터 A1');
  });

  it('로봇팔 페이지: 조작 줄(낮은 위험), 운전 모드(위험 조작), 진단, 설정', async () => {
    renderWithStore(<RobotPage />, { me, devices: [robotState({ mode: 'manual' })] });
    const bar = screen.queryByRole('region', { name: '조작' });
    const modeCard = screen.queryByRole('region', { name: '운전 모드' });

    if (!m.quick) {
      // 열람자: 조작 줄도 운전 모드도 없다 (모드는 주요 수치에서 본다)
      expect(bar).not.toBeInTheDocument();
      expect(modeCard).not.toBeInTheDocument();
    } else {
      expect(within(bar!).getByRole('button', { name: '일시정지' })).toBeEnabled();
      // 위험 조작은 조작 줄에 두지 않는다
      expect(within(bar!).queryByRole('button', { name: '집기' })).not.toBeInTheDocument();
      // 지금 모드(수동) 칸: 집을 섹터 + 집기
      const pick = within(modeCard!).getByRole('button', { name: '집기' });
      if (m.danger) expect(pick).toBeEnabled();
      else {
        expect(pick).toBeDisabled();
        expect(within(modeCard!).getByText(/집기·놓기: 권한이 없습니다/)).toBeInTheDocument();
      }
      // 놓기도 같은 권한(robot.manual). 들고 있지 않아 관리자에게도 비활성이고, 작업자에게는 권한이 이유다
      const place = within(modeCard!).getByRole('button', { name: '컨베이어에 놓기' });
      expect(place).toBeDisabled();

      // 자동 칸을 고르면 "적용"
      act(() => within(modeCard!).getByRole('radio', { name: '자동' }).click());
      const apply = within(modeCard!).getByRole('button', { name: '적용' });
      if (m.danger) expect(apply).toBeEnabled();
      else {
        // 작업자: 보이지만 비활성이고 이유가 있다
        expect(apply).toBeDisabled();
        expect(within(modeCard!).getByText(/적용: 권한이 없습니다/)).toBeInTheDocument();
      }
    }
    // 진단(관절 각도 표)과 설정은 "자세히" 안. 진단은 관리자에게만 보인다
    act(() => screen.getByRole('button', { name: '자세히' }).click());
    expect(!!screen.queryByLabelText('관절 값')).toBe(m.danger);
    const speed = screen.getByLabelText('동작 속도');
    if (m.settings) expect(speed).toBeEnabled();
    else {
      expect(speed).toBeDisabled();
      expect(screen.getByText('설정을 바꿀 권한이 없습니다.')).toBeInTheDocument();
    }
    await screen.findByLabelText('오류 로그 (최근 7일)');
  });

  it.each([
    ['탱크', '주의 기준 적재율', false],
    ['컨베이어', '이송 속도', true],
    ['압축기', '압력 상한', true],
  ] as const)('%s 페이지: 설정 변경%s', async (kind, label, hasControls) => {
    const element =
      kind === '탱크' ? (
        <Routes>
          <Route path="/tanks/:id" element={<TankPage />} />
        </Routes>
      ) : kind === '컨베이어' ? (
        <ConveyorPage />
      ) : (
        <CompressorPage />
      );
    renderWithStore(element, {
      me,
      route: kind === '탱크' ? '/tanks/tank-a1' : '/',
      devices: [tankState(), conveyorState(), { id: 'compressor-1', type: 'compressor', status: 'normal', running: true, pressureMpa: 28, temperatureC: 40, cycleStage: 'pressing', updatedAt: NOW }],
    });
    // 설정은 "자세히" 안에 있다 (기기 페이지 틀)
    act(() => screen.getByRole('button', { name: '자세히' }).click());
    const input = screen.getByLabelText(label);
    if (m.settings) expect(input).toBeEnabled();
    else expect(input).toBeDisabled();

    if (hasControls) {
      const bar = screen.queryByRole('region', { name: '조작' });
      if (m.quick) expect(within(bar!).getByRole('button', { name: '정지' })).toBeEnabled();
      else expect(bar).not.toBeInTheDocument();
    }
    await screen.findByLabelText(/알람 이력/);
  });

  it('설정 화면: 자기 권한을 있는 그대로 보여 준다', () => {
    renderWithStore(<SettingsPage />, { me });
    const card = screen.getByLabelText('계정');
    expect(within(card).getByText(`${role}-user`)).toBeInTheDocument();
    const items = within(card).queryAllByRole('listitem');
    expect(items).toHaveLength(ROLE_PERMISSIONS[role].length);
    if (role === 'viewer') expect(within(card).getByText('조회만 할 수 있습니다.')).toBeInTheDocument();
  });

  it('사이드바: 모든 메뉴가 보인다 (가정 단계에서는 화면 접근을 권한으로 가르지 않는다)', () => {
    renderWithStore(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div />} />
        </Route>
      </Routes>,
      { me },
    );
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, ''))).toEqual(['홈', '섹터', '로봇팔', '컨베이어', '압축기', '알람', '공정 기록', '설정']);
  });

  it('조작 가능 여부는 어느 역할이든 연결이 끊기면 모두 막힌다', async () => {
    renderWithStore(<RobotPage />, { me, connection: 'offline', devices: [robotState({ mode: 'manual' })] });
    // 명령을 보내는 버튼은 모두 막힌다 (모드 칸 고르기는 초안이라 명령이 아니다: role="radio")
    for (const name of ['조작', '운전 모드']) {
      const region = screen.queryByRole('region', { name });
      for (const button of region ? within(region).queryAllByRole('button') : []) expect(button).toBeDisabled();
    }
    act(() => screen.getByRole('button', { name: '자세히' }).click());
    expect(screen.getByLabelText('동작 속도')).toBeDisabled();
    await screen.findByLabelText('오류 로그 (최근 7일)');
  });
});
