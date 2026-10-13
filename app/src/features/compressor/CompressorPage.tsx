import type { CompressorState } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { formatPressureMpa, formatTemperatureC } from '../../config/display';
import { MachinePage } from '../devices/MachinePage';

/** 압축기 기기 페이지: 압력·온도 그래프, 설정, 점검 이력 */
export function CompressorPage() {
  return (
    <MachinePage<CompressorState>
      deviceId="compressor-1"
      stats={(c) => [
        ['가동 상태', c.running ? '가동' : '정지'],
        ['압력', formatPressureMpa(c.pressureMpa)],
        ['온도', formatTemperatureC(c.temperatureC)],
      ]}
      extra={
        <Card title="점검 이력" aria-label="점검 이력">
          <p className="text-slate-600">
            점검 기록은 서버가 값을 제공해야 표시할 수 있습니다. 현재 API 명세에는 이 값이 없어 서버 담당과 확인 중입니다.
          </p>
        </Card>
      }
    />
  );
}
