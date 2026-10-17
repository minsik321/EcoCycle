// 권한 매트릭스 점검 (표 하나: src/test/permissionMatrix.ts).
// 줄(동작) × 역할(admin·operator·viewer)마다 세 층을 본다.
//   1. 화면: 허용이면 보이고 누를 수 있다. 아니면 숨기거나(hidden), 비활성 + 이유(disabled). 3D 홈 패널·팝업도 포함
//   2. api 클라이언트: 권한이 없으면 명령 요청을 보내지 않는다(fetch 0번)
//   3. 명세: docs/dashboard-spec.md 6절 "권한 표"의 줄·✓✗가 이 표와 같다
// 서버(실제 HTTP 403)는 integration/permissions.integration.test.ts가 같은 표로 본다.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_RULES } from '@ecocycle/shared';
import type { Alarm, Command, CommandType, ControlledBatch, DeviceId, DeviceState, Me, Permission, Role } from '@ecocycle/shared';
import { ROLE_PERMISSIONS } from '../../mock-server/src/fixtures/accounts';
import * as api from './api';
import * as batchesApi from './api/batches';
import { clearTokens, createMemoryTokenStore, setRefreshTokenStore, setTokens } from './api/tokens';
import { CONTROL_TEXT } from './config/controls';
import { alarmReceived, devicesReceived } from './store';
import { NOW, conveyorState, renderWithStore, robotState, tankState } from './test/utils';
import { PERMISSION_MATRIX, ROLES, allowedFor, commandPermission } from './test/permissionMatrix';
import type { MatrixRow, MatrixRowId } from './test/permissionMatrix';
import type { StageProps } from './studio/Stage';
import { LiveStudio } from './studio/LiveStudio';
import { SCENE_START, StudioView } from './studio/StudioView';
import { fixedSource } from './studio/robot/jointSource';
import { EMPTY_DATA } from './studio/types';
import { AlarmsPage } from './features/alarms';
import { CctvButton } from './features/cctv';
import { CompressorPage } from './features/compressor';
import { ConveyorPage } from './features/conveyor';
import { HomePage } from './features/home';
import { BatchBalePage, RecordPopupLayer, RecordsPage } from './features/records';
import { RobotPage } from './features/robot';
import { SettingsPage } from './features/settings';
import { TankPage } from './features/tank';

vi.mock('./studio/Stage', () => ({
  Stage: (props: StageProps) => {
    const { onReady } = props;
    useEffect(() => onReady?.(), [onReady]);
    return <div data-testid="stage" />;
  },
}));
vi.mock('./api/batches', () => ({ getBatchControl: vi.fn(), getBaleDetail: vi.fn() }));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getHistory: vi.fn(),
  getAlarms: vi.fn(),
  getRecords: vi.fn(),
  getRobotModel: vi.fn(),
  getPlantHistory: vi.fn(() => new Promise(() => {})),
  getBatchRecord: vi.fn(),
}));
vi.mock('./store/realtimeClient', () => ({
  startRealtime: vi.fn(),
  stopRealtime: vi.fn(),
  setAppVisible: vi.fn(),
  acquireJoints: vi.fn(() => () => undefined),
  getJointBuffer: vi.fn(() => null),
}));

const user = (role: Role): Me => ({ id: role, name: `${role}-user`, role, permissions: [...ROLE_PERMISSIONS[role]] });

const compressor: DeviceState = { id: 'compressor-1', type: 'compressor', status: 'normal', running: true, pressureMpa: 28, temperatureC: 40, cycleStage: 'pressing', updatedAt: NOW };
const openAlarm: Alarm = { id: 'al-1', level: 'caution', deviceId: 'tank-a1', message: '적재율 80% 초과', state: 'active', ts: NOW };
const controlled: ControlledBatch = {
  batch: { id: 'batch-test', stage: 'planned', mix: [{ sectorId: 'tank-a1', percent: 100 }], actualMix: null, pinning: null, pinChanges: [], avgMoisturePercent: 12, targetPressureMpa: 28, stageTimes: { planned: NOW }, updatedAt: NOW },
  paused: false,
  skipped: false,
  progressPercent: 0,
  currentPressureMpa: 0,
  baleIds: [],
};

type Ui = ReturnType<typeof userEvent.setup>;

