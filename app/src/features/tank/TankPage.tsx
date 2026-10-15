import { Link, useParams } from 'react-router-dom';
import { TANK_IDS } from '@ecocycle/shared';
import type { TankId } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { SettingForm } from '../../components/controls/SettingForm';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { useDisplayStatus } from '../../components/status/useDisplayStatus';
import { BAR_CLASS } from '../../components/status/tone';
import { DEVICE_NAMES, HISTORY_METRICS, formatPercent, formatVolumeM3 } from '../../config/display';
import { DEVICE_SETTINGS } from '../../config/settings';
import { useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { DeviceAlarmHistory } from '../history/DeviceAlarmHistory';
import { HistoryPanel } from '../history/HistoryPanel';

const isTankId = (value: string | undefined): value is TankId => !!value && (TANK_IDS as readonly string[]).includes(value);

function Stat({ label, value, dim }: { label: string; value: string; dim: boolean }) {
  return (
    <Card title={label}>
      <p className={`text-2xl font-bold ${dim ? 'text-slate-400' : 'text-slate-900'}`}>{value}</p>
    </Card>
  );
}

/**
 * 탱크 기기 페이지 = "왜 그런가, 설정은, 이력은": 현재 값, 이력 그래프, 기준값 설정, 알람 이력.
 * 설정 변경은 위험도가 높아 이 페이지에서만, 확인 단계를 거쳐 보낸다.
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
  return <TankDetail id={id} />;
}

function TankDetail({ id }: { id: TankId }) {
  const tank = useAppSelector(selectDevice(id));
  const { disconnected, show } = useDisplayStatus();
  const t = tank?.type === 'tank' ? tank : null;
  const status = t ? show(t.status) : 'offline';
  const level = t ? Math.min(100, Math.max(0, t.fillPercent)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/tanks" className="inline-flex min-h-12 items-center text-sm font-medium text-slate-700 underline">
          ◀ 섹터 목록
        </Link>
        <h1 className="text-xl font-bold">{DEVICE_NAMES[id]}</h1>
        {t && <StatusBadge status={status} />}
        {t && (
          <span className="text-xs text-slate-500">
            {disconnected ? '마지막으로 받은 값 · ' : ''}마지막 갱신 <Timestamp iso={t.updatedAt} />
          </span>
        )}
      </div>

      {!t ? (
        <p role="status" className="text-slate-500">
          섹터 상태를 불러오는 중…
        </p>
      ) : (
        <section aria-label="현재 상태" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card title="적재율(수위)">
            <p className={`text-2xl font-bold ${disconnected ? 'text-slate-400' : 'text-slate-900'}`}>{formatPercent(t.fillPercent)}</p>
            <div
              role="meter"
              aria-label="수위"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level)}
              className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200"
            >
              <div className={`h-full ${BAR_CLASS[status]}`} style={{ width: `${level}%` }} />
            </div>
          </Card>
          <Stat label="부피(용량)" value={`${formatVolumeM3(t.volumeM3)} / ${formatVolumeM3(t.capacityM3)}`} dim={disconnected} />
          <Stat label="수분" value={formatPercent(t.moisturePercent)} dim={disconnected} />
        </section>
      )}

      <HistoryPanel deviceId={id} metrics={HISTORY_METRICS.tank} />

      <Card title="기준값 설정" aria-label="기준값 설정" className="flex flex-col gap-4">
        {DEVICE_SETTINGS.tank.map((field) => (
          <SettingForm key={field.key} deviceId={id} field={field} />
        ))}
      </Card>

      <DeviceAlarmHistory deviceId={id} />
    </div>
  );
}
