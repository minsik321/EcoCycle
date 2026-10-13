import type { DeviceId } from '@ecocycle/shared';
import { useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { DeviceCard, PendingCard } from './DeviceCards';
import { DeviceDetailPanel } from './DeviceDetailPanel';
import { HomeAlarms } from './HomeAlarms';
import { PhaseBar } from './PhaseBar';
import { SummaryCards } from './SummaryCards';

function Slot({ id }: { id: DeviceId }) {
  const device = useAppSelector(selectDevice(id));
  return device ? <DeviceCard device={device} /> : <PendingCard id={id} />;
}

/**
 * 홈 = "지금 정상인가". 한눈에 볼 요약, 알람, 기기별 핵심 값, 작업 단계를 보여 준다.
 * 1단계의 2D 버전이다. 3D 장면은 2단계에서 기기 카드 자리에 얹고, 같은 정보를 오버레이로 쓴다.
 */
export function HomePage() {
  const selectedId = useAppSelector((state) => state.ui.selectedDeviceId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">홈</h1>
      <SummaryCards />
      <HomeAlarms />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section aria-label="기기 상태" className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <Slot id="tank-a1" />
          <Slot id="tank-a2" />
          <Slot id="tank-b1" />
          <Slot id="tank-b2" />
          <Slot id="robot-1" />
          <Slot id="conveyor-z" />
          <Slot id="compressor-1" />
        </section>
        {selectedId && (
          <div className="lg:w-96 lg:shrink-0">
            <DeviceDetailPanel id={selectedId} />
          </div>
        )}
      </div>
      <PhaseBar />
    </div>
  );
}
