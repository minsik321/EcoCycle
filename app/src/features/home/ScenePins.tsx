import type { MutableRefObject } from 'react';
import type { DeviceId, DeviceState, DeviceStatus } from '@ecocycle/shared';
import { TONE_CLASS } from '../../components/status/tone';
import { DEVICE_NAMES, PHASE_STEPS, ROBOT_STATUS_TEXT, ROBOT_STATUS_TONE, STATUS_SYMBOL, STATUS_TEXT, formatPercent } from '../../config/display';
import { DEVICE_ORDER } from '../../config/sceneLayout';
import type { PinElements } from '../../scene/pins/PinProjector';

/** 핀 하나에 보일 한 줄(홈에서는 기기당 숫자 한두 개만)과 상태 */
function describe(device: DeviceState): { tone: DeviceStatus; text: string; statusText: string } {
  switch (device.type) {
    case 'tank':
      return { tone: device.status, text: formatPercent(device.fillPercent), statusText: STATUS_TEXT[device.status] };
    case 'robot':
      return {
        tone: ROBOT_STATUS_TONE[device.status],
        text: device.status === 'running' ? (PHASE_STEPS.find((s) => s.phase === device.phase)?.label ?? '대기') : ROBOT_STATUS_TEXT[device.status],
        statusText: ROBOT_STATUS_TEXT[device.status],
      };
    case 'conveyor':
      return { tone: device.status, text: device.running ? '가동' : '정지', statusText: STATUS_TEXT[device.status] };
    case 'compressor':
      return { tone: device.status, text: device.running ? '가동' : '정지', statusText: STATUS_TEXT[device.status] };
  }
}

// 핀은 좁게: 탱크는 구역 이름만 쓴다 (전체 이름은 aria-label에 있다)
const SHORT_NAME: Partial<Record<DeviceId, string>> = {
  'tank-a1': 'A1',
  'tank-a2': 'A2',
  'tank-b1': 'B1',
  'tank-b2': 'B2',
  'conveyor-z': '컨베이어',
};

export interface ScenePinsProps {
  pins: MutableRefObject<PinElements>;
  devices: Partial<Record<DeviceId, DeviceState>>;
  selectedId: DeviceId | null;
  /** 연결이 끊겼다: 모든 핀을 "연결 끊김"으로 바꾸고 마지막 값을 보여 주지 않는다 */
  disconnected: boolean;
  onSelect: (id: DeviceId | null) => void;
}

/**
 * 3D 장면 위에 올리는 HTML 핀. 장면 안에는 글자를 두지 않고 수치·라벨은 여기서 그린다.
 * 위치는 장면(PinProjector)이 매 프레임 써 넣고, 누르면 그 기기가 선택되어 카메라가 이동하고 상세 카드가 열린다.
 * 상태는 색 + 기호 + 글자로 함께 보여 준다.
 */
export function ScenePins({ pins, devices, selectedId, disconnected, onSelect }: ScenePinsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {DEVICE_ORDER.map((id: DeviceId) => {
        const device = devices[id];
        const info = device ? describe(device) : null;
        const tone: DeviceStatus = disconnected || !info ? 'offline' : info.tone;
        const selected = selectedId === id;
        const spoken = !info ? '불러오는 중' : disconnected ? STATUS_TEXT.offline : `${info.text}, ${info.statusText}`;
        return (
          <button
            key={id}
            type="button"
            ref={(element) => {
              pins.current[id] = element;
            }}
            aria-pressed={selected}
            aria-label={`${DEVICE_NAMES[id]} ${spoken}`}
            onClick={() => onSelect(selected ? null : id)}
            // 위치가 계산되기 전에는 보이지 않게 둔다 (PinProjector가 visible로 바꾼다)
            style={{ visibility: 'hidden' }}
            className="pointer-events-auto absolute left-0 top-0 flex min-h-12 min-w-12 flex-col items-center justify-end pb-1 will-change-transform"
          >
            <span
              className={`flex items-center gap-1 whitespace-nowrap rounded-full border-2 px-2.5 py-1 text-xs font-semibold shadow-sm ${TONE_CLASS[tone]} ${
                selected ? 'ring-2 ring-slate-800' : ''
              }`}
            >
              <span aria-hidden="true">{STATUS_SYMBOL[tone]}</span>
              <span>{SHORT_NAME[id] ?? DEVICE_NAMES[id]}</span>
              {info && <span className="font-bold">{disconnected ? '–' : info.text}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
