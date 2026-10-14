import type { DeviceState, DeviceStatus } from '@ecocycle/shared';
import { PHASE_STEPS, ROBOT_STATUS_TEXT, ROBOT_STATUS_TONE, STATUS_TEXT, formatPercent, formatPressureMpa } from '../../config/display';

// 스튜디오 패널의 문구. 공정 문구와 "공정 추적" 계산은 대시보드와 함께 쓰므로 config/processDisplay에 있다.
export { BALE_STAGE_TEXT, BATCH_STAGE_TEXT, VEHICLE_STAGE_TEXT, cycleSteps, mixText, shortId } from '../../config/processDisplay';
export type { CycleStep } from '../../config/processDisplay';

/** 핀에 적을 한 줄과 상태 */
export function deviceLine(device: DeviceState): { tone: DeviceStatus; value: string; statusText: string } {
  switch (device.type) {
    case 'tank':
      return { tone: device.status, value: formatPercent(device.fillPercent), statusText: STATUS_TEXT[device.status] };
    case 'robot':
      return {
        tone: ROBOT_STATUS_TONE[device.status],
        value: device.status === 'running' ? (PHASE_STEPS.find((s) => s.phase === device.phase)?.label ?? '대기') : ROBOT_STATUS_TEXT[device.status],
        statusText: ROBOT_STATUS_TEXT[device.status],
      };
    case 'conveyor':
      return { tone: device.status, value: device.running ? '가동' : '정지', statusText: STATUS_TEXT[device.status] };
    case 'compressor':
      return { tone: device.status, value: formatPressureMpa(device.pressureMpa), statusText: STATUS_TEXT[device.status] };
  }
}
