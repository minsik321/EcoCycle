import { Link, useParams } from 'react-router-dom';
import { TANK_IDS } from '@ecocycle/shared';
import type { RobotState, TankId } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { SettingForm } from '../../components/controls/SettingForm';
import { DeviceActionBar } from '../../components/device/ActionBar';
import { DetailsSection } from '../../components/device/DetailsSection';
import { DeviceHero } from '../../components/device/DeviceHero';
import { DevicePage } from '../../components/device/DevicePage';
import { KeyTiles } from '../../components/device/KeyTile';
import { useDeviceLive } from '../../components/device/live';
import { NowNext } from '../../components/device/NowNext';
import { DEVICE_NAMES, HISTORY_METRICS } from '../../config/display';
import { DEVICE_SETTINGS } from '../../config/settings';
import { useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { DeviceAlarmHistory } from '../history/DeviceAlarmHistory';
import { HistoryPanel } from '../history/HistoryPanel';
import { SectorBin } from './SectorBin';
import { binLabel, sectorActivity } from './sectorText';
import { SectorUnloads } from './SectorUnloads';

const isTankId = (value: string | undefined): value is TankId => !!value && (TANK_IDS as readonly string[]).includes(value);

const oneDecimal = (n: number) => n.toFixed(1);

/**
 * 섹터 기기 페이지 = "왜 그런가, 설정은, 이력은": 칸 그림과 주요 수치, 지금/다음, 자세히(이력 그래프·기준값 설정·알람 이력), 맨 아래 하역 기록.
 * 설정 변경은 위험도가 높아 이 페이지의 "자세히" 안에서만, 확인 단계를 거쳐 보낸다.
 */
export function TankPage() {
  const { id } = useParams();
  if (!isTankId(id)) {
    return (
      <div>
        <h1 className="text-xl font-bold">섹터를 찾을 수 없습니다</h1>
        <Link to="/tanks" className="mt-3 inline-flex min-h-12 items-center underline">
          섹터 목록으로
        </Link>
      </div>
    );
  }
  // 다른 섹터로 옮기면 기록 목록·자세히를 처음 상태로
  return <TankDetail key={id} id={id} />;
}

function TankDetail({ id }: { id: TankId }) {
  const device = useAppSelector(selectDevice(id));
  const robotDevice = useAppSelector(selectDevice('robot-1'));
  const { vehicles, batches } = useAppSelector((state) => state.process);
  const { disconnected } = useDeviceLive();
  const tank = device?.type === 'tank' ? device : null;
  const robot = robotDevice?.type === 'robot' ? (robotDevice as RobotState) : null;
  const name = DEVICE_NAMES[id];
  const activity = sectorActivity(id, vehicles, batches, robot);

  return (
    <DevicePage
      illustrated
      hero={
        <DeviceHero
          name={name}
          status={tank?.status ?? null}
          activity={tank ? (activity.now ?? '하역·집기 없이 대기 중') : null}
          updatedAt={tank?.updatedAt ?? null}
          back={{ to: '/tanks', label: '섹터 목록' }}
          illustration={
            <div className="flex h-full items-center justify-center p-2 md:p-4">
              <SectorBin
                fillPercent={tank?.fillPercent ?? null}
                cautionPercent={tank?.cautionThresholdPercent ?? null}
                label={tank ? binLabel(name, tank, disconnected) : `${name} 그림, 불러오는 중`}
                className="h-full w-full"
              />
            </div>
          }
        />
      }
      tiles={
        <KeyTiles
          tiles={[
            { label: '적재율', value: tank ? oneDecimal(tank.fillPercent) : null, unit: '%' },
            { label: '부피', value: tank ? oneDecimal(tank.volumeM3) : null, unit: 'm³', sub: tank ? `/ ${oneDecimal(tank.capacityM3)}` : undefined },
            { label: '수분', value: tank ? oneDecimal(tank.moisturePercent) : null, unit: '%' },
            { label: '등급', value: tank ? tank.grade : null, unit: '등급' },
          ]}
        />
      }
      now={<NowNext now={activity.now} next={activity.next} />}
      actions={<DeviceActionBar deviceId={id} />}
      details={
        <DetailsSection
          side={
            <>
              <Card title="기준값 설정" aria-label="기준값 설정" className="flex flex-col gap-4">
                {DEVICE_SETTINGS.tank.map((field) => (
                  <SettingForm key={field.key} deviceId={id} field={field} />
                ))}
              </Card>
              <DeviceAlarmHistory deviceId={id} />
            </>
          }
        >
          <HistoryPanel deviceId={id} metrics={HISTORY_METRICS.tank} />
        </DetailsSection>
      }
      records={<SectorUnloads id={id} />}
    />
  );
}