/**
 * 화면 한 곳의 점검. find가 돌려준 요소로 판정한다:
 *   허용 → 있고(조회 줄) 누를 수 있다(조작 줄)
 *   불허 → denied가 hidden이면 없고, disabled면 비활성 + reason 글. hiddenWithout 권한도 없으면 숨김(예: 열람자에게는 운전 모드 카드가 없다)
 */
interface Spot {
  row: MatrixRowId;
  place: string;
  render: (me: Me) => void;
  /** 점검 전에 할 일(칸 고르기 등). 요소가 없으면(숨김) 건너뛴다 */
  prepare?: (ui: Ui) => Promise<void>;
  find: () => Promise<HTMLElement | null> | HTMLElement | null;
  denied: 'hidden' | 'disabled';
  hiddenWithout?: Permission;
  reason?: RegExp;
}

const tankRoute = (el: ReactElement) => (
  <Routes>
    <Route path="/tanks/:id" element={el} />
  </Routes>
);
const devices = (over: DeviceState[] = []) => [tankState(), conveyorState(), compressor, ...over];
const openDetails = async (ui: Ui) => ui.click(screen.getByRole('button', { name: '자세히' }));
const region = (name: string) => screen.queryByRole('region', { name });
const inRegion = (name: string, role: 'button' | 'radio', label: string | RegExp) => {
  const r = region(name);
  return r ? within(r).queryByRole(role, { name: label }) : null;
};
/** 3D 홈에서 로봇을 골라 상세 패널을 연다 */
const openRobotPanel = async (ui: Ui) => ui.click(await screen.findByLabelText(/^로봇팔 .*작동 중/));
const robotPanel = () => screen.getByRole('complementary', { name: '로봇팔 상세' });
const inPanel = (label: string | RegExp) => within(robotPanel()).queryByRole('button', { name: label });

const renderStudio = (me: Me, robot: DeviceState) => {
  const list = devices([robot]);
  const { store } = renderWithStore(<LiveStudio onFailed={() => {}} />, { me, devices: list });
  act(() => void store.dispatch(devicesReceived(list)));
};
const renderRobotPage = (me: Me, robot: DeviceState) => renderWithStore(<RobotPage />, { me, devices: devices([robot]) });
const renderBatchPage = (me: Me) =>
  renderWithStore(
    <Routes>
      <Route path="/records/batches" element={<BatchBalePage />} />
    </Routes>,
    { me, route: '/records/batches' },
  );
const typeSkipReason = async (ui: Ui) => {
  const input = screen.queryByLabelText('건너뛰기 사유');
  if (input && !(input as HTMLInputElement).disabled) await ui.type(input, '품질 재점검');
};
const manual = robotState({ mode: 'manual' });
const holding = robotState({ mode: 'manual', heldSectorId: 'tank-a1', gripper: { closed: true, holding: true } });

