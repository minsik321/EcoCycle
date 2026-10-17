import type { ConveyorState } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { SettingForm } from '../../components/controls/SettingForm';
import { DeviceActionBar } from '../../components/device/ActionBar';
import { DetailsSection } from '../../components/device/DetailsSection';
import { DeviceHero } from '../../components/device/DeviceHero';
import { DevicePage } from '../../components/device/DevicePage';
import { KeyTiles } from '../../components/device/KeyTile';
import { useDeviceLive } from '../../components/device/live';
import { NowNext } from '../../components/device/NowNext';
import { DEVICE_NAMES, HISTORY_METRICS, formatCount } from '../../config/display';
import { mixPercentText, shortId } from '../../config/processDisplay';
import { DEVICE_SETTINGS } from '../../config/settings';
import { useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { DeviceAlarmHistory } from '../history/DeviceAlarmHistory';
import { HistoryPanel } from '../history/HistoryPanel';
import { useDeviceTrend } from '../history/useDeviceTrend';

function conveyorActivity(c: ConveyorState): string {
  if (!c.running) return '정지 상태입니다';
  return c.itemsToBaler > 0 ? `압축기로 ${c.itemsToBaler}덩어리 이송 중` : '빈 벨트로 가동 중';
}

/**
 * 컨베이어(Section Z) 기기 페이지 (DevicePage 틀, 그림 없음): 머리 줄, 주요 수치(가동·적재 정도·압축기로 가는 중),
 * 지금/다음(배합 중인 배치를 압축기로 이송, 다음 배치), 자세히(이력 그래프·속도 설정·알람 이력).
 * 설정 변경은 위험도가 높아 "자세히" 안에서만, 확인 단계를 거쳐 보낸다.
 */
export function ConveyorPage() {
  const device = useAppSelector(selectDevice('conveyor-z'));
  const batches = useAppSelector((state) => state.process.batches);
  const { disconnected } = useDeviceLive();
  const c = device?.type === 'conveyor' ? (device as ConveyorState) : null;
  const loadTrend = useDeviceTrend('conveyor-z', 'load', !disconnected && !!c);
  const mixing = batches.find((b) => b.stage === 'mixing');
  const planned = batches.find((b) => b.stage === 'planned');

  return (
    <DevicePage
      hero={
        <DeviceHero
          name={DEVICE_NAMES['conveyor-z']}
          status={c?.status ?? null}
          activity={c ? conveyorActivity(c) : null}
          updatedAt={c?.updatedAt ?? null}
        />
      }
      tiles={
        <KeyTiles
          wide
          tiles={[
            { label: '가동', value: c ? (c.running ? '가동' : '정지') : null, kind: 'text' },
            { label: '적재 정도', value: c ? formatCount(c.loadPercent) : null, unit: '%', ...(loadTrend ? { trend: loadTrend } : {}) },
            { label: '압축기로 가는 중', value: c ? formatCount(c.itemsToBaler) : null, unit: '덩어리' },
          ]}
        />
      }
      now={
        <NowNext
          now={mixing ? `배치 ${shortId(mixing.id)} 파지를 압축기로 이송` : null}
          next={planned ? `배치 ${shortId(planned.id)} (${mixPercentText(planned)})` : null}
        />
      }
      actions={<DeviceActionBar deviceId="conveyor-z" />}
      details={
        <DetailsSection
          side={
            <>
              <Card title="설정" aria-label="설정" className="flex flex-col gap-4">
                {DEVICE_SETTINGS.conveyor.map((field) => (
                  <SettingForm key={field.key} deviceId="conveyor-z" field={field} />
                ))}
              </Card>
              <DeviceAlarmHistory deviceId="conveyor-z" />
            </>
          }
        >
          <HistoryPanel deviceId="conveyor-z" metrics={HISTORY_METRICS.conveyor} />
        </DetailsSection>
      }
    />
  );
}
