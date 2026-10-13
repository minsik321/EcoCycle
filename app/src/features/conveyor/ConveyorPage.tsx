import type { ConveyorState } from '@ecocycle/shared';
import { formatLoadPercent } from '../../config/display';
import { MachinePage } from '../devices/MachinePage';

/** 컨베이어(Section Z) 기기 페이지: 가동 상태, 적재 정도, 속도 설정, 이력 */
export function ConveyorPage() {
  return (
    <MachinePage<ConveyorState>
      deviceId="conveyor-z"
      stats={(c) => [
        ['가동 상태', c.running ? '가동' : '정지'],
        ['적재 정도', formatLoadPercent(c.loadPercent)],
      ]}
    />
  );
}