const SPOTS: Spot[] = [
  // --- 조회: 모든 역할 ---
  { row: 'view.home3d', place: '3D 홈', render: (me) => renderStudio(me, robotState()), find: () => region('공정 기록'), denied: 'hidden' },
  { row: 'view.dashboard', place: '대시보드 홈', render: (me) => renderWithStore(<HomePage />, { me, devices: devices() }), find: () => region('상태 요약'), denied: 'hidden' },
  { row: 'view.devices', place: '섹터 페이지', render: (me) => renderWithStore(tankRoute(<TankPage />), { me, route: '/tanks/tank-a1', devices: devices() }), find: () => screen.queryByRole('heading', { name: '섹터 A1' }), denied: 'hidden' },
  { row: 'view.devices', place: '로봇팔 페이지', render: (me) => renderRobotPage(me, robotState()), find: () => screen.queryByRole('heading', { name: '로봇팔' }), denied: 'hidden' },
  { row: 'view.devices', place: '컨베이어 페이지', render: (me) => renderWithStore(<ConveyorPage />, { me, devices: devices() }), find: () => screen.queryByRole('heading', { name: /컨베이어/ }), denied: 'hidden' },
  { row: 'view.devices', place: '압축기 페이지', render: (me) => renderWithStore(<CompressorPage />, { me, devices: devices() }), find: () => screen.queryByRole('heading', { name: '압축기' }), denied: 'hidden' },
  { row: 'view.records', place: '공정 기록', render: (me) => renderWithStore(<RecordsPage />, { me, route: '/records' }), find: () => screen.queryByRole('heading', { name: '공정 기록' }), denied: 'hidden' },
  {
    row: 'view.records',
    place: '배치 상세 팝업 (조작 없음)',
    render: (me) =>
      renderWithStore(<RecordPopupLayer>{(location) => <Routes location={location}><Route path="*" element={<div />} /></Routes>}</RecordPopupLayer>, { me, route: '/records/batches/batch-0407' }),
    find: async () => {
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText(/batch-0407/);
      // 팝업에는 명령을 보내는 버튼이 없다 (어느 역할이든)
      const labels = Object.values(CONTROL_TEXT).map((t) => t.label);
      expect(within(dialog).queryAllByRole('button').filter((b) => labels.includes(b.textContent ?? ''))).toEqual([]);
      return dialog;
    },
    denied: 'hidden',
  },
  { row: 'view.batchBale', place: '배치·베일 화면', render: renderBatchPage, find: () => screen.findByRole('region', { name: '수동 제어' }), denied: 'hidden' },
  { row: 'view.alarms', place: '알람 화면', render: (me) => renderWithStore(<AlarmsPage />, { me }), find: () => screen.queryByRole('heading', { name: '알람' }), denied: 'hidden' },
  { row: 'view.cctv', place: '상단 바 CCTV 버튼', render: (me) => renderWithStore(<CctvButton />, { me }), find: () => screen.queryByRole('button', { name: 'CCTV' }), denied: 'hidden' },
  { row: 'view.settings', place: '설정 화면', render: (me) => renderWithStore(<SettingsPage />, { me }), find: () => screen.queryByRole('radiogroup', { name: '화질 모드' }), denied: 'hidden' },
  { row: 'view.robotDiagnostics', place: '로봇팔 페이지 자세히', render: (me) => renderRobotPage(me, robotState()), prepare: openDetails, find: () => screen.queryByLabelText('관절 값'), denied: 'hidden' },

  // --- 시작·일시정지·재개·정지 (robot.control): 3D 홈 패널, 기기 페이지 조작 줄 ---
  { row: 'cmd.run', place: '3D 홈 로봇 패널', render: (me) => renderStudio(me, robotState()), prepare: openRobotPanel, find: () => inPanel('일시정지'), denied: 'hidden' },
  { row: 'cmd.run', place: '로봇팔 페이지 조작 줄', render: (me) => renderRobotPage(me, robotState()), find: () => inRegion('조작', 'button', '일시정지'), denied: 'hidden' },
  { row: 'cmd.run', place: '컨베이어 페이지 조작 줄', render: (me) => renderWithStore(<ConveyorPage />, { me, devices: devices() }), find: () => inRegion('조작', 'button', '정지'), denied: 'hidden' },
  { row: 'cmd.run', place: '압축기 페이지 조작 줄', render: (me) => renderWithStore(<CompressorPage />, { me, devices: devices() }), find: () => inRegion('조작', 'button', '정지'), denied: 'hidden' },

  // --- 알람 확인 (alarm.ack): 대시보드 홈, 알람 화면, 섹터 페이지 조작 줄 ---
  ...(['대시보드 홈', '알람 화면', '섹터 페이지 조작 줄'] as const).map(
    (place): Spot => ({
      row: 'cmd.ack',
      place,
      render: (me) => {
        const el = place === '대시보드 홈' ? <HomePage /> : place === '알람 화면' ? <AlarmsPage /> : tankRoute(<TankPage />);
        const { store } = renderWithStore(el, { me, devices: devices(), route: place === '섹터 페이지 조작 줄' ? '/tanks/tank-a1' : '/' });
        act(() => void store.dispatch(alarmReceived(openAlarm)));
      },
      find: () => screen.queryByRole('button', { name: '알람 확인' }),
      denied: 'hidden',
    }),
  ),

  // --- 설정값 변경 (settings.write): 네 기기 페이지의 자세히 ---
  ...(
    [
      ['섹터 페이지 자세히', '주의 기준 적재율'],
      ['로봇팔 페이지 자세히', '동작 속도'],
      ['컨베이어 페이지 자세히', '이송 속도'],
      ['압축기 페이지 자세히', '압력 상한'],
    ] as const
  ).map(
    ([place, label]): Spot => ({
      row: 'cmd.setting',
      place,
      render: (me) => {
        const el = place.startsWith('섹터') ? tankRoute(<TankPage />) : place.startsWith('로봇') ? <RobotPage /> : place.startsWith('컨베이어') ? <ConveyorPage /> : <CompressorPage />;
        renderWithStore(el, { me, devices: devices([robotState()]), route: place.startsWith('섹터') ? '/tanks/tank-a1' : '/' });
      },
      prepare: openDetails,
      find: () => screen.queryByLabelText(label),
      denied: 'disabled',
      reason: /설정을 바꿀 권한이 없습니다/,
    }),
  ),

  // --- 로봇 운전 모드 (robot.manual): 로봇팔 페이지(작업자는 비활성 + 이유, 열람자는 카드 없음), 3D 홈 로봇 패널(없음) ---
  {
    row: 'cmd.mode',
    place: '로봇팔 페이지 운전 모드',
    render: (me) => renderRobotPage(me, manual),
    prepare: async (ui) => {
      const auto = inRegion('운전 모드', 'radio', '자동');
      if (auto) await ui.click(auto);
    },
    find: () => inRegion('운전 모드', 'button', '적용'),
    denied: 'disabled',
    hiddenWithout: 'robot.control',
    reason: /적용: 권한이 없습니다/,
  },
  {
    row: 'cmd.mode',
    place: '3D 홈 로봇 패널',
    render: (me) => renderStudio(me, manual),
    prepare: async (ui) => {
      await openRobotPanel(ui);
      const auto = within(robotPanel()).queryByRole('radio', { name: '자동' });
      if (auto) await ui.click(auto);
    },
    find: () => inPanel('적용'),
    denied: 'hidden',
  },
  {
    row: 'cmd.pin',
    place: '로봇팔 페이지 운전 모드',
    render: (me) => renderRobotPage(me, robotState()),
    prepare: async (ui) => {
      const pinned = inRegion('운전 모드', 'radio', '자동 · 섹터 지정');
      if (!pinned) return;
      await ui.click(pinned);
      const chip = inRegion('운전 모드', 'button', '섹터 A1');
      if (chip && !(chip as HTMLButtonElement).disabled) await ui.click(chip);
    },
    find: () => inRegion('운전 모드', 'button', '적용'),
    denied: 'disabled',
    hiddenWithout: 'robot.control',
    reason: /적용: 권한이 없습니다/,
  },
  {
    row: 'cmd.pin',
    place: '3D 홈 로봇 패널',
    render: (me) => renderStudio(me, robotState()),
    prepare: async (ui) => {
      await openRobotPanel(ui);
      const pinned = within(robotPanel()).queryByRole('radio', { name: '자동 · 섹터 지정' });
      if (!pinned) return;
      await ui.click(pinned);
      await ui.click(within(robotPanel()).getByRole('button', { name: '섹터 A1' }));
    },
    find: () => inPanel('적용'),
    denied: 'hidden',
  },
  { row: 'cmd.pick', place: '로봇팔 페이지 운전 모드', render: (me) => renderRobotPage(me, manual), find: () => inRegion('운전 모드', 'button', '집기'), denied: 'disabled', hiddenWithout: 'robot.control', reason: /집기·놓기: 권한이 없습니다/ },
  { row: 'cmd.pick', place: '3D 홈 로봇 패널', render: (me) => renderStudio(me, manual), prepare: openRobotPanel, find: () => inPanel('집기'), denied: 'hidden' },
  { row: 'cmd.place', place: '로봇팔 페이지 운전 모드', render: (me) => renderRobotPage(me, holding), find: () => inRegion('운전 모드', 'button', '컨베이어에 놓기'), denied: 'disabled', hiddenWithout: 'robot.control', reason: /집기·놓기: 권한이 없습니다/ },
  { row: 'cmd.place', place: '3D 홈 로봇 패널', render: (me) => renderStudio(me, holding), prepare: openRobotPanel, find: () => inPanel('컨베이어에 놓기'), denied: 'hidden' },

  // --- 배치 수동 제어 (batch.control): 배치·베일 화면 (비활성 + 이유) ---
  ...(
    [
      ['cmd.batchMix', '배합 변경'],
      ['cmd.batchPressure', '압력 변경'],
      ['cmd.batchPause', '배치 일시정지'],
      ['cmd.batchSkip', '배치 건너뛰기'],
    ] as const
  ).map(
    ([row, label]): Spot => ({
      row,
      place: '배치·베일 화면 수동 제어',
      render: renderBatchPage,
      prepare: async (ui) => {
        await screen.findByRole('region', { name: '수동 제어' });
        if (row === 'cmd.batchSkip') await typeSkipReason(ui);
      },
      find: () => within(screen.getByRole('region', { name: '수동 제어' })).queryByRole('button', { name: label }),
      denied: 'disabled',
      reason: /배치 수동 제어 권한이 없습니다/,
    }),
  ),
];

