import { Link } from 'react-router-dom';
import type { CompressorState } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { SettingForm } from '../../components/controls/SettingForm';
import { DeviceActionBar } from '../../components/device/ActionBar';
import { DetailsSection } from '../../components/device/DetailsSection';
import { DeviceHero } from '../../components/device/DeviceHero';
import { DevicePage } from '../../components/device/DevicePage';
import { KeyTiles } from '../../components/device/KeyTile';
import { useDeviceLive } from '../../components/device/live';
import { NowNext } from '../../components/device/NowNext';
import { COMPRESSOR_CYCLE_TEXT, DEVICE_NAMES, HISTORY_METRICS, formatCount } from '../../config/display';
import { batchBalePath } from '../../config/navigation';
import { DEVICE_SETTINGS } from '../../config/settings';
import { useAppSelector } from '../../store/hooks';
import { selectDevice, selectPlantSummary } from '../../store/selectors';
import { usePlantTrends } from '../../store/usePlantTrends';
import { DeviceAlarmHistory } from '../history/DeviceAlarmHistory';
import { HistoryPanel } from '../history/HistoryPanel';
import { useDeviceTrend } from '../history/useDeviceTrend';
import { BalerArt } from './BalerArt';
import { batchLine, compressorActivity, compressorBatches } from './compressorText';

const oneDecimal = (n: number) => n.toFixed(1);

/**
 * 압축기 기기 페이지 (DevicePage 틀): 맨 위 베일러 그림과 원형 압력 게이지(지금 압력 vs 지금 배치의 목표)·온도,
 * 주요 수치(압력·온도·오늘 베일·사이클 단계), 지금/다음(지금 배치와 배치·베일 화면 링크), 자세히(이력 그래프·설정·알람 이력·점검 이력).
 * 설정 변경은 위험도가 높아 "자세히" 안에서만, 확인 단계를 거쳐 보낸다. 배치 수동 제어는 배치·베일 화면이 맡는다.
 */
export function CompressorPage() {
  const device = useAppSelector(selectDevice('compressor-1'));
  const summary = useAppSelector(selectPlantSummary);
  const batches = useAppSelector((state) => state.process.batches);
  const { disconnected } = useDeviceLive();
  const c = device?.type === 'compressor' ? (device as CompressorState) : null;
  const { current, next } = compressorBatches(batches);
  const live = !disconnected && !!c;
  const pressureTrend = useDeviceTrend('compressor-1', 'pressure', live);
  const temperatureTrend = useDeviceTrend('compressor-1', 'temperature', live);
  const plantTrends = usePlantTrends(live);
  const shown = disconnected ? null : c;

  return (
    <DevicePage
      hero={
        <DeviceHero
          name={DEVICE_NAMES['compressor-1']}
          status={c?.status ?? null}
          activity={c ? compressorActivity(c, current) : null}
          updatedAt={c?.updatedAt ?? null}
          illustration={
            <BalerArt
              pressureMpa={shown?.pressureMpa ?? null}
              temperatureC={shown?.temperatureC ?? null}
              targetMpa={disconnected ? null : (current?.targetPressureMpa ?? null)}
              stage={c?.cycleStage ?? null}
              running={c?.running ?? false}
            />
          }
        />
      }
      tiles={
        <KeyTiles
          tiles={[
            {
              label: '압력',
              value: c ? oneDecimal(c.pressureMpa) : null,
              unit: 'MPa',
              ...(current ? { sub: `/ ${oneDecimal(current.targetPressureMpa)}` } : {}),
              ...(pressureTrend ? { trend: pressureTrend } : {}),
            },
            { label: '온도', value: c ? oneDecimal(c.temperatureC) : null, unit: '°C', ...(temperatureTrend ? { trend: temperatureTrend } : {}) },
            {
              label: '오늘 베일',
              value: summary ? formatCount(summary.balesToday) : null,
              unit: '개',
              ...(plantTrends.balesToday ? { trend: plantTrends.balesToday } : {}),
            },
            { label: '사이클 단계', value: c ? (c.running ? COMPRESSOR_CYCLE_TEXT[c.cycleStage] : '정지') : null, kind: 'text' },
          ]}
        />
      }
      now={
        <NowNext
          now={
            current ? (
              <span className="flex flex-col items-start">
                <span>{batchLine(current)}</span>
                <Link to={batchBalePath} className="inline-flex min-h-12 items-center text-sm font-semibold text-accent-strong underline">
                  배치·베일에서 보기
                </Link>
              </span>
            ) : null
          }
          next={next ? batchLine(next) : null}
        />
      }
      actions={<DeviceActionBar deviceId="compressor-1" />}
      details={
        <DetailsSection>
          <HistoryPanel deviceId="compressor-1" metrics={HISTORY_METRICS.compressor} />
          <Card title="설정" aria-label="설정" className="flex flex-col gap-4">
            {DEVICE_SETTINGS.compressor.map((field) => (
              <SettingForm key={field.key} deviceId="compressor-1" field={field} />
            ))}
          </Card>
          <DeviceAlarmHistory deviceId="compressor-1" />
          <Card title="점검 이력" aria-label="점검 이력">
            <p className="text-ink-soft">
              점검 기록은 서버가 값을 제공해야 표시할 수 있습니다. 현재 API 명세에는 이 값이 없어 서버 담당과 확인 중입니다.
            </p>
          </Card>
        </DetailsSection>
      }
    />
  );
}