/** api 클라이언트 점검에 보낼 명령 (줄마다, 값은 올바른 모양) */
const SAMPLES: Partial<Record<MatrixRowId, Array<{ device: DeviceId; command: Command }>>> = {
  'cmd.run': (['start', 'pause', 'resume', 'stop'] as const).map((type) => ({ device: 'conveyor-z', command: { type } })),
  'cmd.ack': [{ device: 'tank-a1', command: { type: 'ack_alarm', alarmId: 'al-1' } }],
  'cmd.setting': [{ device: 'tank-a1', command: { type: 'update_setting', key: 'cautionThresholdPercent', value: 80, confirm: true } }],
  'cmd.mode': [{ device: 'robot-1', command: { type: 'set_mode', mode: 'manual', confirm: true } }],
  'cmd.pin': [{ device: 'robot-1', command: { type: 'set_mode', mode: 'auto_pinned', pinnedSectors: ['tank-a1'], confirm: true } }],
  'cmd.pick': [{ device: 'robot-1', command: { type: 'pick_from', tankId: 'tank-a1', confirm: true } }],
  'cmd.place': [{ device: 'robot-1', command: { type: 'place_on_conveyor', confirm: true } }],
  'cmd.batchMix': [{ device: 'compressor-1', command: { type: 'set_batch_mix', batchId: 'b', mix: [{ sectorId: 'tank-a1', percent: 100 }], confirm: true } }],
  'cmd.batchPressure': [{ device: 'compressor-1', command: { type: 'set_batch_pressure', batchId: 'b', targetPressureMpa: 28, confirm: true } }],
  'cmd.batchPause': [
    { device: 'compressor-1', command: { type: 'pause_batch', batchId: 'b', confirm: true } },
    { device: 'compressor-1', command: { type: 'resume_batch', batchId: 'b', confirm: true } },
  ],
  'cmd.batchSkip': [{ device: 'compressor-1', command: { type: 'skip_batch', batchId: 'b', reason: '점검', confirm: true } }],
};

// 3D 홈의 3D 조각(StudioScene)은 lazy다. 한 번 받아 두면 핀이 바로 놓인다 (studio.test.tsx와 같은 방법)
beforeAll(async () => {
  SCENE_START.waitMs = 0;
  render(<StudioView data={EMPTY_DATA} jointSource={fixedSource()} tier="low" disconnected={false} lastReceivedAt={null} paused={false} onFailed={() => {}} />);
  await screen.findByTestId('stage');
  cleanup();
});

beforeEach(() => {
  vi.mocked(api.getAlarms).mockResolvedValue([]);
  vi.mocked(api.getRecords).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  vi.mocked(api.getRobotModel).mockRejectedValue(new api.ApiError(503, 'X', ''));
  vi.mocked(api.getHistory).mockImplementation(async (q) => ({ deviceId: q.deviceId, metric: q.metric, interval: q.interval, from: q.from, to: q.to, points: [{ ts: q.from, value: 1 }] }));
  vi.mocked(api.getBatchRecord).mockImplementation(async (id: string) => ({
    id,
    result: 'completed',
    startedAt: NOW,
    endedAt: NOW,
    mix: [{ sectorId: 'tank-a1', percent: 100 }],
    actualMix: null,
    pinChanges: [],
    avgMoisturePercent: 11.8,
    targetPressureMpa: 28.5,
    actualPressureMpa: 28.3,
    balesProduced: 0,
    baleIds: [],
  }));
  vi.mocked(batchesApi.getBatchControl).mockResolvedValue({ eventsRevision: 1, current: controlled, next: null, pressureRange: { min: 27, max: 30 } });
});

describe('권한 매트릭스: 표 자체', () => {
  it('모든 명령 종류가 어느 줄엔가 있고, 줄의 필요 권한이 COMMAND_RULES와 같다', () => {
    const covered = new Set(PERMISSION_MATRIX.flatMap((r) => r.commands));
    expect([...covered].sort()).toEqual((Object.keys(COMMAND_RULES) as CommandType[]).sort());
    for (const row of PERMISSION_MATRIX) for (const type of row.commands) expect(commandPermission(type), `${row.id} ${type}`).toBe(row.permission);
  });

  it('모든 줄에 화면 점검이 하나 이상 있고, 명령 줄에는 api 점검 명령이 그 줄의 명령을 모두 덮는다', () => {
    for (const row of PERMISSION_MATRIX) {
      expect(SPOTS.some((s) => s.row === row.id), row.id).toBe(true);
      if (row.commands.length > 0) expect([...new Set(SAMPLES[row.id]!.map((s) => s.command.type))].sort(), row.id).toEqual([...new Set(row.commands)].sort());
    }
  });

  it('명세 6절 "권한 표"가 이 표와 같다 (줄 이름·필요 권한·역할별 ✓✗)', () => {
    const spec = readFileSync(path.resolve(__dirname, '../../docs/dashboard-spec.md'), 'utf8').split('\n');
    const head = spec.findIndex((line) => line.startsWith('| 동작 | 필요 권한 |'));
    expect(head, '명세에 권한 표가 없다').toBeGreaterThan(-1);
    const rows: string[][] = [];
    for (let i = head + 2; i < spec.length && spec[i]!.startsWith('|'); i += 1) rows.push(spec[i]!.split('|').slice(1, -1).map((c) => c.trim()));
    expect(rows.map((r) => r[0])).toEqual(PERMISSION_MATRIX.map((r) => r.label));
    for (const [i, row] of PERMISSION_MATRIX.entries()) {
      const cells = rows[i]!;
      expect(cells[1], row.id).toContain(row.permission ? `\`${row.permission}\`` : '로그인');
      ROLES.forEach((role, j) => expect(cells[2 + j]!.startsWith(allowedFor(row, role) ? '✓' : '✗'), `${row.id} ${role}: "${cells[2 + j]}"`).toBe(true));
    }
  });
});

describe.each(ROLES)('역할 %s', (role) => {
  const me = user(role);

  describe('화면', () => {
    it.each(SPOTS.map((s) => [`${s.row} · ${s.place}`, s] as const))('%s', async (_name, spot) => {
      const row = PERMISSION_MATRIX.find((r) => r.id === spot.row)!;
      const allowed = allowedFor(row, role);
      const ui = userEvent.setup();
      spot.render(me);
      await spot.prepare?.(ui);
      const el = await spot.find();

      if (allowed) {
        expect(el, '허용인데 보이지 않는다').not.toBeNull();
        if (row.commands.length > 0) expect(el).toBeEnabled();
        return;
      }
      const hidden = spot.denied === 'hidden' || (spot.hiddenWithout !== undefined && !me.permissions.includes(spot.hiddenWithout));
      if (hidden) expect(el, '권한이 없는데 보인다').toBeNull();
      else {
        expect(el, '비활성으로 보여야 한다').not.toBeNull();
        expect(el).toBeDisabled();
        if (spot.reason) expect(screen.getAllByText(spot.reason).length).toBeGreaterThan(0);
      }
    });
  });

  describe('api 클라이언트: 권한이 없으면 요청을 보내지 않는다', () => {
    let calls: number;
    beforeEach(async () => {
      setRefreshTokenStore(createMemoryTokenStore());
      await clearTokens();
      await setTokens('at', 'rt');
      calls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          calls += 1;
          return new Response(JSON.stringify({ commandId: 'cmd-1', status: 'accepted' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
        }),
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it.each(PERMISSION_MATRIX.filter((r) => r.commands.length > 0).map((r) => [r.id, r] as const))('%s', async (_id, row: MatrixRow) => {
      const allowed = allowedFor(row, role);
      for (const { device, command } of SAMPLES[row.id]!) {
        const before = calls;
        const sent = api.sendCommand(device, command, { permissions: me.permissions });
        if (allowed) await expect(sent).resolves.toMatchObject({ accepted: { status: 'accepted' } });
        else await expect(sent).rejects.toMatchObject({ status: 403, code: api.PERMISSION_MISSING });
        expect(calls - before, command.type).toBe(allowed ? 1 : 0);
      }
    });
  });
});
